import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Article, Feed } from "../types";
import type { ReaderRoute } from "../services/router";
import type { FeedOrderByFolder } from "../services/feedSorting";
import {
  appendFeedToFolder,
  moveFeedToFolder,
  moveFolderToUncategorized,
  removeFeedFromOrder,
  renameFolderInOrder,
} from "../services/feedSorting";
import { saveStoredArticles, updateStoredArticlesStatus } from "../services/rssService";
import { resolveKnownEnrichmentSource, resolveKnownPrimaryFeedUrl } from "../data/defaultFeeds";
import { resolveFeedEnrichmentSource, updateFeedEnrichment, type FeedUrlChanges } from "../services/feedEnrichment";
import { deleteFeedAndArticlesFromDB, updateFeedAndDeleteArticlesFromDB } from "../services/dbService";

interface UseFeedManagementOptions {
  feeds: Feed[];
  setFeeds: Dispatch<SetStateAction<Feed[]>>;
  feedsRef: MutableRefObject<Feed[]>;
  articlesRef: MutableRefObject<Article[]>;
  setArticles: Dispatch<SetStateAction<Article[]>>;
  categories: string[];
  setCategories: Dispatch<SetStateAction<string[]>>;
  setFeedOrderByFolder: Dispatch<SetStateAction<FeedOrderByFolder>>;
  selectedFeedId: string | null;
  setSelectedFeedId: Dispatch<SetStateAction<string | null>>;
  selectedCategory: string | null;
  setSelectedCategory: Dispatch<SetStateAction<string | null>>;
  selectedArticle: Article | null;
  setSelectedArticleId: Dispatch<SetStateAction<string | null>>;
  isSettingsOpen: boolean;
  navigateToRoute: (route: Partial<ReaderRoute>, replace?: boolean) => void;
  queueRefresh: (feedIds: string[]) => void;
  invalidateRefresh: () => void;
  showToast: (message: string) => void;
}

