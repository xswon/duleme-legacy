import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { ActiveTab, Article, Feed, FilterType } from "../types";
import type { TimelineContentFilter } from "../services/router";
import { buildArticleIndexById, buildArticleLookup, getArticleByLogicalOffset } from "../services/articleIndex";
import { deriveArticleMetrics } from "../services/articleMetrics";
import { deriveTimeline } from "../services/articleVisibility";
import { searchArticles } from "../services/searchService";
import { subscribeToLocalDayRefresh } from "../services/localDayRefresh";

interface UseReaderDerivedStateOptions {
  articles: Article[];
  feeds: Feed[];
  activeTab: ActiveTab;
  filterType: FilterType;
  contentType: TimelineContentFilter;
  selectedFeedId: string | null;
  selectedCategory: string | null;
  selectedArticleId: string | null;
  searchQuery: string;
  historyWindowDays: number;
  timelineSortOrder: "newest" | "oldest";
}

export function useReaderDerivedState(options: UseReaderDerivedStateOptions) {
  const {
    articles, feeds, activeTab, filterType, contentType, selectedFeedId, selectedCategory,
    selectedArticleId, searchQuery, historyWindowDays, timelineSortOrder,
  } = options;
  const [localDayVersion, setLocalDayVersion] = useState(0);
  useEffect(() => subscribeToLocalDayRefresh(() => setLocalDayVersion((version) => version + 1)), []);

  const articleLookup = useMemo(() => buildArticleLookup(articles), [articles]);
  const selectedArticle = selectedArticleId ? articleLookup.byId.get(selectedArticleId) || null : null;
  // localDayVersion intentionally refreshes the time-windowed metric at local midnight.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- The clock tick is not a value read by the memo callback.
  const articleMetrics = useMemo(() => deriveArticleMetrics(articles, Date.now()), [articles, localDayVersion]);
  const effectiveContentType = selectedFeedId ? "all" : contentType;
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const searchResults = useMemo(
    () => activeTab === "search" ? searchArticles(articles, deferredSearchQuery) : [],
    [activeTab, articles, deferredSearchQuery],
  );
  const timelineDerivation = useMemo(() => activeTab === "feeds" ? deriveTimeline(articles, feeds, {
    filterType,
    contentType: effectiveContentType,
    selectedFeedId,
    selectedCategory,
    searchQuery,
    historyWindowDays,
    sortOrder: timelineSortOrder,
  // localDayVersion intentionally refreshes the time-windowed timeline at local midnight.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- The clock tick is not a value read by the memo callback.
  }) : null, [activeTab, articles, effectiveContentType, feeds, filterType, historyWindowDays, localDayVersion, searchQuery, selectedCategory, selectedFeedId, timelineSortOrder]);
  const visibleDerivation = useMemo(() => {
    if (timelineDerivation) return timelineDerivation;
    const visibleArticles = activeTab === "search"
      ? searchResults.map(({ article }) => article)
      : activeTab === "saved"
        ? articles.filter((article) => article.starred)
        : articles;
    return {
      visibleArticles,
      olderArticleCount: 0,
      visibleUnreadCount: visibleArticles.reduce((count, article) => count + (article.read ? 0 : 1), 0),
    };
  }, [activeTab, articles, searchResults, timelineDerivation]);
  const visibleIndexById = useMemo(() => buildArticleIndexById(visibleDerivation.visibleArticles), [visibleDerivation.visibleArticles]);
  const nextArticle = selectedArticle
    ? getArticleByLogicalOffset(visibleDerivation.visibleArticles, visibleIndexById, selectedArticle.id, 1)
    : undefined;
  const previousArticle = selectedArticle
    ? getArticleByLogicalOffset(visibleDerivation.visibleArticles, visibleIndexById, selectedArticle.id, -1)
    : undefined;

  return {
    articleLookup,
    selectedArticle,
    articleMetrics,
    effectiveContentType,
    showTimelineFilters: activeTab === "feeds" && filterType !== "starred" && !selectedFeedId,
    deferredSearchQuery,
    searchResults,
    ...visibleDerivation,
    visibleIndexById,
    nextArticle,
    previousArticle,
  };
}
