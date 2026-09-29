import { BidclubEpisode, EnrichmentReference } from "../types";

const CACHE_KEY = "wreader_bidclub_episode_cache_v1";
const AVAILABLE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export function canonicalBidclubEpisodeId(reference: string): string {
  const value = reference.trim();
  try {
    const parsed = new URL(value);
    return parsed.pathname.match(/^\/e\/([^/]+)/)?.[1] || value;
  } catch {
    return value.replace(/^\/+|\/+$/g, "");
  }
}

type CachedBidclubEpisode = {
  episode: BidclubEpisode;
  expiresAt: number;
};

type BidclubEpisodeCache = Record<string, CachedBidclubEpisode>;

function hasText(value?: string | null): boolean {
  return !!value && value.trim().length > 0;
}

export function hasBidclubEnrichment(episode: BidclubEpisode): boolean {
  return (
    hasText(episode.tldrHtml) ||
    hasText(episode.tldrAltHtml) ||
    hasText(episode.digestHtml) ||
    hasText(episode.digestAltHtml) ||
    hasText(episode.transcriptHtml)
  );
}

/** Only a detail API response can promote a reference to the verified state. */
export function isVerifiedBidclubEnrichment(reference?: EnrichmentReference | null): boolean {
  return reference?.provider === "bidclub" && reference.status === "available" && reference.matchedBy === "api";
}

/** Downgrade pre-API availability left by older versions of the app. */
export function normalizeBidclubEnrichmentReference(reference: EnrichmentReference): EnrichmentReference {
  if (reference.provider !== "bidclub" || reference.status !== "available" || reference.matchedBy === "api") {
    return reference;
  }
  return { ...reference, status: "candidate" };
}

/** Convert the transient detail result into the persisted reference state. */
export function resolveBidclubEnrichmentReference(
  reference: EnrichmentReference,
  episode?: BidclubEpisode | null,
): EnrichmentReference {
  if (episode && hasBidclubEnrichment(episode)) {
    return { ...reference, status: "available", matchedBy: "api" };
  }
  return { ...reference, status: "candidate" };
}

function readCache(now = Date.now()): BidclubEpisodeCache {
  if (typeof localStorage === "undefined") return {};

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BidclubEpisodeCache;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, entry]) => entry?.episode && entry.expiresAt > now && hasBidclubEnrichment(entry.episode))
        .map(([reference, entry]) => [canonicalBidclubEpisodeId(reference), entry])
    );
  } catch {
    return {};
  }
}

function writeCache(cache: BidclubEpisodeCache): void {
  if (typeof localStorage === "undefined") return;

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Cache failures should never affect reading.
  }
}

export function getCachedBidclubEpisode(reference: string, now = Date.now()): BidclubEpisode | null {
  return readCache(now)[canonicalBidclubEpisodeId(reference)]?.episode || null;
}

export function setCachedBidclubEpisode(reference: string, episode: BidclubEpisode, now = Date.now()): void {
  if (!hasBidclubEnrichment(episode)) return;
  const episodeId = canonicalBidclubEpisodeId(reference);
  writeCache({
    ...readCache(now),
    [episodeId]: {
      episode,
      expiresAt: now + AVAILABLE_TTL_MS,
    },
  });
}