export function useFeedManagement(options: UseFeedManagementOptions) {
  const {
    feeds, setFeeds, feedsRef, articlesRef, setArticles, categories, setCategories, setFeedOrderByFolder,
    selectedFeedId, setSelectedFeedId, selectedCategory, setSelectedCategory,
    selectedArticle, setSelectedArticleId, isSettingsOpen, navigateToRoute,
    queueRefresh, invalidateRefresh, showToast,
  } = options;

  const addFeed = useCallback(async (newFeed: Feed, newArticles: Article[] = []) => {
    if (newArticles.length > 0) {
      try {
        await saveStoredArticles(newArticles);
      } catch (error) {
        console.warn("Failed to save articles for a new feed:", error);
        showToast("订阅内容保存失败，未添加订阅源，请重试");
        return false;
      }
    }
    setFeeds((current) => [newFeed, ...current.filter((feed) => feed.id !== newFeed.id)]);
    setFeedOrderByFolder((current) => appendFeedToFolder(removeFeedFromOrder(current, newFeed.id), newFeed));
    const category = newFeed.category?.trim() || "未分类";
    setCategories((current) => current.includes(category) ? current : [...current, category]);
    if (newArticles.length > 0) setArticles((current) => {
      const existingIds = new Set(current.map((article) => article.id));
      return [...newArticles.filter((article) => !existingIds.has(article.id)), ...current];
    });
    if (!isSettingsOpen) navigateToRoute({ activeTab: "feeds", filterType: "all", selectedFeedId: newFeed.id, selectedCategory: null, articleId: null, detailTab: undefined });
    return true;
  }, [isSettingsOpen, navigateToRoute, setArticles, setCategories, setFeedOrderByFolder, setFeeds, showToast]);

  const deleteFeed = useCallback(async (feedId: string) => {
    try {
      await deleteFeedAndArticlesFromDB(feedId);
    } catch (error) {
      console.warn("Failed to delete feed articles:", error);
      showToast("取消订阅失败，本地文章未删除，请重试");
      return;
    }
    invalidateRefresh();
    setFeeds((current) => current.filter((feed) => feed.id !== feedId));
    setFeedOrderByFolder((current) => removeFeedFromOrder(current, feedId));
    setArticles((current) => current.filter((article) => article.feedId !== feedId));
    if (selectedFeedId === feedId) setSelectedFeedId(null);
  }, [invalidateRefresh, selectedFeedId, setArticles, setFeedOrderByFolder, setFeeds, setSelectedFeedId, showToast]);

  const addCategory = useCallback((name: string): string | undefined => {
    const trimmed = name.trim();
    if (!trimmed) return "请输入文件夹名称";
    if (categories.some((category) => category.trim() === trimmed)) return "已有同名文件夹";
    setCategories((current) => [...current, trimmed]);
    showToast(`已创建文件夹「${trimmed}」`);
    return undefined;
  }, [categories, setCategories, showToast]);

  const renameCategory = useCallback((oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    setCategories((current) => current.map((category) => category === oldName ? trimmed : category));
    setFeedOrderByFolder((current) => renameFolderInOrder(current, oldName, trimmed));
    setFeeds((current) => current.map((feed) => feed.category === oldName ? { ...feed, category: trimmed } : feed));
    if (selectedCategory === oldName) setSelectedCategory(trimmed);
  }, [selectedCategory, setCategories, setFeedOrderByFolder, setFeeds, setSelectedCategory]);

  const deleteCategory = useCallback((name: string) => {
    const hasFeeds = feeds.some((feed) => (feed.category || "未分类") === name);
    setCategories((current) => Array.from(new Set(hasFeeds
      ? current.map((category) => category === name ? "未分类" : category)
      : current.filter((category) => category !== name))));
    setFeedOrderByFolder((current) => moveFolderToUncategorized(current, name));
    setFeeds((current) => current.map((feed) => feed.category === name ? { ...feed, category: "未分类" } : feed));
    if (selectedCategory === name) setSelectedCategory(null);
  }, [feeds, selectedCategory, setCategories, setFeedOrderByFolder, setFeeds, setSelectedCategory]);

  const updateFeedCategory = useCallback((feedId: string, newCategory: string) => {
    const currentFeed = feeds.find((feed) => feed.id === feedId);
    setFeeds((current) => current.map((feed) => feed.id === feedId ? { ...feed, category: newCategory } : feed));
    if (currentFeed) setFeedOrderByFolder((current) => moveFeedToFolder(current, feedId, currentFeed.category || "未分类", newCategory || "未分类"));
  }, [feeds, setFeedOrderByFolder, setFeeds]);

  const reorderFolderFeeds = useCallback((category: string, feedIds: string[]) => {
    setFeedOrderByFolder((current) => ({ ...current, [category]: [...feedIds] }));
  }, [setFeedOrderByFolder]);

  const updateFeedUrls = useCallback(async (feedId: string, urls: FeedUrlChanges) => {
    const currentFeed = feeds.find((feed) => feed.id === feedId);
    const feedUrlChanged = !!currentFeed && currentFeed.feedUrl !== urls.feedUrl;
    const lastUpdated = new Date().toISOString();
    const updatedFeed = currentFeed && { ...updateFeedEnrichment(currentFeed, urls), lastUpdated };
    const sourceChanged = !!currentFeed && !!updatedFeed &&
      resolveFeedEnrichmentSource(currentFeed).bidclubFeedUrl !== resolveFeedEnrichmentSource(updatedFeed).bidclubFeedUrl;
    const enrichmentChanged = sourceChanged || currentFeed?.enrichmentDisabled !== updatedFeed?.enrichmentDisabled;
    if (feedUrlChanged || enrichmentChanged) invalidateRefresh();
    if (feedUrlChanged && updatedFeed) {
      try {
        await updateFeedAndDeleteArticlesFromDB(updatedFeed);
      } catch (error) {
        console.warn("Failed to clear articles after changing a feed URL:", error);
        showToast("订阅地址更新失败，本地文章未删除，请重试");
        return;
      }
    }
    if (!feedUrlChanged && enrichmentChanged) {
      const articleIds = articlesRef.current.filter((article) => article.feedId === feedId && article.enrichment).map((article) => article.id);
      try {
        await updateStoredArticlesStatus(articleIds, { enrichment: undefined });
      } catch (error) {
        console.warn("Failed to clear old enhancement references:", error);
        showToast("内容增强设置更新失败，请重试");
        return;
      }
      setArticles((current) => current.map((article) => article.feedId === feedId && article.enrichment
        ? { ...article, enrichment: undefined } : article));
    }
    setFeeds((current) => current.map((feed) => feed.id === feedId
      ? { ...updateFeedEnrichment(feed, urls), lastUpdated }
      : feed));
    if (feedUrlChanged) {
      setArticles((current) => current.filter((article) => article.feedId !== feedId));
      if (selectedArticle?.feedId === feedId) setSelectedArticleId(null);
    }
  }, [articlesRef, feeds, invalidateRefresh, selectedArticle, setArticles, setFeeds, setSelectedArticleId, showToast]);

  const importOpmlFile = useCallback(async (file: File): Promise<boolean> => {
    try {
      const xmlDoc = new DOMParser().parseFromString(await file.text(), "text/xml");
      const allOutlines = Array.from(xmlDoc.querySelectorAll("outline"));
      if (xmlDoc.querySelector("parsererror")) throw new Error("XML 格式无效");
      const importedFeeds: Feed[] = [];
      let invalidCount = 0;
      allOutlines.forEach((node, index) => {
        const xmlUrl = node.getAttribute("xmlUrl");
        if (!xmlUrl) {
          if (node.getAttribute("type") !== "folder") invalidCount += 1;
          return;
        }
        try { new URL(xmlUrl); } catch { invalidCount += 1; return; }
        importedFeeds.push({
          id: `opml-${Date.now()}-${index}`,
          title: node.getAttribute("title") || node.getAttribute("text") || `导入源 ${index + 1}`,
          feedUrl: xmlUrl,
          siteUrl: node.getAttribute("htmlUrl") || xmlUrl,
          category: node.parentElement?.getAttribute("title") || node.parentElement?.getAttribute("text") || "未分类",
          unreadCount: 0,
        });
      });
      if (importedFeeds.length === 0) {
        showToast(`OPML 导入：新增 0，重复 0，无效 ${invalidCount || allOutlines.length}`);
        return false;
      }
      const normalized = importedFeeds.map((feed) => {
        const feedUrl = resolveKnownPrimaryFeedUrl(feed.feedUrl);
        return { ...feed, feedUrl, ...resolveKnownEnrichmentSource(feedUrl) };
      });
      const existingUrls = new Set(feedsRef.current.map((feed) => feed.feedUrl.trim().toLowerCase()));
      const seenUrls = new Set<string>();
      const newFeeds = normalized.filter((feed) => {
        const key = feed.feedUrl.trim().toLowerCase();
        if (existingUrls.has(key) || seenUrls.has(key)) return false;
        seenUrls.add(key);
        return true;
      });
      setFeeds((current) => [...newFeeds, ...current]);
      setCategories((current) => Array.from(new Set([...current, ...newFeeds.map((feed) => feed.category || "未分类")])));
      queueRefresh(newFeeds.map((feed) => feed.id));
      showToast(`OPML 导入：新增 ${newFeeds.length}，重复 ${normalized.length - newFeeds.length}，无效 ${invalidCount}`);
      return newFeeds.length > 0;
    } catch (error) {
      showToast(`OPML 解析失败：${error instanceof Error ? error.message : "未知错误"}`);
      return false;
    }
  }, [feedsRef, queueRefresh, setCategories, setFeeds, showToast]);

  return {
    addFeed,
    deleteFeed,
    addCategory,
    renameCategory,
    deleteCategory,
    updateFeedCategory,
    reorderFolderFeeds,
    reorderCategories: setCategories,
    updateFeedUrls,
    importOpmlFile,
  };
}
