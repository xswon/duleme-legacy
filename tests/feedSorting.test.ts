import { describe, expect, it } from "vitest";
import { appendFeedToFolder, categoryUnreadCount, moveFeedToFolder, moveFolderToUncategorized, normalizeFeedOrder, orderFeedsInFolder, reorderItems, renameFolderInOrder, sortCategories, sortFeeds } from "../src/services/feedSorting";
import type { Feed } from "../src/types";

const makeFeed = (id: string, title: string, unreadCount: number, category: string): Feed => ({
  id,
  title,
  unreadCount,
  category,
  feedUrl: `https://${id}.example/feed.xml`,
  siteUrl: `https://${id}.example`,
});

describe("feed sorting", () => {
  const feeds = [
    makeFeed("z", "中文", 2, "B"),
    makeFeed("b", "Alpha", 2, "A"),
    makeFeed("a", "Beta", 5, "A"),
  ];

  it("sorts by name and unread count with deterministic name tie-breakers", () => {
    expect(sortFeeds(feeds, "alphabetical").map((feed) => feed.title)).toEqual(["中文", "Alpha", "Beta"]);
    expect(sortFeeds(feeds, "unread").map((feed) => feed.title)).toEqual(["Beta", "中文", "Alpha"]);
  });

  it("sorts folders independently using aggregate unread counts", () => {
    expect(categoryUnreadCount(feeds, "A")).toBe(7);
    expect(sortCategories(["B", "A"], feeds, "unread")).toEqual(["A", "B"]);
    expect(sortCategories(["B", "A"], feeds, "default")).toEqual(["B", "A"]);
  });

  it("reorders without mutating the source array", () => {
    const source = ["a", "b", "c"];
    expect(reorderItems(source, 0, 2)).toEqual(["b", "c", "a"]);
    expect(source).toEqual(["a", "b", "c"]);
  });

  it("normalizes per-folder order without losing feeds or trusting unknown ids", () => {
    const stored = { A: ["missing", "a", "a"], Unknown: ["z"] };
    expect(normalizeFeedOrder(feeds, stored)).toEqual({ A: ["a", "b"], B: ["z"] });
    expect(orderFeedsInFolder(feeds, "A", { A: ["b", "a"] }).map((feed) => feed.id)).toEqual(["b", "a"]);
  });

  it("maintains order through add, move, delete-folder and rename operations", () => {
    let order = normalizeFeedOrder(feeds);
    order = appendFeedToFolder(order, makeFeed("new", "New", 0, "A"));
    expect(order.A).toEqual(["b", "a", "new"]);
    order = moveFeedToFolder(order, "new", "A", "B");
    expect(order.A).toEqual(["b", "a"]);
    expect(order.B).toEqual(["z", "new"]);
    order = renameFolderInOrder(order, "B", "Renamed");
    expect(order.Renamed).toEqual(["z", "new"]);
    order = moveFolderToUncategorized(order, "Renamed");
    expect(order.未分类).toEqual(["z", "new"]);
  });
});
