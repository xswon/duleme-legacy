import { describe, expect, it } from "vitest";
import { canAutoMarkRead, countOlderArticles, deriveTimeline, getLocalCalendarDayWindow, getUnreadArticleIds, isOlderThanHistoryWindow, isOlderThanRecencyWindow, isRecentUnreadArticle, isRecencyLimitedTab, isVisibleInHistoryWindow, isWithinHistoryWindow, isWithinRecencyWindow, sortArticlesByPubDate } from "../src/services/articleVisibility";
import type { Article, Feed } from "../src/types";

const localTime = (year: number, month: number, day: number, hour = 0, minute = 0, second = 0) =>
  new Date(year, month - 1, day, hour, minute, second).getTime();
const localIso = (...args: Parameters<typeof localTime>) => new Date(localTime(...args)).toISOString();
const now = localTime(2026, 8, 31, 12);
const feeds: Feed[] = [
  { id: "f1", title: "One", feedUrl: "https://one", siteUrl: "https://one", category: "A", unreadCount: 0 },
  { id: "f2", title: "Two", feedUrl: "https://two", siteUrl: "https://two", category: "B", unreadCount: 0 },
];
const article = (id: string, feedId: string, pubDate: string, read = false): Article => ({
  id, feedId, feedTitle: feedId, title: id, link: `https://${id}`, content: "", snippet: "", pubDate, read, starred: false,
});

