import { beforeEach, describe, expect, it } from "vitest";
import { CURATED_FEEDS } from "../src/data/defaultFeeds";
import { resolveFeedEnrichmentSource, updateFeedEnrichment } from "../src/services/feedEnrichment";
import { getStoredFeeds, mergeDefaultFeedFields, saveStoredFeeds } from "../src/services/rssService";
import type { Feed } from "../src/types";

const [knownA, knownB] = CURATED_FEEDS.filter((feed) => feed.bidclubFeedUrl);
const unknownUrl = "https://unknown.example/feed.xml";
const manualUrl = "https://bidclub.ai/feeds/my-custom.xml";
const feed = (overrides: Partial<Feed> = {}): Feed => ({
  id: knownA.id, title: knownA.title, feedUrl: knownA.feedUrl, siteUrl: knownA.siteUrl || knownA.feedUrl,
  category: "科技", unreadCount: 0, ...overrides,
});

describe("feed enrichment priority and edits", () => {
  beforeEach(() => localStorage.clear());

  it("automatically resolves a known RSS when no human setting exists", () => {
    expect(resolveFeedEnrichmentSource(feed())).toEqual({
      bidclubFeedUrl: knownA.bidclubFeedUrl,
      bidclubShowSlug: knownA.bidclubShowSlug,
    });
  });

  it("stays disabled after default merging and storage reload", () => {
    const disabled = updateFeedEnrichment(feed(), { feedUrl: knownA.feedUrl, enrichmentDisabled: true });
    expect(disabled.enrichmentDisabled).toBe(true);
    expect(resolveFeedEnrichmentSource(disabled)).toEqual({});
    expect(mergeDefaultFeedFields([disabled])[0].bidclubFeedUrl).toBeUndefined();
    saveStoredFeeds([disabled]);
    const reloaded = getStoredFeeds()[0];
    expect(reloaded.enrichmentDisabled).toBe(true);
    expect(reloaded.bidclubFeedUrl).toBeUndefined();
    expect(resolveFeedEnrichmentSource(reloaded)).toEqual({});
    const legacyDisabled = feed({ enrichmentDisabled: true, bidclubFeedUrl: knownA.bidclubFeedUrl });
    expect(resolveFeedEnrichmentSource(mergeDefaultFeedFields([legacyDisabled])[0])).toEqual({});
  });

  it("restores the current known mapping, and manual URLs outrank it", () => {
    const disabled = feed({ enrichmentDisabled: true, bidclubFeedUrl: manualUrl });
    const restored = updateFeedEnrichment(disabled, { feedUrl: knownA.feedUrl, enrichmentDisabled: false });
    expect(restored.enrichmentDisabled).toBe(false);
    expect(resolveFeedEnrichmentSource(restored).bidclubFeedUrl).toBe(knownA.bidclubFeedUrl);
    const manual = updateFeedEnrichment(restored, { feedUrl: knownA.feedUrl, enrichmentDisabled: false, bidclubFeedUrl: manualUrl });
    expect(manual.enrichmentDisabled).toBe(false);
    expect(resolveFeedEnrichmentSource(manual)).toEqual({ bidclubFeedUrl: manualUrl, bidclubShowSlug: undefined });
    expect(mergeDefaultFeedFields([manual])[0]).toMatchObject({ bidclubFeedUrl: manualUrl, bidclubShowSlug: undefined });
  });

  it("preserves disablement and manual URLs when only the category changes", () => {
    const disabled = feed({ enrichmentDisabled: true });
    const movedDisabled: Feed = { ...disabled, category: "人文" };
    expect(resolveFeedEnrichmentSource(movedDisabled)).toEqual({});
    const manual = feed({ bidclubFeedUrl: manualUrl, enrichmentDisabled: false });
    const movedManual: Feed = { ...manual, category: "人文" };
    expect(resolveFeedEnrichmentSource(movedManual).bidclubFeedUrl).toBe(manualUrl);
  });

  it("switches an old automatic mapping when the primary RSS changes to another known show", () => {
    const updated = updateFeedEnrichment(feed({ bidclubFeedUrl: knownA.bidclubFeedUrl, bidclubShowSlug: knownA.bidclubShowSlug }), { feedUrl: knownB.feedUrl });
    expect(resolveFeedEnrichmentSource(updated)).toEqual({ bidclubFeedUrl: knownB.bidclubFeedUrl, bidclubShowSlug: knownB.bidclubShowSlug });
  });

  it("clears an old automatic mapping when the primary RSS becomes unknown", () => {
    const updated = updateFeedEnrichment(feed({ bidclubFeedUrl: knownA.bidclubFeedUrl, bidclubShowSlug: knownA.bidclubShowSlug }), { feedUrl: unknownUrl });
    expect(updated.bidclubFeedUrl).toBeUndefined();
    expect(updated.bidclubShowSlug).toBeUndefined();
    expect(resolveFeedEnrichmentSource(updated)).toEqual({});
    expect(resolveFeedEnrichmentSource(mergeDefaultFeedFields([updated])[0])).toEqual({});
  });

  it("retains a custom URL when the primary RSS changes", () => {
    const updated = updateFeedEnrichment(feed({ bidclubFeedUrl: manualUrl, enrichmentDisabled: false }), { feedUrl: knownB.feedUrl });
    expect(resolveFeedEnrichmentSource(updated).bidclubFeedUrl).toBe(manualUrl);
  });
});
