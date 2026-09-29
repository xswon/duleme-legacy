import { afterEach, describe, expect, it } from "vitest";
import type { BidclubEpisode } from "../src/types";
import {
  getCachedBidclubEpisode,
  resolveBidclubEnrichmentReference,
  setCachedBidclubEpisode,
} from "../src/services/bidclubEpisodeCache";

const episode = (overrides: Partial<BidclubEpisode> = {}): BidclubEpisode => ({
  title: "Episode",
  dek: "",
  dekAlt: "",
  lang: "",
  langAlt: "",
  tldrHtml: "",
  digestHtml: "",
  transcriptHtml: "",
  tldrAltHtml: "",
  digestAltHtml: "",
  chapters: [],
  chaptersAlt: [],
  ...overrides,
});

afterEach(() => {
  localStorage.clear();
});

describe("bidclubEpisodeCache", () => {
  const reference = {
    provider: "bidclub" as const,
    episodeId: "episode-a",
    status: "candidate" as const,
    matchedBy: "source-url" as const,
  };

  it("promotes only a non-empty detail response and downgrades failures to candidate", () => {
    const verified = resolveBidclubEnrichmentReference(reference, episode({ title: "Episode A", tldrHtml: "<p>Summary</p>" }));
    const failed = resolveBidclubEnrichmentReference(
      { ...reference, status: "available", matchedBy: "api" },
      null,
    );

    expect(verified).toMatchObject({ status: "available", matchedBy: "api" });
    expect(failed).toMatchObject({ status: "candidate", matchedBy: "api" });
  });

  it("caches confirmed enrichment", () => {
    setCachedBidclubEpisode("episode-a", episode({ tldrHtml: "<p>Summary</p>" }));

    expect(getCachedBidclubEpisode("episode-a")?.tldrHtml).toBe("<p>Summary</p>");
  });

  it("does not cache empty enrichment responses", () => {
    setCachedBidclubEpisode("episode-a", episode());

    expect(getCachedBidclubEpisode("episode-a")).toBeNull();
  });

  it("uses the canonical episode id for URL and slug cache lookups", () => {
    setCachedBidclubEpisode(
      "https://bidclub.ai/e/episode-a",
      episode({ digestHtml: "<p>Digest</p>" })
    );

    expect(getCachedBidclubEpisode("episode-a")?.digestHtml).toBe("<p>Digest</p>");
  });
});