describe("article recency scope", () => {
  it("uses the inclusive midnight boundary of the latest 30 local dates", () => {
    expect(isWithinRecencyWindow(localIso(2026, 8, 2), now)).toBe(true);
    expect(isWithinRecencyWindow(localIso(2026, 8, 1, 23, 59, 59), now)).toBe(false);
    expect(isWithinRecencyWindow(localIso(2026, 8, 31, 12), now)).toBe(true);
    expect(isWithinRecencyWindow(localIso(2026, 8, 31, 12, 0, 1), now)).toBe(false);
    expect(isOlderThanRecencyWindow(localIso(2026, 8, 2), now)).toBe(false);
    expect(isOlderThanRecencyWindow(localIso(2026, 8, 1, 23, 59, 59), now)).toBe(true);
  });

  it("excludes invalid and future publication dates conservatively", () => {
    expect(isWithinRecencyWindow("not-a-date", now)).toBe(false);
    expect(isWithinRecencyWindow("", now)).toBe(false);
    expect(isWithinRecencyWindow(localIso(2026, 8, 31, 12, 0, 1), now)).toBe(false);
    expect(isWithinRecencyWindow(localIso(2026, 8, 2), Number.NaN)).toBe(false);
  });

  it("shares the same scope for unread article predicates", () => {
    expect(isRecentUnreadArticle(article("recent", "f1", localIso(2026, 8, 2)), now)).toBe(true);
    expect(isRecentUnreadArticle(article("old", "f1", localIso(2026, 8, 1, 23, 59, 59)), now)).toBe(false);
    expect(isRecentUnreadArticle(article("read", "f1", localIso(2026, 8, 30), true), now)).toBe(false);
    expect(isRecentUnreadArticle(article("invalid", "f1", "not-a-date"), now)).toBe(false);
  });

  it("does not apply the 30-day limit to saved or search tabs", () => {
    expect(isRecencyLimitedTab("feeds")).toBe(true);
    expect(isRecencyLimitedTab("saved")).toBe(false);
    expect(isRecencyLimitedTab("search")).toBe(false);
  });

  it("counts older articles in the active feed scope", () => {
    const articles = [
      article("old-a", "f1", localIso(2026, 7, 20)),
      { ...article("old-podcast", "f1", localIso(2026, 7, 19)), audioUrl: "https://cdn.example.com/a.mp3" },
      article("old-read", "f1", localIso(2026, 7, 1), true),
      article("old-b", "f2", localIso(2026, 7, 1)),
      article("recent", "f1", localIso(2026, 8, 30)),
    ];
    expect(countOlderArticles(articles, feeds, "f1", null, {}, now)).toBe(3);
    expect(countOlderArticles(articles, feeds, "f1", null, { historyWindowDays: 60 }, now)).toBe(1);
    expect(countOlderArticles(articles, feeds, null, "B", {}, now)).toBe(1);
    expect(countOlderArticles(articles, feeds, "f1", null, { filterType: "unread" }, now)).toBe(2);
    expect(countOlderArticles(articles, feeds, "f1", null, { contentType: "podcast" }, now)).toBe(1);
    expect(countOlderArticles(articles, feeds, "f1", null, { contentType: "article" }, now)).toBe(2);
  });

  it("uses configurable history windows for chunked loading", () => {
    expect(isWithinHistoryWindow(localIso(2026, 7, 3), 60, now)).toBe(true);
    expect(isWithinHistoryWindow(localIso(2026, 7, 2, 23, 59, 59), 60, now)).toBe(false);
    expect(isOlderThanHistoryWindow(localIso(2026, 7, 2, 23, 59, 59), 60, now)).toBe(true);
  });

  it("uses the shared conservative scope for timeline visibility", () => {
    expect(isVisibleInHistoryWindow("not-a-date", 30, now)).toBe(false);
    expect(isVisibleInHistoryWindow(localIso(2026, 8, 30), 30, now)).toBe(true);
    expect(isVisibleInHistoryWindow(localIso(2026, 7, 1), 30, now)).toBe(false);
    expect(isVisibleInHistoryWindow(localIso(2026, 8, 31, 12, 0, 1), 30, now)).toBe(false);
  });

  it("limits batch mark-as-read IDs to the supplied logical collection", () => {
    expect(getUnreadArticleIds([article("shown-unread", "f1", "2026-08-30T00:00:00Z"), article("shown-read", "f1", "2026-08-30T00:00:00Z", true)])).toEqual(["shown-unread"]);
  });

  it("returns every unread ID from a large logical list, not a virtual window", () => {
    const logicalList = Array.from({ length: 50_000 }, (_, index) => article(`item-${index}`, "f1", "2026-08-30T00:00:00Z", index % 2 === 0));
    const ids = getUnreadArticleIds(logicalList);
    expect(ids).toHaveLength(25_000);
    expect(ids.at(-1)).toBe("item-49999");
  });

  it("does not auto-mark older unread history when it is opened", () => {
    expect(canAutoMarkRead(article("old", "f1", localIso(2026, 7, 1)), now)).toBe(false);
    expect(canAutoMarkRead(article("recent", "f1", localIso(2026, 8, 30)), now)).toBe(true);
    expect(canAutoMarkRead(article("invalid", "f1", "not-a-date"), now)).toBe(false);
    expect(canAutoMarkRead(article("future", "f1", localIso(2026, 8, 31, 12, 0, 1)), now)).toBe(false);
  });

  it("uses calendar arithmetic across a daylight-saving transition", () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      const dstNow = new Date(2026, 2, 10, 12).getTime();
      const window = getLocalCalendarDayWindow(30, dstNow);
      expect(window).not.toBeNull();
      const start = new Date(window!.start);
      expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()]).toEqual([2026, 1, 9, 0]);
      expect(dstNow - window!.start).toBe(707 * 60 * 60 * 1000);
    } finally {
      process.env.TZ = previousTimezone;
    }
  });

  it("sorts feed timelines newest-first with stable valid and invalid date ordering", () => {
    const input = [
      article("same-a", "f1", "2026-08-30T00:00:00Z"),
      article("invalid-a", "f1", ""),
      article("old", "f1", "2026-08-01T00:00:00Z"),
      article("same-b", "f1", "Sun, 30 Aug 2026 00:00:00 GMT"),
      article("invalid-b", "f1", "not-a-date"),
      article("new", "f1", "2026-08-31T00:00:00Z"),
    ];
    const sorted = sortArticlesByPubDate(input);
    expect(sorted.map((item) => item.id)).toEqual(["new", "same-a", "same-b", "old", "invalid-a", "invalid-b"]);
    expect(input.map((item) => item.id)).toEqual(["same-a", "invalid-a", "old", "same-b", "invalid-b", "new"]);
  });

  it("derives category, feed, filters, older counts and full-list unread counts together", () => {
    const input = [
      article("a-new", "f1", localIso(2026, 8, 30)),
      { ...article("a-audio", "f1", localIso(2026, 8, 29)), audioUrl: "https://example.com/a.mp3" },
      { ...article("a-star", "f1", localIso(2026, 8, 28), true), starred: true },
      article("a-old", "f1", localIso(2026, 7, 1)),
      article("b-new", "f2", localIso(2026, 8, 31)),
    ];

    const category = deriveTimeline(input, feeds, { selectedCategory: "A", now });
    expect(category.visibleArticles.map((item) => item.id)).toEqual(["a-new", "a-audio", "a-star"]);
    expect(category.olderArticleCount).toBe(1);
    expect(category.visibleUnreadCount).toBe(2);
    expect(deriveTimeline(input, feeds, { selectedFeedId: "f2", now }).visibleArticles.map((item) => item.id)).toEqual(["b-new"]);
    expect(deriveTimeline(input, feeds, { selectedCategory: "A", filterType: "unread", now }).visibleArticles.map((item) => item.id)).toEqual(["a-new", "a-audio"]);
    expect(deriveTimeline(input, feeds, { selectedCategory: "A", filterType: "starred", contentType: "article", now }).visibleArticles.map((item) => item.id)).toEqual(["a-star"]);
    expect(deriveTimeline(input, feeds, { selectedCategory: "A", contentType: "podcast", now }).visibleArticles.map((item) => item.id)).toEqual(["a-audio"]);
  });

  it("shows the complete saved history without the timeline date window", () => {
    const input = [
      { ...article("recent-star", "f1", localIso(2026, 8, 30)), starred: true },
      { ...article("old-star", "f1", localIso(2025, 1, 1)), starred: true },
      { ...article("invalid-star", "f1", "not-a-date"), starred: true },
      article("old-unstarred", "f1", localIso(2025, 1, 1)),
    ];

    const saved = deriveTimeline(input, feeds, { filterType: "starred", historyWindowDays: 30, now });
    expect(saved.visibleArticles.map((item) => item.id)).toEqual(["recent-star", "old-star", "invalid-star"]);
    expect(saved.olderArticleCount).toBe(0);
    expect(deriveTimeline(input, feeds, { filterType: "starred", historyWindowDays: 30, sortOrder: "oldest", now }).visibleArticles.map((item) => item.id)).toEqual(["old-star", "recent-star", "invalid-star"]);
  });

  it("preserves newest/oldest tie behavior and excludes invalid and future dates", () => {
    const input = [
      article("same-a", "f1", localIso(2026, 8, 30)),
      article("same-b", "f1", localIso(2026, 8, 30)),
      article("invalid", "f1", "invalid"),
      article("future", "f1", localIso(2026, 9, 1)),
      article("older", "f1", localIso(2026, 8, 20)),
    ];
    expect(deriveTimeline(input, feeds, { now }).visibleArticles.map((item) => item.id)).toEqual(["same-a", "same-b", "older"]);
    expect(deriveTimeline(input, feeds, { now, sortOrder: "oldest" }).visibleArticles.map((item) => item.id)).toEqual(["older", "same-b", "same-a"]);
  });
});
