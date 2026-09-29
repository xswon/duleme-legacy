import { Feed } from "../types";

export type SortMode = "default" | "alphabetical" | "unread";
export type FeedOrderByFolder = Record<string, string[]>;

export const STORAGE_KEY_FEED_ORDER_BY_FOLDER = "wreader_feed_order_by_folder_v1";

export function feedCategory(feed: Feed): string {
  return feed.category || "未分类";
}

export function buildDefaultFeedOrder(feeds: Feed[]): FeedOrderByFolder {
  return feeds.reduce<FeedOrderByFolder>((order, feed) => {
    const category = feedCategory(feed);
    (order[category] ||= []).push(feed.id);
    return order;
  }, {});
}

/** Keep only current feed ids, remove duplicates, and append missing feeds safely. */
export function normalizeFeedOrder(feeds: Feed[], stored?: unknown): FeedOrderByFolder {
  const fallback = buildDefaultFeedOrder(feeds);
  const source = stored && typeof stored === "object" && !Array.isArray(stored)
    ? stored as Record<string, unknown>
    : {};
  const normalized: FeedOrderByFolder = {};
  Object.keys(fallback).forEach((category) => {
    const validIds = new Set(fallback[category]);
    const ids = Array.isArray(source[category]) ? source[category] : [];
    normalized[category] = [];
    ids.forEach((id) => {
      if (typeof id === "string" && validIds.has(id) && !normalized[category].includes(id)) {
        normalized[category].push(id);
      }
    });
    fallback[category].forEach((id) => {
      if (!normalized[category].includes(id)) normalized[category].push(id);
    });
  });
  return normalized;
}

export function getStoredFeedOrder(feeds: Feed[]): FeedOrderByFolder {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FEED_ORDER_BY_FOLDER);
    return normalizeFeedOrder(feeds, raw ? JSON.parse(raw) : undefined);
  } catch {
    return normalizeFeedOrder(feeds);
  }
}

export function saveStoredFeedOrder(order: FeedOrderByFolder) {
  try {
    localStorage.setItem(STORAGE_KEY_FEED_ORDER_BY_FOLDER, JSON.stringify(order));
  } catch (error) {
    console.error("Failed to save feed order to localStorage:", error);
  }
}

export function reorderFolderFeedIds(order: FeedOrderByFolder, category: string, sourceIndex: number, targetIndex: number): FeedOrderByFolder {
  return { ...order, [category]: reorderItems(order[category] || [], sourceIndex, targetIndex) };
}

export function appendFeedToFolder(order: FeedOrderByFolder, feed: Feed): FeedOrderByFolder {
  const category = feedCategory(feed);
  const next = { ...order, [category]: [...(order[category] || [])] };
  if (!next[category].includes(feed.id)) next[category].push(feed.id);
  return next;
}

export function removeFeedFromOrder(order: FeedOrderByFolder, feedId: string): FeedOrderByFolder {
  return Object.fromEntries(Object.entries(order).map(([category, ids]) => [category, ids.filter((id) => id !== feedId)]));
}

export function moveFeedToFolder(order: FeedOrderByFolder, feedId: string, fromCategory: string, toCategory: string): FeedOrderByFolder {
  if (fromCategory === toCategory) return { ...order };
  const next = removeFeedFromOrder(order, feedId);
  next[toCategory] = [...(next[toCategory] || []), feedId];
  if (fromCategory !== toCategory && next[fromCategory]?.length === 0) delete next[fromCategory];
  return next;
}

export function renameFolderInOrder(order: FeedOrderByFolder, oldName: string, newName: string): FeedOrderByFolder {
  if (oldName === newName || !Object.prototype.hasOwnProperty.call(order, oldName)) return { ...order };
  const next = { ...order };
  const ids = next[oldName] || [];
  delete next[oldName];
  next[newName] = [...(next[newName] || []), ...ids.filter((id) => !next[newName]?.includes(id))];
  return next;
}

export function moveFolderToUncategorized(order: FeedOrderByFolder, category: string): FeedOrderByFolder {
  if (category === "未分类") return { ...order };
  const next = { ...order };
  const ids = next[category] || [];
  delete next[category];
  next["未分类"] = [...(next["未分类"] || []), ...ids.filter((id) => !next["未分类"]?.includes(id))];
  return next;
}

export function orderFeedsInFolder(feeds: Feed[], category: string, order: FeedOrderByFolder): Feed[] {
  const inFolder = feeds.filter((feed) => feedCategory(feed) === category);
  const byId = new Map(inFolder.map((feed) => [feed.id, feed]));
  const ordered = (order[category] || []).flatMap((id) => {
    const feed = byId.get(id);
    if (!feed) return [];
    byId.delete(id);
    return [feed];
  });
  return [...ordered, ...byId.values()];
}

export function sortFeedsInFolder(feeds: Feed[], category: string, mode: SortMode, order: FeedOrderByFolder): Feed[] {
  const inFolder = feeds.filter((feed) => feedCategory(feed) === category);
  if (mode === "default") return orderFeedsInFolder(inFolder, category, order);
  return sortFeeds(inFolder, mode);
}

export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, "zh-CN");
}

export function sortFeeds(feeds: Feed[], mode: SortMode): Feed[] {
  if (mode === "default") return [...feeds];
  return [...feeds].sort((a, b) => {
    if (mode === "unread") {
      const unreadDifference = b.unreadCount - a.unreadCount;
      if (unreadDifference !== 0) return unreadDifference;
    }
    return compareNames(a.title, b.title);
  });
}

export function categoryUnreadCount(feeds: Feed[], category: string): number {
  return feeds
    .filter((feed) => (feed.category || "未分类") === category)
    .reduce((sum, feed) => sum + feed.unreadCount, 0);
}

export function sortCategories(categories: string[], feeds: Feed[], mode: SortMode): string[] {
  if (mode === "default") return [...categories];
  return [...categories].sort((a, b) => {
    if (mode === "unread") {
      const unreadDifference = categoryUnreadCount(feeds, b) - categoryUnreadCount(feeds, a);
      if (unreadDifference !== 0) return unreadDifference;
    }
    return compareNames(a, b);
  });
}

/** Move an item without mutating the source array. */
export function reorderItems<T>(items: T[], sourceIndex: number, targetIndex: number): T[] {
  if (
    sourceIndex < 0 ||
    targetIndex < 0 ||
    sourceIndex >= items.length ||
    targetIndex >= items.length ||
    sourceIndex === targetIndex
  ) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}
