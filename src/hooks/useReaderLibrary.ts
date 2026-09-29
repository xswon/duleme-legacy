import { useEffect, useState } from "react";
import type { Article, Feed } from "../types";
import type { SortMode } from "../services/feedSorting";
import {
  getStoredFeedOrder,
  type FeedOrderByFolder,
} from "../services/feedSorting";
import {
  getStoredArticles,
  getStoredCategories,
  getStoredFeeds,
  getStoredSortMode,
  loadStoredArticlesAsync,
  saveStoredSortMode,
  STORAGE_KEY_FEED_SORT_MODE,
  STORAGE_KEY_FOLDER_SORT_MODE,
} from "../services/rssService";
import { useLatestRef } from "./useLatestRef";

const DEFAULT_CATEGORIES = ["政 | 经 | 史", "科技 | 商业", "投资 | 理财", "人文 | 生活"];

export function useReaderLibrary() {
  const [initialFeeds] = useState<Feed[]>(getStoredFeeds);
  const [feeds, setFeeds] = useState<Feed[]>(initialFeeds);
  const [articles, setArticles] = useState<Article[]>([]);
  const [categories, setCategories] = useState<string[]>(() => getStoredCategories(DEFAULT_CATEGORIES, initialFeeds));
  const [feedOrderByFolder, setFeedOrderByFolder] = useState<FeedOrderByFolder>(() => getStoredFeedOrder(initialFeeds));
  const [feedSortMode, setFeedSortMode] = useState<SortMode>(() => getStoredSortMode(STORAGE_KEY_FEED_SORT_MODE));
  const [folderSortMode, setFolderSortMode] = useState<SortMode>(() => getStoredSortMode(STORAGE_KEY_FOLDER_SORT_MODE));
  const [isInitializing, setIsInitializing] = useState(true);
  const feedsRef = useLatestRef(feeds);
  const articlesRef = useLatestRef(articles);
  const disabledFeedIdsKey = feeds.filter((feed) => feed.enrichmentDisabled === true).map((feed) => feed.id).sort().join("|");

  useEffect(() => saveStoredSortMode(STORAGE_KEY_FEED_SORT_MODE, feedSortMode), [feedSortMode]);
  useEffect(() => saveStoredSortMode(STORAGE_KEY_FOLDER_SORT_MODE, folderSortMode), [folderSortMode]);

  useEffect(() => {
    let cancelled = false;
    const hideDisabledEnrichment = (storedArticles: Article[]) => {
      const disabledFeedIds = new Set(feedsRef.current.filter((feed) => feed.enrichmentDisabled === true).map((feed) => feed.id));
      return storedArticles.map((article) => disabledFeedIds.has(article.feedId)
        ? { ...article, enrichment: undefined } : article);
    };
    loadStoredArticlesAsync()
      .then((storedArticles) => {
        if (cancelled) return;
        setArticles(hideDisabledEnrichment(storedArticles));
      })
      .catch((error) => {
        console.error("Failed to initialize article storage:", error);
        if (!cancelled) setArticles(hideDisabledEnrichment(getStoredArticles()));
      })
      .finally(() => { if (!cancelled) setIsInitializing(false); });
    return () => { cancelled = true; };
  }, [feedsRef]);

  useEffect(() => {
    if (!disabledFeedIdsKey) return;
    const disabledFeedIds = new Set(feedsRef.current.filter((feed) => feed.enrichmentDisabled === true).map((feed) => feed.id));
    setArticles((current) => {
      if (!current.some((article) => disabledFeedIds.has(article.feedId) && article.enrichment)) return current;
      return current.map((article) => disabledFeedIds.has(article.feedId) && article.enrichment
        ? { ...article, enrichment: undefined } : article);
    });
  }, [disabledFeedIdsKey, feedsRef]);

  return {
    feeds, setFeeds, feedsRef,
    articles, setArticles, articlesRef,
    categories, setCategories,
    feedOrderByFolder, setFeedOrderByFolder,
    feedSortMode, setFeedSortMode,
    folderSortMode, setFolderSortMode,
    isInitializing,
  };
}
