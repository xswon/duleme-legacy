import { describe, expect, it } from "vitest";
import type { Article, Feed } from "../src/types";
import { applyFeedUnreadCounts, deriveArticleMetrics } from "../src/services/articleMetrics";

const localIso = (year: number, month: number, day: number, hour = 0) => new Date(year, month - 1, day, hour).toISOString();
const item = (id: string, feedId: string, pubDate: string, overrides: Partial<Article> = {}): Article => ({
  id, feedId, feedTitle: feedId, title: id, link: id, content: "", snippet: "", pubDate,
  read: false, starred: false, ...overrides,
});

describe("article metrics", () => {
  it("aggregates recent unread and saved counts with conservative date semantics", () => {
    const now = new Date(2026, 8, 24, 12).getTime();
    const metrics = deriveArticleMetrics([
      item("boundary", "one", localIso(2026, 8, 26)),
      item("recent", "one", localIso(2026, 9, 23), { starred: true }),
      item("read", "one", localIso(2026, 9, 23), { read: true, starred: true }),
      item("old", "two", localIso(2026, 8, 25, 23)),
      item("invalid", "two", "invalid"),
      item("future", "two", localIso(2026, 9, 25)),
    ], now);

    expect(Object.fromEntries(metrics.recentUnreadByFeedId)).toEqual({ one: 2 });
    expect(metrics.totalRecentUnread).toBe(2);
    expect(metrics.totalSaved).toBe(2);
  });

  it("preserves feed and array identity when counts do not change", () => {
    const feeds: Feed[] = [
      { id: "one", title: "One", feedUrl: "one", siteUrl: "one", category: "A", unreadCount: 2 },
      { id: "two", title: "Two", feedUrl: "two", siteUrl: "two", category: "B", unreadCount: 0 },
    ];
    expect(applyFeedUnreadCounts(feeds, new Map([["one", 2]]))).toBe(feeds);
    const changed = applyFeedUnreadCounts(feeds, new Map([["one", 1]]));
    expect(changed).not.toBe(feeds);
    expect(changed[1]).toBe(feeds[1]);
  });
});
