import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Article, Feed } from "../src/types";
import {
  fetchRssFeed,
  summarizeFeedRefreshResults,
} from "../src/services/rssService";

const feed = (id: string): Feed => ({
  id,
  title: id,
  feedUrl: `https://example.com/${id}.xml`,
  siteUrl: "https://example.com",
  category: "未分类",
  unreadCount: 0,
});

const article = (feedId: string, id: string): Pick<Article, "id" | "feedId"> => ({
  feedId,
  id,
});

describe("RSS service refresh feedback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces server errors instead of returning an empty feed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: vi.fn().mockResolvedValue({ error: "上游源不可用" }),
    }));

    await expect(fetchRssFeed("https://example.com/feed.xml")).rejects.toThrow("上游源不可用");
  });

  it("rejects a successful response without parsed items", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ title: "Broken feed" }),
    }));

    await expect(fetchRssFeed("https://example.com/feed.xml")).rejects.toThrow("无效数据");
  });

  it("summarizes successful, failed, and newly fetched articles", () => {
    const feeds = [feed("one"), feed("two"), feed("three")];
    const summary = summarizeFeedRefreshResults(
      feeds,
      [
        { feed: feeds[0], articles: [article("one", "existing"), article("one", "new")] },
        null,
        { feed: feeds[2], articles: [], error: new Error("timeout") },
      ],
      [article("one", "existing")]
    );

    expect(summary).toEqual({
      totalFeeds: 3,
      succeededFeeds: 1,
      failedFeeds: 2,
      newArticles: 1,
      failedFeedIds: ["two", "three"],
      failedFeedUrls: [feeds[1].feedUrl, feeds[2].feedUrl],
      failedFeedErrors: { three: "timeout" },
    });
  });
});
