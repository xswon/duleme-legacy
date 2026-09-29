import { beforeEach, describe, expect, it } from "vitest";
import {
  getStoredCategories,
  getStoredFeeds,
  getStoredSortMode,
  saveStoredCategories,
  saveStoredSortMode,
  STORAGE_KEY_CATEGORIES,
} from "../src/services/rssService";
import { getStoredFeedOrder, saveStoredFeedOrder, STORAGE_KEY_FEED_ORDER_BY_FOLDER } from "../src/services/feedSorting";
import type { Feed } from "../src/types";

const feed = (id: string, category: string): Feed => ({ id, title: id, category, unreadCount: 0, feedUrl: `https://${id}.test/feed`, siteUrl: `https://${id}.test` });

describe("feed and folder preference storage", () => {
  beforeEach(() => localStorage.clear());

  it("falls back safely when stored values are invalid", () => {
    localStorage.setItem("sort", "broken");
    localStorage.setItem(STORAGE_KEY_CATEGORIES, "{bad json");
    expect(getStoredSortMode("sort", "unread")).toBe("unread");
    expect(getStoredCategories(["Default"], [])).toEqual(["Default"]);
  });

  it("preserves saved category order while appending newly discovered folders", () => {
    saveStoredCategories(["B", "A"]);
    expect(getStoredCategories(["Default"], [
      {
        id: "feed-c",
        title: "C feed",
        unreadCount: 0,
        category: "C",
        feedUrl: "https://c.example/feed.xml",
        siteUrl: "https://c.example",
      },
    ])).toEqual(["B", "A", "C"]);
  });

  it("does not resurrect renamed or deleted default folders", () => {
    saveStoredCategories(["Renamed"]);
    expect(getStoredCategories(["Default"], [])).toEqual(["Renamed"]);
  });

  it("starts a brand-new profile with no subscriptions", () => {
    expect(getStoredFeeds()).toEqual([]);
  });

  it("does not append curated feeds to an existing subscription list", () => {
    const custom = feed("custom", "自定义");
    localStorage.setItem("inoreader_feeds_v2", JSON.stringify([custom]));
    expect(getStoredFeeds()).toEqual([custom]);
  });

  it("still migrates a stored legacy Dwarkesh RSS URL", () => {
    const legacy = {
      ...feed("old-dwarkesh", "科技"),
      title: "Dwarkesh Podcast",
      feedUrl: "https://apple.dwarkesh-podcast.workers.dev/feed.rss",
    };
    localStorage.setItem("inoreader_feeds_v2", JSON.stringify([legacy]));

    expect(getStoredFeeds()[0]).toMatchObject({
      feedUrl: "https://api.substack.com/feed/podcast/69345.rss",
      bidclubFeedUrl: "https://bidclub.ai/feeds/dwarkesh.zh.xml",
      bidclubShowSlug: "dwarkesh",
    });
    expect(JSON.parse(localStorage.getItem("inoreader_feeds_v2") || "[]")[0].feedUrl)
      .toBe("https://api.substack.com/feed/podcast/69345.rss");
  });

  it("persists the two sort modes independently", () => {
    saveStoredSortMode("feeds", "alphabetical");
    saveStoredSortMode("folders", "unread");
    expect(getStoredSortMode("feeds")).toBe("alphabetical");
    expect(getStoredSortMode("folders")).toBe("unread");
  });

  it("safely migrates and persists per-folder feed order", () => {
    const feeds = [feed("a", "A"), feed("b", "A"), feed("c", "B")];
    localStorage.setItem(STORAGE_KEY_FEED_ORDER_BY_FOLDER, "not-json");
    expect(getStoredFeedOrder(feeds)).toEqual({ A: ["a", "b"], B: ["c"] });
    saveStoredFeedOrder({ A: ["b", "a"], B: ["c"] });
    expect(getStoredFeedOrder(feeds)).toEqual({ A: ["b", "a"], B: ["c"] });
  });
});
