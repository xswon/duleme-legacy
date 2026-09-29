import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Article } from "../types";
import { BatchMutationCoordinator } from "../services/batchMutation";
import { OptimisticArticleMutationTracker, type ArticleMutationToken } from "../services/optimisticArticleMutation";
import { updateStoredArticleStatus, updateStoredArticlesStatus } from "../services/rssService";
import { getUnreadArticleIds } from "../services/articleVisibility";

interface UseArticleMutationsOptions {
  articlesRef: MutableRefObject<Article[]>;
  setArticles: Dispatch<SetStateAction<Article[]>>;
  visibleArticlesRef: MutableRefObject<Article[]>;
  showToast: (message: string) => void;
  showToastWithAction: (message: string, action: { label: string; run: () => void }) => void;
}

export function useArticleMutations({
  articlesRef,
  setArticles,
  visibleArticlesRef,
  showToast,
  showToastWithAction,
}: UseArticleMutationsOptions) {
  const mutationTrackerRef = useRef(new OptimisticArticleMutationTracker());
  const batchReadMutationRef = useRef(new BatchMutationCoordinator());
  const readUndoRef = useRef<string[] | null>(null);
  const readUndoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const installArticles = useCallback((articles: Article[]) => {
    articlesRef.current = articles;
    setArticles(articles);
  }, [articlesRef, setArticles]);

  const persistPatch = useCallback((articleId: string, patch: Partial<Article>, failureMessage: string) => {
    const previous = articlesRef.current.find((article) => article.id === articleId);
    if (!previous) return;
    const token = mutationTrackerRef.current.begin(articleId, patch);
    installArticles(articlesRef.current.map((article) => article.id === articleId ? { ...article, ...patch } : article));
    void updateStoredArticleStatus(articleId, patch).catch((error) => {
      installArticles(mutationTrackerRef.current.restoreIfCurrent(articlesRef.current, previous, token));
      console.warn("Failed to persist article mutation:", error);
      showToast(failureMessage);
    });
  }, [articlesRef, installArticles, showToast]);

  const patchArticle = useCallback((articleId: string, patch: Partial<Article>) => {
    persistPatch(articleId, patch, "文章保存失败，请重试");
  }, [persistPatch]);

  const toggleStar = useCallback((articleId: string) => {
    const article = articlesRef.current.find((item) => item.id === articleId);
    if (article) persistPatch(articleId, {
      starred: !article.starred,
      savedAt: !article.starred ? new Date().toISOString() : undefined,
    }, "收藏保存失败，请重试");
  }, [articlesRef, persistPatch]);

  const toggleRead = useCallback((articleId: string) => {
    const article = articlesRef.current.find((item) => item.id === articleId);
    if (article) persistPatch(articleId, { read: !article.read }, "已读状态保存失败，请重试");
  }, [articlesRef, persistPatch]);

  const clearFavorites = useCallback(async () => {
    const favoriteIds = articlesRef.current.filter((article) => article.starred).map((article) => article.id);
    if (favoriteIds.length === 0) {
      showToast("收藏已清空");
      return;
    }
    const favoriteIdSet = new Set(favoriteIds);
    const previousFavorites = new Map<string, Article>(articlesRef.current.filter((article) => favoriteIdSet.has(article.id)).map((article) => [article.id, article]));
    const tokens = new Map<string, ArticleMutationToken>(favoriteIds.map((articleId) => [articleId, mutationTrackerRef.current.begin(articleId, { starred: false, savedAt: undefined })]));
    installArticles(articlesRef.current.map((article) => favoriteIdSet.has(article.id) ? { ...article, starred: false, savedAt: undefined } : article));
    try {
      await updateStoredArticlesStatus(favoriteIds, { starred: false, savedAt: undefined });
      showToast("收藏已清空");
    } catch (error) {
      console.warn("Failed to clear favorites:", error);
      let restored = articlesRef.current;
      previousFavorites.forEach((previous, articleId) => {
        const token = tokens.get(articleId);
        if (token) restored = mutationTrackerRef.current.restoreIfCurrent(restored, previous, token);
      });
      installArticles(restored);
      showToast("收藏清空失败，请重试");
    }
  }, [articlesRef, installArticles, showToast]);

  const undoMarkAllRead = useCallback(async function undoBatchRead() {
    const ids = readUndoRef.current;
    if (!ids?.length) return;
    if (batchReadMutationRef.current.isPending) {
      showToast("已读状态正在保存，请稍候");
      return;
    }
    const idSet = new Set(ids);
    const previousArticles = new Map<string, Article>(articlesRef.current.filter((article) => idSet.has(article.id)).map((article) => [article.id, article]));
    const tokens = new Map<string, ArticleMutationToken>(ids.map((articleId) => [articleId, mutationTrackerRef.current.begin(articleId, { read: false })]));
    readUndoRef.current = null;
    if (readUndoTimer.current) clearTimeout(readUndoTimer.current);
    const result = await batchReadMutationRef.current.execute({
      optimistic: () => installArticles(articlesRef.current.map((article) => idSet.has(article.id) ? { ...article, read: false } : article)),
      persist: () => updateStoredArticlesStatus(ids, { read: false }),
      rollback: () => {
        let restored = articlesRef.current;
        previousArticles.forEach((previous, articleId) => {
          const token = tokens.get(articleId);
          if (token) restored = mutationTrackerRef.current.restoreIfCurrent(restored, previous, token);
        });
        installArticles(restored);
        readUndoRef.current = ids;
      },
      onError: () => {
        readUndoTimer.current = setTimeout(() => { readUndoRef.current = null; }, 5000);
        showToastWithAction("撤销保存失败，文章仍保持已读", { label: "重试撤销", run: () => { void undoBatchRead(); } });
      },
    });
    if (result === "success") showToast("已撤销批量已读");
  }, [articlesRef, installArticles, showToast, showToastWithAction]);

  const markAllRead = useCallback(async () => {
    if (batchReadMutationRef.current.isPending) {
      showToast("已读状态正在保存，请稍候");
      return;
    }
    const ids = getUnreadArticleIds(visibleArticlesRef.current);
    if (ids.length === 0) {
      showToast("当前可见范围没有未读文章");
      return;
    }
    const idSet = new Set(ids);
    const previousArticles = new Map<string, Article>(articlesRef.current.filter((article) => idSet.has(article.id)).map((article) => [article.id, article]));
    const tokens = new Map<string, ArticleMutationToken>(ids.map((articleId) => [articleId, mutationTrackerRef.current.begin(articleId, { read: true })]));
    const result = await batchReadMutationRef.current.execute({
      optimistic: () => installArticles(articlesRef.current.map((article) => idSet.has(article.id) ? { ...article, read: true } : article)),
      persist: () => updateStoredArticlesStatus(ids, { read: true }),
      rollback: () => {
        let restored = articlesRef.current;
        previousArticles.forEach((previous, articleId) => {
          const token = tokens.get(articleId);
          if (token) restored = mutationTrackerRef.current.restoreIfCurrent(restored, previous, token);
        });
        installArticles(restored);
      },
      onError: () => showToast("批量标记已读保存失败，已恢复原状态，请重试"),
    });
    if (result !== "success") return;
    readUndoRef.current = ids;
    if (readUndoTimer.current) clearTimeout(readUndoTimer.current);
    readUndoTimer.current = setTimeout(() => { readUndoRef.current = null; }, 5000);
    showToastWithAction(`已将当前可见范围的 ${ids.length} 篇文章标为已读`, { label: "撤销", run: () => { void undoMarkAllRead(); } });
  }, [articlesRef, installArticles, showToast, showToastWithAction, undoMarkAllRead, visibleArticlesRef]);

  useEffect(() => () => {
    if (readUndoTimer.current) clearTimeout(readUndoTimer.current);
  }, []);

  return { persistPatch, patchArticle, toggleStar, toggleRead, clearFavorites, markAllRead, undoMarkAllRead };
}
