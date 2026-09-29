import type { Article } from "../types";
import { isRecentUnreadArticle } from "./articleVisibility";

/** Count only unread articles covered by the shared recent-30-day scope. */
export function countRecentUnreadArticles(
  articles: Pick<Article, "read" | "pubDate">[],
  now = Date.now(),
): number {
  return articles.filter((article) => isRecentUnreadArticle(article, now)).length;
}

/**
 * Format an unread count for compact navigation badges.
 * Counts of 100 or more intentionally use the shared 99+ cap.
 */
export function formatUnreadCount(count: number): string {
  const normalizedCount = normalizeUnreadCount(count);
  return normalizedCount >= 100 ? "99+" : String(normalizedCount);
}

/**
 * Build an accessible label that keeps the exact unread count, even when the
 * visible badge is capped at 99+.
 */
export function getUnreadCountAriaLabel(count: number, suffix = "篇未读"): string {
  return `${normalizeUnreadCount(count)} ${suffix}`;
}

function normalizeUnreadCount(count: number): number {
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.floor(count));
}
