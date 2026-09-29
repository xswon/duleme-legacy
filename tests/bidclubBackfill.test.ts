import { describe, expect, it, vi } from "vitest";
import type { Article, Feed, RssParseResponse } from "../src/types";
import { backfillArticleBidclubReferences } from "../src/services/rssService";

const article = (overrides: Partial<Article> = {}): Article => ({
  id: "late-178",
  feedId: "latetalk",
  feedTitle: "LateTalk",
  title: "178: 与田渊栋聊 RSI：模型自进化如何到来？",
  link: "https://podcast.latepost.com/178",
  content: "<p>Original show notes</p>",
  snippet: "Original show notes",
  pubDate: "2026-08-07T02:00:00.000Z",
  read: true,
  starred: true,
  audioUrl: "https://cdn.example.com/178.mp3",
  ...overrides,
});

const feed = (overrides: Partial<Feed> = {}): Feed => ({
  id: "latetalk",
  title: "LateTalk",
  feedUrl: "https://podcast.latepost.com/rss",
  siteUrl: "https://podcast.latepost.com",
  category: "科技 | 商业",
  unreadCount: 0,
  bidclubFeedUrl: "https://bidclub.ai/feeds/latetalk.xml",
  ...overrides,
});

describe("backfillArticleBidclubReferences", () => {
  it("does not fetch or attach references for an explicitly disabled feed", async () => {
    const fetchFeed = vi.fn();
    const result = await backfillArticleBidclubReferences(
      [article()],
      [feed({ enrichmentDisabled: true })],
      fetchFeed
    );
    expect(fetchFeed).not.toHaveBeenCalled();
    expect(result.articles[0].enrichment).toBeUndefined();
  });

  it("adds references to historical articles from a BidClub primary feed", async () => {
    const existing = article({
      id: "bidclub-primary-1",
      feedId: "bidclub-primary",
      title: "Translated title",
      link: "https://bidclub.ai/e/show-episode-1",
      audioUrl: undefined,
    });

    const result = await backfillArticleBidclubReferences(
      [existing],
      [feed({
        id: "bidclub-primary",
        feedUrl: "https://bidclub.ai/feeds/show.xml",
        bidclubFeedUrl: undefined,
      })],
      vi.fn()
    );

    expect(result.changed).toBe(true);
    expect(result.articles[0].enrichment).toMatchObject({
      provider: "bidclub",
      episodeId: "show-episode-1",
      status: "candidate",
      matchedBy: "source-url",
    });
  });

  it("adds verified BidClub references to old articles without replacing article state", async () => {
    const existing = article();
    const fetchFeed = vi.fn<(feedUrl: string) => Promise<RssParseResponse>>().mockResolvedValue({
      title: "LateTalk - BidClub",
      description: "",
      link: "https://bidclub.ai/shows/latetalk",
      feedUrl: "https://bidclub.ai/feeds/latetalk.xml",
      favicon: "",
      itemCount: 1,
      items: [{
        id: "bidclub-178",
        title: "178: Talking RSI with 田渊栋: How Will Model Self-Evolution Arrive?",
        link: "https://bidclub.ai/e/latetalk-2026-08-07-178-rsi",
        content: "",
        snippet: "",
        pubDate: "2026-08-07T00:30:00.000Z",
        duration: "01:29:00",
      }],
    });

    const result = await backfillArticleBidclubReferences([existing], [feed()], fetchFeed);

    expect(result.changed).toBe(true);
    expect(result.articles[0]).toMatchObject({
      id: "late-178",
      read: true,
      starred: true,
      content: "<p>Original show notes</p>",
      enrichment: {
        provider: "bidclub",
        episodeUrl: "https://bidclub.ai/e/latetalk-2026-08-07-178-rsi",
        episodeId: "latetalk-2026-08-07-178-rsi",
        status: "candidate",
      },
    });
  });

  it("re-fills a historical candidate reference from a canonical slug", async () => {
    const existing = article({
      title: "152. 中文主标题",
      pubDate: "2026-08-10T02:00:00.000Z",
      enrichment: {
        provider: "bidclub",
        episodeId: "stale-reference",
        status: "candidate",
        matchedBy: "legacy",
      },
    });
    const fetchFeed = vi.fn<(feedUrl: string) => Promise<RssParseResponse>>().mockResolvedValue({
      title: "LateTalk - BidClub",
      description: "",
      link: "https://bidclub.ai/shows/latetalk",
      feedUrl: "https://bidclub.ai/feeds/latetalk.xml",
      favicon: "",
      itemCount: 1,
      items: [{
        id: "bidclub-152",
        title: "English title without a number",
        link: "https://bidclub.ai/e/latetalk-2026-08-10-152-english-title",
        content: "",
        snippet: "",
        pubDate: "2026-08-10T09:00:00.000Z",
      }],
    });

    const result = await backfillArticleBidclubReferences([existing], [feed()], fetchFeed);

    expect(result.articles[0].enrichment).toMatchObject({
      episodeId: "latetalk-2026-08-10-152-english-title",
      status: "candidate",
      matchedBy: "episode-number",
    });
  });

  it("backfills custom feeds with an explicitly configured helper by Source URL", async () => {
    const existing = article({ feedId: "custom-latetalk" });
    const fetchFeed = vi.fn<(feedUrl: string) => Promise<RssParseResponse>>().mockResolvedValue({
      title: "LateTalk - BidClub",
      description: "",
      link: "https://bidclub.ai/shows/latetalk",
      feedUrl: "https://bidclub.ai/feeds/latetalk.xml",
      favicon: "",
      itemCount: 1,
      items: [{
        id: "bidclub-178",
        title: "178: Talking RSI with 田渊栋: How Will Model Self-Evolution Arrive?",
        link: "https://bidclub.ai/e/latetalk-2026-08-07-178-rsi",
        content: '<p><a href="https://podcast.latepost.com/178?utm_source=rss">Source</a></p>',
        snippet: "",
        pubDate: "2026-08-07T00:30:00.000Z",
      }],
    });

    const result = await backfillArticleBidclubReferences(
      [existing],
      [feed({ id: "custom-latetalk" })],
      fetchFeed
    );

    expect(result.changed).toBe(true);
    expect(result.articles[0]).toMatchObject({
      feedId: "custom-latetalk",
      enrichment: {
        episodeId: "latetalk-2026-08-07-178-rsi",
        status: "candidate",
        matchedBy: "source-url",
      },
    });
  });

  it("isolates helper feed failures and still repairs other subscriptions", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const secondFeed = feed({
      id: "second",
      title: "Second",
      bidclubFeedUrl: "https://bidclub.ai/feeds/second.xml",
    });
    const secondArticle = article({
      id: "second-1",
      feedId: "second",
      title: "Episode 1: Working",
      link: "https://second.example.com/1",
      pubDate: "2026-08-07T02:00:00.000Z",
    });
    const fetchFeed = vi.fn<(feedUrl: string) => Promise<RssParseResponse>>(async (url) => {
      if (url.includes("latetalk")) throw new Error("temporary failure");
      return {
        title: "Second - BidClub",
        description: "",
        link: "https://bidclub.ai/shows/second",
        feedUrl: url,
        favicon: "",
        itemCount: 1,
        items: [{
          id: "bidclub-second-1",
          title: "Episode 1: Working",
          link: "https://bidclub.ai/e/second-1",
          content: '<a href="https://second.example.com/1">Source</a>',
          snippet: "",
          pubDate: "2026-08-07T02:00:00.000Z",
        }],
      };
    });

    const result = await backfillArticleBidclubReferences(
      [article(), secondArticle],
      [feed(), secondFeed],
      fetchFeed
    );

    expect(result.articles.find((item) => item.id === "second-1")?.enrichment?.episodeId).toBe("second-1");
    expect(result.failedFeedUrls).toContain("https://bidclub.ai/feeds/latetalk.xml");
    expect(result.diagnostics.failedFeeds).toBeGreaterThan(0);
    warn.mockRestore();
  });

  it("keeps episode-number fallback scoped to its configured subscription", async () => {
    const feeds = [
      feed({ id: "feed-a", bidclubFeedUrl: "https://bidclub.ai/feeds/a.xml" }),
      feed({ id: "feed-b", bidclubFeedUrl: "https://bidclub.ai/feeds/b.xml" }),
    ];
    const articles = [
      article({ id: "a-12", feedId: "feed-a", title: "Episode 12: Alpha", link: "https://a.example/12" }),
      article({ id: "b-12", feedId: "feed-b", title: "Episode 12: Beta", link: "https://b.example/12" }),
    ];
    const fetchFeed = vi.fn<(feedUrl: string) => Promise<RssParseResponse>>(async (url) => {
      const show = url.endsWith("a.xml") ? "a" : "b";
      return {
        title: show,
        description: "",
        link: `https://bidclub.ai/shows/${show}`,
        feedUrl: url,
        favicon: "",
        itemCount: 1,
        items: [{
          id: `${show}-12`,
          title: `Episode 12: ${show === "a" ? "Alpha" : "Beta"}`,
          link: `https://bidclub.ai/e/${show}-12`,
          content: "",
          snippet: "",
          pubDate: "2026-08-07T02:00:00.000Z",
          duration: "01:29:00",
        }],
      };
    });

    const result = await backfillArticleBidclubReferences(articles, feeds, fetchFeed);

    expect(result.articles.find((item) => item.id === "a-12")?.enrichment?.episodeId).toBe("a-12");
    expect(result.articles.find((item) => item.id === "b-12")?.enrichment?.episodeId).toBe("b-12");
  });
});
