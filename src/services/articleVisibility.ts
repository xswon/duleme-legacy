import type { ActiveTab, Article, Feed, FilterType } from "../types";
import type { TimelineContentFilter } from "./router";
import { getPreparedSearchDocument, matchesPreparedSearch, prepareSearchQuery } from "./searchService";

export const DEFAULT_HISTORY_WINDOW_DAYS = 30;
export const HISTORY_WINDOW_STEP_DAYS = 30;

export interface LocalCalendarDayWindow {
  start: number;
  end: number;
  days: number;
}

function normalizeWindowDays(days: number): number {
  if (!Number.isFinite(days)) return DEFAULT_HISTORY_WINDOW_DAYS;
  return Math.max(DEFAULT_HISTORY_WINDOW_DAYS, Math.floor(days));
}

/**
 * Return an inclusive local-calendar-day window. A 30-day window starts at
 * local midnight 29 dates before `now`, rather than 720 hours before `now`.
 * Using calendar setters is intentional: it remains correct across DST.
 */
export function getLocalCalendarDayWindow(
  days = DEFAULT_HISTORY_WINDOW_DAYS,
  now = Date.now(),
): LocalCalendarDayWindow | null {
  if (!Number.isFinite(now)) return null;

  const normalizedDays = normalizeWindowDays(days);
  const startDate = new Date(now);
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - (normalizedDays - 1));
  const start = startDate.getTime();
  if (!Number.isFinite(start)) return null;

  return { start, end: now, days: normalizedDays };
}

function publicationTimestamp(pubDate: string): number | null {
  const publishedAt = new Date(pubDate).getTime();
  return Number.isFinite(publishedAt) ? publishedAt : null;
}

export interface TimelineDerivationOptions {
  selectedFeedId?: string | null;
  selectedCategory?: string | null;
  filterType?: FilterType;
  contentType?: TimelineContentFilter;
  searchQuery?: string;
  historyWindowDays?: number;
  sortOrder?: "newest" | "oldest";
  now?: number;
}

export interface TimelineDerivation {
  visibleArticles: Article[];
  olderArticleCount: number;
  visibleUnreadCount: number;
}

/** Derive the full logical feed timeline with one article pass and one stable sort. */
export function deriveTimeline(
  articles: Article[],
  feeds: Feed[],
  options: TimelineDerivationOptions = {},
): TimelineDerivation {
  const {
    selectedFeedId,
    selectedCategory,
    filterType = "all",
    contentType = "all",
    searchQuery = "",
    historyWindowDays = DEFAULT_HISTORY_WINDOW_DAYS,
    sortOrder = "newest",
    now = Date.now(),
  } = options;
  const categoryFeedIds = selectedCategory
    ? new Set(feeds.filter((feed) => feed.category === selectedCategory).map((feed) => feed.id))
    : null;
  const window = getLocalCalendarDayWindow(historyWindowDays, now);
  const preparedQuery = prepareSearchQuery(searchQuery.trim());
  const visible: Array<{ article: Article; index: number; timestamp: number | null }> = [];
  let olderArticleCount = 0;
  let visibleUnreadCount = 0;

  articles.forEach((article, index) => {
    if (selectedFeedId && article.feedId !== selectedFeedId) return;
    if (categoryFeedIds && !categoryFeedIds.has(article.feedId)) return;
    if (filterType === "unread" && article.read) return;
    if (filterType === "starred" && !article.starred) return;
    if (filterType !== "starred" && contentType === "podcast" && !article.audioUrl?.trim()) return;
    if (filterType !== "starred" && contentType === "article" && article.audioUrl?.trim()) return;
    if (preparedQuery.terms.length > 0 && !matchesPreparedSearch(getPreparedSearchDocument(article), preparedQuery)) return;

    const timestamp = publicationTimestamp(article.pubDate);
    const showsAllHistory = filterType === "starred";
    if (!showsAllHistory && (timestamp === null || !window || timestamp > window.end)) return;
    if (!showsAllHistory && timestamp !== null && window && timestamp < window.start) {
      olderArticleCount += 1;
      return;
    }
    visible.push({ article, index, timestamp });
    if (!article.read) visibleUnreadCount += 1;
  });

  visible.sort((a, b) => {
    if (a.timestamp !== null && b.timestamp !== null) {
      const dateDifference = sortOrder === "oldest"
        ? a.timestamp - b.timestamp
        : b.timestamp - a.timestamp;
      return dateDifference || (sortOrder === "oldest" ? b.index - a.index : a.index - b.index);
    }
    if (a.timestamp !== null) return -1;
    if (b.timestamp !== null) return 1;
    return a.index - b.index;
  });
  return {
    visibleArticles: visible.map(({ article }) => article),
    olderArticleCount,
    visibleUnreadCount,
  };
}

