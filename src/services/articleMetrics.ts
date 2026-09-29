import type { Article, Feed } from "../types";
import { DEFAULT_HISTORY_WINDOW_DAYS, getLocalCalendarDayWindow } from "./articleVisibility";

export interface ArticleMetrics {
  recentUnreadByFeedId: Map<string, number>;
  totalRecentUnread: number;
  totalSaved: number;
}

/** Aggregate navigation metrics in one article pass. */
export function deriveArticleMetrics(
  articles: Pick<Article, "feedId" | "pubDate" | "read" | "starred">[],
  now = Date.now(),
): ArticleMetrics {
  const recentUnreadByFeedId = new Map<string, number>();
  const window = getLocalCalendarDayWindow(DEFAULT_HISTORY_WINDOW_DAYS, now);
  let totalRecentUnread = 0;
  let totalSaved = 0;

  articles.forEach((article) => {
    if (article.starred) totalSaved += 1;
    if (article.read || !window) return;
    const publishedAt = new Date(article.pubDate).getTime();
    if (!Number.isFinite(publishedAt) || publishedAt < window.start || publishedAt > window.end) return;
    totalRecentUnread += 1;
    recentUnreadByFeedId.set(article.feedId, (recentUnreadByFeedId.get(article.feedId) || 0) + 1);
  });

  return { recentUnreadByFeedId, totalRecentUnread, totalSaved };
}

/** Keep feed and array identities stable when every unread count already matches. */
export function applyFeedUnreadCounts(feeds: Feed[], counts: Map<string, number>): Feed[] {
  let changed = false;
  const next = feeds.map((feed) => {
    const unreadCount = counts.get(feed.id) || 0;
    if (feed.unreadCount === unreadCount) return feed;
    changed = true;
    return { ...feed, unreadCount };
  });
  return changed ? next : feeds;
}
