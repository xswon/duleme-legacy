import type { Feed } from "../types";
import { resolveKnownEnrichmentSource } from "../data/defaultFeeds";

type EnrichmentSource = Pick<Feed, "bidclubFeedUrl" | "bidclubShowSlug">;

/** Explicitly disabled > stored source > known RSS mapping > no source. */
export function resolveFeedEnrichmentSource(feed: Pick<Feed, "feedUrl" | "bidclubFeedUrl" | "bidclubShowSlug" | "enrichmentDisabled">): EnrichmentSource {
  if (feed.enrichmentDisabled === true) return {};
  if (feed.bidclubFeedUrl) return { bidclubFeedUrl: feed.bidclubFeedUrl, bidclubShowSlug: feed.bidclubShowSlug };
  return resolveKnownEnrichmentSource(feed.feedUrl);
}

export interface FeedUrlChanges {
  feedUrl: string;
  /** Omitted for ordinary edits; true disables, false resumes auto or applies bidclubFeedUrl. */
  enrichmentDisabled?: boolean;
  bidclubFeedUrl?: string;
}

export function updateFeedEnrichment(feed: Feed, changes: FeedUrlChanges): Feed {
  const next = { ...feed, feedUrl: changes.feedUrl };
  if (changes.enrichmentDisabled === true) {
    return { ...next, enrichmentDisabled: true, bidclubFeedUrl: undefined, bidclubShowSlug: undefined };
  }
  if (changes.enrichmentDisabled === false) {
    const source = changes.bidclubFeedUrl
      ? { bidclubFeedUrl: changes.bidclubFeedUrl, bidclubShowSlug: undefined }
      : resolveKnownEnrichmentSource(changes.feedUrl);
    return { ...next, enrichmentDisabled: false, bidclubFeedUrl: source.bidclubFeedUrl, bidclubShowSlug: source.bidclubShowSlug };
  }
  if (feed.enrichmentDisabled === true) return next;
  const oldDefault = resolveKnownEnrichmentSource(feed.feedUrl);
  if (feed.feedUrl !== changes.feedUrl && (!feed.bidclubFeedUrl || feed.bidclubFeedUrl === oldDefault.bidclubFeedUrl)) {
    const source = resolveKnownEnrichmentSource(changes.feedUrl);
    return { ...next, bidclubFeedUrl: source.bidclubFeedUrl, bidclubShowSlug: source.bidclubShowSlug };
  }
  return next;
}