/**
 * The single date-scope rule used by navigation unread counts:
 * valid publication dates from the inclusive 30-day cutoff through `now`.
 * Invalid and future dates are excluded conservatively.
 */
export function isWithinRecencyWindow(pubDate: string, now = Date.now()): boolean {
  return isWithinHistoryWindow(pubDate, DEFAULT_HISTORY_WINDOW_DAYS, now);
}

/** Shared predicate for recent unread navigation counts. */
export function isRecentUnreadArticle(
  article: Pick<Article, "read" | "pubDate">,
  now = Date.now(),
): boolean {
  return !article.read && isWithinRecencyWindow(article.pubDate, now);
}

export function isRecencyLimitedTab(activeTab: ActiveTab): boolean {
  return activeTab === "feeds";
}

export function isOlderThanRecencyWindow(pubDate: string, now = Date.now()): boolean {
  return isOlderThanHistoryWindow(pubDate, DEFAULT_HISTORY_WINDOW_DAYS, now);
}

export function isWithinHistoryWindow(pubDate: string, days: number, now = Date.now()): boolean {
  const publishedAt = publicationTimestamp(pubDate);
  const window = getLocalCalendarDayWindow(days, now);
  if (publishedAt === null || !window) return false;
  return publishedAt >= window.start && publishedAt <= window.end;
}

/** Feed timelines use the same conservative date scope as navigation counts. */
export function isVisibleInHistoryWindow(pubDate: string, days: number, now = Date.now()): boolean {
  return isWithinHistoryWindow(pubDate, days, now);
}

export function isOlderThanHistoryWindow(pubDate: string, days: number, now = Date.now()): boolean {
  const publishedAt = publicationTimestamp(pubDate);
  const window = getLocalCalendarDayWindow(days, now);
  return publishedAt !== null && !!window && publishedAt < window.start;
}

export function countOlderArticles(
  articles: Article[],
  feeds: Feed[],
  selectedFeedId?: string | null,
  selectedCategory?: string | null,
  options: { filterType?: FilterType; contentType?: TimelineContentFilter; searchQuery?: string; historyWindowDays?: number } = {},
  now = Date.now(),
): number {
  return deriveTimeline(articles, feeds, {
    ...options,
    selectedFeedId,
    selectedCategory,
    now,
  }).olderArticleCount;
}

/** Batch actions consume the full logical visible collection, never only mounted virtual rows. */
export function getUnreadArticleIds(visibleArticles: Article[]): string[] {
  return visibleArticles.filter((article) => !article.read).map((article) => article.id);
}

/** Sort a rendered feed timeline newest-first without mutating its source array. */
export function sortArticlesByPubDate<T extends { pubDate?: string | null }>(articles: T[]): T[] {
  return articles
    .map((article, index) => ({ article, index, timestamp: article.pubDate ? new Date(article.pubDate).getTime() : Number.NaN }))
    .sort((a, b) => {
      const aValid = Number.isFinite(a.timestamp);
      const bValid = Number.isFinite(b.timestamp);
      if (aValid && bValid) return b.timestamp - a.timestamp || a.index - b.index;
      if (aValid !== bValid) return aValid ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ article }) => article);
}

export function canAutoMarkRead(article: Article, now = Date.now()): boolean {
  return !article.read && isWithinRecencyWindow(article.pubDate, now);
}
