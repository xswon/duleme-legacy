import { describe, expect, it } from "vitest";
import {
  CURATED_FEEDS,
  FEATURED_CURATED_FEEDS,
  FEATURED_CURATED_FEED_IDS,
  LEGACY_DEFAULT_FEEDS,
  resolveKnownEnrichmentSource,
  resolveKnownPrimaryFeedUrl,
} from "../src/data/defaultFeeds";

describe("curated feed catalog", () => {
  it("deduplicates feeds by RSS URL", () => {
    expect(new Set(CURATED_FEEDS.map((feed) => feed.feedUrl)).size).toBe(CURATED_FEEDS.length);
  });

  it("matches the current 41-feed subscription catalog and excludes the removed starter feeds", () => {
    expect(CURATED_FEEDS).toHaveLength(41);
    expect(CURATED_FEEDS.some((feed) => feed.id === "feed-sspai")).toBe(false);
    expect(CURATED_FEEDS.some((feed) => feed.id.startsWith("curated-"))).toBe(false);

    const expectedAddedIds = [
      "feed-light-the-star",
      "feed-shanghaojin",
      "feed-svvector",
      "feed-theprompt",
      "feed-aihot",
      "feed-mianji",
      "feed-zhixing",
      "feed-touziabc",
      "feed-afterschool",
      "feed-zhankaijiangjiang",
      "feed-zhiwubuyan",
      "feed-liangshiyiting",
      "feed-tongjing",
    ];
    expectedAddedIds.forEach((id) => {
      expect(CURATED_FEEDS.some((feed) => feed.id === id)).toBe(true);
    });
    expect(LEGACY_DEFAULT_FEEDS).toHaveLength(28);
  });

  it("defines a compact featured starter set from the current catalog only", () => {
    expect(FEATURED_CURATED_FEEDS).toHaveLength(FEATURED_CURATED_FEED_IDS.length);
    expect(FEATURED_CURATED_FEEDS).toHaveLength(10);
    expect(new Set(FEATURED_CURATED_FEEDS.map((feed) => feed.id))).toEqual(
      new Set(FEATURED_CURATED_FEED_IDS)
    );
    FEATURED_CURATED_FEEDS.forEach((feed) => {
      expect(CURATED_FEEDS.some((candidate) => candidate.id === feed.id)).toBe(true);
      expect(feed.contentType).toBe(feed.id === "feed-aihot" ? "article" : "podcast");
    });
  });
});

describe("known enrichment source resolver", () => {
  it("resolves configured primary RSS URLs with safe URL normalization", () => {
    const known = LEGACY_DEFAULT_FEEDS.find((feed) => feed.id === "feed-crossing")!;
    expect(resolveKnownEnrichmentSource(`  HTTPS://FEED.XYZFM.SPACE/68fyjknth9hj  `)).toEqual({
      bidclubFeedUrl: known.bidclubFeedUrl,
      bidclubShowSlug: known.bidclubShowSlug,
    });
    CURATED_FEEDS.filter((feed) => feed.bidclubFeedUrl).forEach((feed) => {
      expect(resolveKnownEnrichmentSource(feed.feedUrl)).toEqual({
        bidclubFeedUrl: feed.bidclubFeedUrl,
        bidclubShowSlug: feed.bidclubShowSlug,
      });
    });
  });

  it("does not infer an enrichment source from an unknown URL or a matching title", () => {
    expect(resolveKnownEnrichmentSource("https://unknown.example/rss.xml")).toEqual({});
    expect(resolveKnownEnrichmentSource("十字路口Crossing")).toEqual({});
  });
});

describe("known primary RSS URL migration", () => {
  it("migrates only the listed legacy Dwarkesh URL", () => {
    expect(resolveKnownPrimaryFeedUrl("https://apple.dwarkesh-podcast.workers.dev/feed.rss"))
      .toBe("https://api.substack.com/feed/podcast/69345.rss");
    expect(resolveKnownPrimaryFeedUrl("https://unknown.example/rss.xml"))
      .toBe("https://unknown.example/rss.xml");
  });
});
