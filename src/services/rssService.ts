import { getAiErrorMessage, getAiRequestConfig } from "./aiSettingsService";
import {
  Article,
  AudioProgress,
  Feed,
  RssParseResponse,
  BidclubEpisode,
  EnrichmentMatchMethod,
  EnrichmentReference,
} from "../types";
import { LEGACY_DEFAULT_FEEDS, INITIAL_ARTICLES, resolveKnownPrimaryFeedUrl } from "../data/defaultFeeds";
import { resolveFeedEnrichmentSource } from "./feedEnrichment";
import type { SortMode } from "./feedSorting";

const STORAGE_KEY_FEEDS = "inoreader_feeds_v2";
const STORAGE_KEY_ARTICLES = "inoreader_articles_v2";
export const STORAGE_KEY_CATEGORIES = "wreader_categories_v1";
export const STORAGE_KEY_FEED_SORT_MODE = "wreader_feed_sort_mode";
export const STORAGE_KEY_FOLDER_SORT_MODE = "wreader_folder_sort_mode";

export function getBidclubFeedSlug(feedUrl?: string): string | undefined {
  if (!feedUrl) return undefined;
  try {
    const parsed = new URL(feedUrl);
    if (parsed.hostname !== "bidclub.ai") return undefined;
    const match = parsed.pathname.match(/^\/feeds\/([^/.]+)(?:\.zh)?\.xml$/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

export function isBidclubFeedUrl(feedUrl?: string): boolean {
  return !!getBidclubFeedSlug(feedUrl);
}

function findMatchingDefaultFeed(feed: Feed, defaults: Feed[]): Feed | undefined {
  const byUrl = defaults.find((defaultFeed) => defaultFeed.feedUrl === feed.feedUrl);
  if (byUrl) return byUrl;

  const bidclubFeedSlug = getBidclubFeedSlug(feed.feedUrl);
  if (bidclubFeedSlug) {
    const byBidclubFeed = defaults.filter(
      (defaultFeed) =>
        defaultFeed.bidclubShowSlug === bidclubFeedSlug ||
        getBidclubFeedSlug(defaultFeed.bidclubFeedUrl) === bidclubFeedSlug
    );
    if (byBidclubFeed.length === 1) return byBidclubFeed[0];
  }

  const byId = defaults.filter((defaultFeed) => defaultFeed.id === feed.id);
  if (byId.length === 1) return byId[0];

  const byTitle = defaults.filter((defaultFeed) => defaultFeed.title === feed.title);
  return byTitle.length === 1 ? byTitle[0] : undefined;
}

/** Add newly introduced default fields without replacing local feed settings. */
export function mergeDefaultFeedFields(feeds: Feed[], defaults: Feed[] = LEGACY_DEFAULT_FEEDS): Feed[] {
  return feeds.map((feed) => {
    const defaultFeed = findMatchingDefaultFeed(feed, defaults);
    if (!defaultFeed) return feed;

    let merged = feed;
    const isBidclubFeedAsPrimary = !!getBidclubFeedSlug(feed.feedUrl);
    if (isBidclubFeedAsPrimary && defaultFeed.feedUrl !== feed.feedUrl) {
      merged = {
        ...merged,
        feedUrl: defaultFeed.feedUrl,
        ...(feed.enrichmentDisabled === true ? {} : { bidclubFeedUrl: feed.feedUrl }),
      };
    }
    if (resolveKnownPrimaryFeedUrl(merged.feedUrl) === defaultFeed.feedUrl && merged.feedUrl !== defaultFeed.feedUrl) {
      merged = { ...merged, feedUrl: defaultFeed.feedUrl };
    }
    if (
      merged.bidclubFeedUrl &&
      defaultFeed.bidclubFeedUrl &&
      getBidclubFeedSlug(merged.bidclubFeedUrl) === getBidclubFeedSlug(defaultFeed.bidclubFeedUrl) &&
      merged.bidclubFeedUrl !== defaultFeed.bidclubFeedUrl
    ) {
      merged = { ...merged, bidclubFeedUrl: defaultFeed.bidclubFeedUrl };
    }
    if (merged.favicon?.includes("domain=bidclub.ai")) {
      merged = { ...merged, favicon: defaultFeed.favicon };
    }

    const knownBidclubFeedUrl = resolveFeedEnrichmentSource({ feedUrl: merged.feedUrl }).bidclubFeedUrl;
    Object.entries(defaultFeed).forEach(([key, defaultValue]) => {
      if ((key === "bidclubFeedUrl" || key === "bidclubShowSlug") &&
        (merged.enrichmentDisabled === true || knownBidclubFeedUrl !== defaultFeed.bidclubFeedUrl ||
          (merged.bidclubFeedUrl && merged.bidclubFeedUrl !== defaultFeed.bidclubFeedUrl))) return;
      // JSON storage omits undefined values; null is also treated as missing.
      if (defaultValue !== undefined && defaultValue !== null && (merged[key as keyof Feed] === null || merged[key as keyof Feed] === undefined)) {
        merged = { ...merged, [key]: defaultValue };
      }
    });
    return merged;
  });
}

export function getStoredFeeds(): Feed[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FEEDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const storedFeeds = parsed as Feed[];
        const mergedFeeds = mergeDefaultFeedFields(storedFeeds);
        const changed = mergedFeeds.some((feed, index) => feed !== storedFeeds[index]);
        if (changed) saveStoredFeeds(mergedFeeds);
        return mergedFeeds;
      }
    }
  } catch (_error) {
    console.warn("Failed to load stored feeds:", _error);
  }
  return [];
}

export function saveStoredFeeds(feeds: Feed[]) {
  try {
    localStorage.setItem(STORAGE_KEY_FEEDS, JSON.stringify(feeds));
  } catch (_error) {
    console.error("Failed to save feeds to localStorage:", _error);
  }
}

function isSortMode(value: unknown): value is SortMode {
  return value === "default" || value === "alphabetical" || value === "unread";
}

export function getStoredSortMode(key: string, fallback: SortMode = "default"): SortMode {
  try {
    const value = localStorage.getItem(key);
    return isSortMode(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function saveStoredSortMode(key: string, mode: SortMode) {
  try {
    localStorage.setItem(key, mode);
  } catch (_error) {
    console.error("Failed to save sort mode to localStorage:", _error);
  }
}

export function getStoredCategories(defaultCategories: string[], feeds: Feed[]): string[] {
  const feedCategories = feeds.map((feed) => feed.category || "未分类");
  const fallback = Array.from(new Set([...defaultCategories, ...feedCategories]));
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CATEGORIES);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) return fallback;
    const stored = parsed.filter((value): value is string => value.trim().length > 0);
    // Once a preference exists it is authoritative for user-managed folders.
    // Only append categories that are still referenced by feeds; merging the
    // defaults again would resurrect a renamed or deleted default folder.
    return Array.from(new Set([...stored, ...feedCategories]));
  } catch {
    return fallback;
  }
}

export function saveStoredCategories(categories: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(categories));
  } catch (e) {
    console.error("Failed to save categories to localStorage:", e);
  }
}

import {
  getAllArticlesFromDB,
  saveArticlesToDB,
  replaceArticlesForFeedsInDB,
  replaceArticlesForFeedsAndMigrateReferencesInDB,
  updateArticleInDB,
  updateArticlesInDB,
  deleteArticlesByIdsFromDB,
  deleteArticlesByFeedIdFromDB,
  migrateArticleNoteIdsInDB,
  migrateFromLocalStorageIfNeeded,
} from "./dbService";
import { normalizeBidclubEnrichmentReference, isVerifiedBidclubEnrichment } from "./bidclubEpisodeCache";

const DEPRECATED_SEED_ARTICLE_IDS = new Set(["init-taixian-1", "init-sspai-1"]);

export async function loadStoredArticlesAsync(): Promise<Article[]> {
  // Migration errors intentionally propagate so callers can keep legacy data.
  const migrated = await migrateFromLocalStorageIfNeeded();
  if (migrated.length > 0) {
    const normalized = sanitizeArticles(migrated);
    await saveArticlesToDB(normalized);
    return normalized;
  }

  const fromDB = await getAllArticlesFromDB();
  if (fromDB.length > 0) {
    const normalized = sanitizeArticles(fromDB);
    const normalizedIds = new Set(normalized.map((article) => article.id));
    const removedIds = fromDB
      .filter((article) => !normalizedIds.has(article.id))
      .map((article) => article.id);
    if (removedIds.length > 0) await deleteArticlesByIdsFromDB(removedIds);
    if (fromDB.some((article, index) => article !== normalized[index] || hasLegacyBidclubFields(article))) {
      await saveArticlesToDB(normalized);
    }
    return normalized;
  }

  return [];
}

type LegacyArticle = Article & { bidclubUrl?: string; bidclubSlug?: string };

function episodeIdFromReference(reference?: string): string | undefined {
  const value = reference?.trim();
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.hostname.toLowerCase() !== "bidclub.ai") return undefined;
    return parsed.pathname.match(/^\/e\/([^/]+)/)?.[1];
  } catch {
    return value.replace(/^\/+|\/+$/g, "") || undefined;
  }
}

function hasLegacyBidclubFields(article: Article): boolean {
  const legacy = article as LegacyArticle;
  return !!legacy.bidclubUrl || !!legacy.bidclubSlug;
}

export function normalizeStoredArticle(article: Article): Article {
  const legacy = article as LegacyArticle;
  const legacyEpisodeId = episodeIdFromReference(legacy.bidclubSlug || legacy.bidclubUrl);
  const enrichment = article.enrichment
    ? normalizeBidclubEnrichmentReference(article.enrichment)
    : (legacyEpisodeId
    ? {
        provider: "bidclub" as const,
        episodeId: legacyEpisodeId,
        episodeUrl: legacy.bidclubUrl,
        status: "candidate" as const,
        matchedBy: "legacy" as const,
      }
    : undefined);
  if (!hasLegacyBidclubFields(article) && enrichment === article.enrichment) return article;
  const { bidclubUrl: _legacyUrl, bidclubSlug: _legacySlug, ...current } = legacy;
  return enrichment ? { ...current, enrichment } : current;
}

function sanitizeArticles(articles: Article[]): Article[] {
  return articles
    .filter((article) => !DEPRECATED_SEED_ARTICLE_IDS.has(article.id))
    .map((input: Article) => {
    let a = normalizeStoredArticle(input);
    if (a.audioUrl && a.audioUrl.includes("soundhelix.com")) {
      a = { ...a, audioUrl: undefined, duration: undefined };
    }
    if (
      a.thumbnail &&
      a.thumbnail.includes("FrZIT1qUXdDaKAbF0wUSZ") &&
      !a.feedTitle?.includes("苔藓")
    ) {
      a = { ...a, thumbnail: undefined };
    }
    if (a.thumbnail && a.thumbnail.includes("images.unsplash.com")) {
      a = { ...a, thumbnail: undefined };
    }
    const initMatch = INITIAL_ARTICLES.find(
      (ia) => ia.id === a.id || (ia.title && a.title && ia.title.trim() === a.title.trim())
    );
    if (initMatch) {
      return {
        ...a,
        thumbnail: initMatch.thumbnail || a.thumbnail,
      };
    }
    return a;
    });
}

export function getStoredArticles(): Article[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ARTICLES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return sanitizeArticles(parsed as Article[]);
      }
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveStoredArticles(articles: Article[]) {
  return saveArticlesToDB(articles);
}

export function replaceStoredArticlesForFeeds(feedIds: Iterable<string>, articles: Article[]) {
  return replaceArticlesForFeedsInDB(feedIds, articles);
}

/** Persist a refresh and every persisted reference that follows its article IDs. */
export function replaceStoredArticlesForFeedsAndMigrateReferences(
  feedIds: Iterable<string>,
  articles: Article[],
  articleIdMap: Map<string, string>,
  appStatePatch?: { playlistIds: string[] }
) {
  return replaceArticlesForFeedsAndMigrateReferencesInDB(feedIds, articles, articleIdMap, appStatePatch);
}

export function updateStoredArticleStatus(articleId: string, updates: Partial<Article>) {
  return updateArticleInDB(articleId, updates);
}

export function updateStoredArticlesStatus(articleIds: Iterable<string>, updates: Partial<Article>) {
  return updateArticlesInDB(articleIds, updates);
}

export function deleteStoredArticlesByFeedId(feedId: string) {
  return deleteArticlesByFeedIdFromDB(feedId);
}

export function migrateStoredArticleNoteBackrefs(articleIdMap: Map<string, string>) {
  return migrateArticleNoteIdsInDB(articleIdMap);
}

export interface FeedRefreshResult {
  feed: Pick<Feed, "id" | "title" | "feedUrl">;
  articles: Array<Pick<Article, "id" | "feedId">>;
  error?: unknown;
}

export interface FeedRefreshSummary {
  totalFeeds: number;
  succeededFeeds: number;
  failedFeeds: number;
  newArticles: number;
  failedFeedIds: string[];
  failedFeedUrls: string[];
  failedFeedErrors: Record<string, string>;
}

function getErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return undefined;
}

/** Summarize a refresh while keeping failed feeds visible to the caller. */
export function summarizeFeedRefreshResults(
  feeds: Array<Pick<Feed, "id" | "title" | "feedUrl">>,
  results: Array<FeedRefreshResult | null | undefined>,
  existingArticles: Array<Pick<Article, "id" | "feedId">> = []
): FeedRefreshSummary {
  const successfulByFeedId = new Map(
    results
      .filter((result): result is FeedRefreshResult => !!result && !result.error)
      .map((result) => [result.feed.id, result])
  );
  const existingArticleKeys = new Set(
    existingArticles.map((article) => `${article.feedId}:${article.id}`)
  );
  const newArticleKeys = new Set<string>();

  successfulByFeedId.forEach((result) => {
    result.articles.forEach((article) => {
      const key = `${article.feedId || result.feed.id}:${article.id}`;
      if (!existingArticleKeys.has(key)) newArticleKeys.add(key);
    });
  });

  const failedFeeds = feeds.filter((feed) => !successfulByFeedId.has(feed.id));
  const failedFeedErrors = Object.fromEntries(
    failedFeeds.flatMap((feed) => {
      const result = results.find((candidate) => candidate?.feed.id === feed.id);
      const message = getErrorMessage(result?.error);
      return message ? [[feed.id, message]] : [];
    })
  );
  return {
    totalFeeds: feeds.length,
    succeededFeeds: successfulByFeedId.size,
    failedFeeds: failedFeeds.length,
    newArticles: newArticleKeys.size,
    failedFeedIds: failedFeeds.map((feed) => feed.id),
    failedFeedUrls: failedFeeds.map((feed) => feed.feedUrl),
    failedFeedErrors,
  };
}

// Fetch single RSS feed from server API
export async function fetchRssFeed(feedUrl: string): Promise<RssParseResponse> {
  const encodeUrl = encodeURIComponent(feedUrl);
  const response = await fetch(`/api/rss/parse?url=${encodeUrl}`);
  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.error || `HTTP ${response.status}: Failed to parse RSS feed`);
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new Error("RSS 源返回了无效数据，暂时无法订阅。");
  }
  const items = parsed && typeof parsed === "object" && "items" in parsed
    ? parsed.items
    : undefined;
  if (!Array.isArray(items)) {
    throw new Error("RSS 源返回了无效数据，暂时无法订阅。");
  }
  return parsed as RssParseResponse;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(parseInt(decimal, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function normalizeEpisodeTitle(title: string): string {
  return decodeHtmlEntities(title)
    .toLowerCase()
    .replace(/\[[^\]]*\]|【[^】]*】/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .replace(/^(ep|episode|第)\d+/i, "");
}

const TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "for",
  "in",
  "is",
  "of",
  "on",
  "the",
  "to",
  "with",
]);

function normalizeEpisodeTitleWords(value: string): string {
  return decodeHtmlEntities(value)
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((word) => !TITLE_STOP_WORDS.has(word))
    .join("") || "";
}

function isPlausibleEpisodeNumber(value?: string): value is string {
  if (!value || !/^\d{1,4}$/.test(value)) return false;
  const number = Number(value);
  // Four-digit years are common in feed titles and episode slugs, but are not
  // reliable episode identifiers.
  return !(value.length === 4 && number >= 1900 && number <= 2099);
}

function getEpisodeNumber(title: string): string | undefined {
  const english = title.match(/\b(?:ep|episode)\s*[#.:：-]?\s*(\d{1,4})\b/i)?.[1];
  if (isPlausibleEpisodeNumber(english)) return english;

  // Real feeds use all of these separators for a leading episode prefix.
  const leadingNumber = title.match(/^\s*(\d{1,4})\s*[.:：．、]/)?.[1];
  if (isPlausibleEpisodeNumber(leadingNumber)) return leadingNumber;

  const chinese = title.match(/第\s*(\d{1,4})\s*(?:集|期)|(?:^|\D)(\d{1,4})\s*(?:集|期)/i);
  const chineseNumber = chinese?.[1] || chinese?.[2];
  if (isPlausibleEpisodeNumber(chineseNumber)) return chineseNumber;

  const hashNumber = title.match(/(?:^|\s)#\s*(\d{1,4})\b/)?.[1];
  return isPlausibleEpisodeNumber(hashNumber) ? hashNumber : undefined;
}

function getCanonicalBidclubEpisodeSlug(reference?: string): string | undefined {
  if (!reference) return undefined;
  try {
    const parsed = new URL(reference);
    if (parsed.hostname.toLowerCase() !== "bidclub.ai") return undefined;
    const slug = parsed.pathname.match(/^\/e\/([^/]+)\/?$/)?.[1];
    return slug ? decodeURIComponent(slug) : undefined;
  } catch {
    return undefined;
  }
}

function getBidclubEpisodeSlugTitle(reference?: string): string | undefined {
  const slug = getCanonicalBidclubEpisodeSlug(reference);
  if (!slug) return undefined;

  const tokens = slug.toLowerCase().split(/[-_]+/).filter(Boolean);
  const dateIndex = tokens.findIndex((token, index) =>
    /^(?:19|20)\d{2}$/.test(token) &&
    /^(?:0?[1-9]|1[0-2])$/.test(tokens[index + 1] || "") &&
    /^(?:0?[1-9]|[12]\d|3[01])$/.test(tokens[index + 2] || "")
  );
  const titleTokens = dateIndex >= 0 ? tokens.slice(dateIndex + 3) : tokens;
  return titleTokens.join(" ");
}

function getBidclubEpisodeNumber(reference?: string): string | undefined {
  const slug = getCanonicalBidclubEpisodeSlug(reference);
  if (!slug) return undefined;

  const tokens = slug.toLowerCase().split(/[-_]+/);
  const dateIndex = tokens.findIndex((token, index) =>
    /^(?:19|20)\d{2}$/.test(token) &&
    /^(?:0?[1-9]|1[0-2])$/.test(tokens[index + 1] || "") &&
    /^(?:0?[1-9]|[12]\d|3[01])$/.test(tokens[index + 2] || "")
  );
  if (dateIndex >= 0) {
    const afterDate = tokens[dateIndex + 3];
    if (isPlausibleEpisodeNumber(afterDate)) return afterDate;
  }

  const marked = slug.match(/(?:^|[-_])(?:ep|episode)[-_]?(\d{1,4})(?:[-_]|$)/i)?.[1];
  if (isPlausibleEpisodeNumber(marked)) return marked;

  // A slug with one non-year numeric token (for example `latetalk-152`) is
  // safe; multiple numeric tokens without a date marker are ambiguous.
  const numericTokens = tokens.filter((token) => isPlausibleEpisodeNumber(token));
  return numericTokens.length === 1 ? numericTokens[0] : undefined;
}

function getReliableTitleMatch(
  title: string,
  candidateTitle: string
): "exact" | "contains" | undefined {
  if (!title || !candidateTitle) return undefined;
  if (title === candidateTitle) return "exact";

  const shorter = title.length <= candidateTitle.length ? title : candidateTitle;
  const longer = title.length > candidateTitle.length ? title : candidateTitle;
  if (shorter.length < 4 || shorter.length / longer.length < 0.5) return undefined;
  return longer.includes(shorter) ? "contains" : undefined;
}

function getReliableSlugTitleMatch(
  normalizedTitle: string,
  originalTitle: string,
  candidateLink?: string
): "exact" | "contains" | undefined {
  const slugTitle = getBidclubEpisodeSlugTitle(candidateLink);
  if (!slugTitle) return undefined;

  return getReliableTitleMatch(normalizedTitle, normalizeEpisodeTitle(slugTitle)) ||
    getReliableTitleMatch(normalizeEpisodeTitleWords(originalTitle), normalizeEpisodeTitleWords(slugTitle));
}

export function getArticleEnrichmentId(article: Pick<Article, "enrichment" | "link">): string | undefined {
  if (article.enrichment?.provider === "bidclub") return article.enrichment.episodeId;
  if (!article.link?.includes("bidclub.ai/e/")) return undefined;
  return episodeIdFromReference(article.link);
}

function getBidclubReference(
  item: { link?: string },
  matchedBy: EnrichmentMatchMethod,
  status: EnrichmentReference["status"] = "candidate"
): EnrichmentReference | undefined {
  const link = item.link?.trim();
  const episodeId = episodeIdFromReference(link);
  if (!link || !episodeId) return undefined;
  return {
    provider: "bidclub",
    episodeId,
    episodeUrl: link.startsWith("http") ? link : undefined,
    status,
    matchedBy,
  };
}

const TRACKING_QUERY_KEYS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source",
]);

export function normalizeUrlForMatching(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    Array.from(parsed.searchParams.keys()).forEach((key) => {
      if (key.toLowerCase().startsWith("utm_") || TRACKING_QUERY_KEYS.has(key.toLowerCase())) {
        parsed.searchParams.delete(key);
      }
    });
    parsed.searchParams.sort();
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return value.trim().replace(/\/$/, "") || undefined;
  }
}

function getBidclubSourceUrls(item: { content?: string; snippet?: string; link?: string }): string[] {
  const haystack = `${item.content || ""} ${item.snippet || ""} ${item.link || ""}`;
  return Array.from(new Set(
    [...haystack.matchAll(/https?:\/\/[^"'<>\s)]+/g)]
      .map((match) => normalizeUrlForMatching(match[0].replace(/&amp;/g, "&")))
      .filter((url): url is string => !!url && !url.includes("bidclub.ai/"))
  ));
}

export function getEpisodeMatchKeys(article: Article): string[] {
  const keys: string[] = [`${article.feedId}:id:${article.id}`];
  const slug = getArticleEnrichmentId(article);
  if (slug) keys.push(`${article.feedId}:bidclub:${slug}`);

  const title = normalizeEpisodeTitle(article.title);
  if (title) keys.push(`${article.feedId}:title:${title}`);

  return keys;
}

function parseDurationSeconds(value?: string): number | undefined {
  if (!value) return undefined;
  const parts = value.split(":").map(Number);
  if (parts.some(Number.isNaN)) return undefined;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

export interface BidclubMatchDiagnostics {
  sourceUrl: number;
  episodeNumber: number;
  title: number;
  pubDate: number;
  unmatched: number;
  failedFeeds: number;
}

export interface BidclubMatchResult<T> {
  items: Array<T & { enrichment?: EnrichmentReference }>;
  diagnostics: BidclubMatchDiagnostics;
}

interface BidclubCandidate {
  title: string;
  pubDate: string;
  link: string;
  duration?: string;
  content?: string;
  snippet?: string;
}

/**
 * Match one primary feed against its BidClub helper feed. Source URLs are the
 * authoritative cross-language key; title/episode fallbacks are feed-scoped.
 */
export function matchBidclubItems<T extends { link?: string; title: string; pubDate: string; duration?: string }>(
  primaryItems: T[],
  bidclubItems: BidclubCandidate[],
  options: { allowFallback?: boolean } = {}
): BidclubMatchResult<T> {
  const used = new Set<number>();
  const diagnostics: BidclubMatchDiagnostics = {
    sourceUrl: 0,
    episodeNumber: 0,
    title: 0,
    pubDate: 0,
    unmatched: 0,
    failedFeeds: 0,
  };
  const sourceIndex = new Map<string, number[]>();
  bidclubItems.forEach((candidate, index) => {
    getBidclubSourceUrls(candidate).forEach((sourceUrl) => {
      sourceIndex.set(sourceUrl, [...(sourceIndex.get(sourceUrl) || []), index]);
    });
  });

  const items = primaryItems.map((item) => {
    const sourceUrl = normalizeUrlForMatching(item.link);
    const directMatches = sourceUrl
      ? (sourceIndex.get(sourceUrl) || []).filter((index) => !used.has(index))
      : [];
    if (directMatches.length === 1) {
      const index = directMatches[0];
      const enrichment = getBidclubReference(bidclubItems[index], "source-url");
      if (enrichment) {
        used.add(index);
        diagnostics.sourceUrl += 1;
        return { ...item, enrichment };
      }
    }
    if (directMatches.length > 1 && options.allowFallback === false) {
      diagnostics.unmatched += 1;
      return item;
    }

    if (options.allowFallback === false) {
      diagnostics.unmatched += 1;
      return item;
    }

    const title = normalizeEpisodeTitle(item.title);
    const number = getEpisodeNumber(item.title);
    const pubTime = new Date(item.pubDate).getTime();
    const matches: Array<{ index: number; score: number; matchedBy: "episode-number" | "title" | "pub-date" }> = [];

    bidclubItems.forEach((candidate, index) => {
      if (used.has(index)) return;
      const candidateTitle = normalizeEpisodeTitle(candidate.title);
      const titleMatch = getReliableTitleMatch(title, candidateTitle) ||
        getReliableSlugTitleMatch(title, item.title, candidate.link);
      const candidateNumber = getEpisodeNumber(candidate.title) || getBidclubEpisodeNumber(candidate.link);
      const numberMatch = !!number && number === candidateNumber;
      const candidateTime = new Date(candidate.pubDate).getTime();
      const msApart = Number.isFinite(pubTime) && Number.isFinite(candidateTime)
        ? Math.abs(pubTime - candidateTime)
        : undefined;
      const exactDateMatch = msApart !== undefined && msApart <= 5 * 60_000;
      // Normalization removes episode prefixes, so reject an otherwise identical
      // title when both feeds explicitly identify different episode numbers.
      if (number && candidateNumber && number !== candidateNumber) return;
      if (!titleMatch && !numberMatch && !exactDateMatch) return;

      const daysApart = msApart !== undefined
        ? msApart / 86_400_000
        : undefined;
      const dateMatch = daysApart !== undefined && daysApart <= 2;
      if (daysApart !== undefined && daysApart > 14) return;
      const durationA = parseDurationSeconds(item.duration);
      const durationB = parseDurationSeconds(candidate.duration);
      const durationMatch = durationA !== undefined && durationB !== undefined && Math.abs(durationA - durationB) <= 180;
      if (!dateMatch && !durationMatch) return;
      // Source URL was handled above. Among fallbacks, an explicit episode
      // number plus date/duration is stronger than a translated title alone.
      const score =
        (numberMatch ? 200 : titleMatch === "exact" ? 100 : titleMatch === "contains" ? 70 : 0) +
        (!numberMatch && !titleMatch && exactDateMatch ? 90 : 0) +
        (dateMatch ? 15 : 0) +
        (durationMatch ? 15 : 0);
      if (score >= 80) matches.push({
        index,
        score,
        matchedBy: numberMatch ? "episode-number" : titleMatch ? "title" : "pub-date",
      });
    });

    matches.sort((a, b) => b.score - a.score);
    const best = matches[0];
    // Two similarly plausible episodes are safer left unmatched for later data
    // than silently attaching the wrong digest and transcript.
    if (!best || (matches[1] && best.score - matches[1].score < 10)) {
      diagnostics.unmatched += 1;
      return item;
    }
    used.add(best.index);
    const enrichment = getBidclubReference(bidclubItems[best.index], best.matchedBy);
    if (!enrichment) {
      diagnostics.unmatched += 1;
      return item;
    }
    if (best.matchedBy === "episode-number") diagnostics.episodeNumber += 1;
    else if (best.matchedBy === "pub-date") diagnostics.pubDate += 1;
    else diagnostics.title += 1;
    return { ...item, enrichment };
  });

  return { items, diagnostics };
}

/** Backwards-compatible convenience wrapper for callers that only need items. */
export function attachBidclubMatches<T extends { link?: string; title: string; pubDate: string; duration?: string }>(
  primaryItems: T[],
  bidclubItems: BidclubCandidate[]
): Array<T & { enrichment?: EnrichmentReference }> {
  return matchBidclubItems(primaryItems, bidclubItems).items;
}

export function attachBidclubSelfReferences<T extends { link?: string; enrichment?: EnrichmentReference }>(
  items: T[]
): Array<T & { enrichment?: EnrichmentReference }> {
  return items.map((item) => {
    if (item.enrichment?.provider === "bidclub") return item;
    const enrichment = getBidclubReference(item, "source-url");
    return enrichment ? { ...item, enrichment } : item;
  });
}

interface FeedArticleMatchIndex {
  byId: Map<string, Article[]>;
  byEnrichmentId: Map<string, Article[]>;
  byEpisodeKey: Map<string, Article[]>;
  backReferencesByEpisodeKey: Map<string, Set<Article>>;
  episodeKeysByArticle: Map<Article, string[]>;
  byTitle: Map<string, Article[]>;
  position: Map<Article, number>;
  cursorByCandidates: WeakMap<Article[], number>;
}

function appendArticleIndex(index: Map<string, Article[]>, key: string | undefined, article: Article) {
  if (!key) return;
  const matches = index.get(key);
  if (matches) matches.push(article);
  else index.set(key, [article]);
}

function buildFeedArticleMatchIndex(articles: Article[]): FeedArticleMatchIndex {
  const index: FeedArticleMatchIndex = {
    byId: new Map(),
    byEnrichmentId: new Map(),
    byEpisodeKey: new Map(),
    backReferencesByEpisodeKey: new Map(),
    episodeKeysByArticle: new Map(),
    byTitle: new Map(),
    position: new Map(),
    cursorByCandidates: new WeakMap(),
  };
  articles.forEach((article, position) => {
    index.position.set(article, position);
    appendArticleIndex(index.byId, article.id, article);
    appendArticleIndex(index.byEnrichmentId, getArticleEnrichmentId(article), article);
    const episodeKeys = getEpisodeMatchKeys(article);
    index.episodeKeysByArticle.set(article, episodeKeys);
    episodeKeys.forEach((key) => {
      appendArticleIndex(index.byEpisodeKey, key, article);
      const backReferences = index.backReferencesByEpisodeKey.get(key) || new Set<Article>();
      backReferences.add(article);
      index.backReferencesByEpisodeKey.set(key, backReferences);
    });
    appendArticleIndex(index.byTitle, normalizeEpisodeTitle(article.title), article);
  });
  return index;
}

function removeBackReferenceCandidate(index: FeedArticleMatchIndex, article: Article) {
  index.episodeKeysByArticle.get(article)?.forEach((key) => {
    index.backReferencesByEpisodeKey.get(key)?.delete(article);
  });
}

function firstUnused(
  index: FeedArticleMatchIndex,
  candidates: Article[] | undefined,
  usedOldIds: Set<string>,
): Article | undefined {
  if (!candidates) return undefined;
  let cursor = index.cursorByCandidates.get(candidates) || 0;
  while (cursor < candidates.length && usedOldIds.has(candidates[cursor].id)) cursor += 1;
  index.cursorByCandidates.set(candidates, cursor);
  return candidates[cursor];
}

function firstUnusedForKeys(
  keys: string[],
  candidatesByKey: Map<string, Article[]>,
  index: FeedArticleMatchIndex,
  usedOldIds: Set<string>,
): Article | undefined {
  let first: Article | undefined;
  let firstPosition = Number.POSITIVE_INFINITY;
  keys.forEach((key) => {
    const candidate = firstUnused(index, candidatesByKey.get(key), usedOldIds);
    if (candidate) {
      const position = index.position.get(candidate) ?? Number.POSITIVE_INFINITY;
      if (position < firstPosition) {
        first = candidate;
        firstPosition = position;
      }
    }
  });
  return first;
}

function findIndexedMatchingArticle(
  fresh: Article,
  index: FeedArticleMatchIndex,
  usedOldIds: Set<string>,
): Article | undefined {
  const exact = firstUnused(index, index.byId.get(fresh.id), usedOldIds);
  if (exact) return exact;
  const enrichmentId = getArticleEnrichmentId(fresh);
  const enriched = firstUnused(index, enrichmentId ? index.byEnrichmentId.get(enrichmentId) : undefined, usedOldIds);
  if (enriched) return enriched;
  const episode = firstUnusedForKeys(getEpisodeMatchKeys(fresh), index.byEpisodeKey, index, usedOldIds);
  if (episode) return episode;
  const title = normalizeEpisodeTitle(fresh.title);
  return firstUnused(index, title ? index.byTitle.get(title) : undefined, usedOldIds);
}

export function mergeFetchedFeedArticles(
  existingArticles: Article[],
  fetchedArticles: Article[],
  refreshedFeedIds: Set<string>
): { articles: Article[]; articleIdMap: Map<string, string> } {
  const articleIdMap = new Map<string, string>();
  const fetchedByFeedId = new Map<string, Article[]>();
  fetchedArticles.forEach((article) => {
    const group = fetchedByFeedId.get(article.feedId) || [];
    group.push(article);
    fetchedByFeedId.set(article.feedId, group);
  });

  const existingByFeedId = new Map<string, Article[]>();
  const unchangedArticles: Article[] = [];
  existingArticles.forEach((article) => {
    if (!refreshedFeedIds.has(article.feedId)) {
      unchangedArticles.push(article);
      return;
    }
    const group = existingByFeedId.get(article.feedId) || [];
    group.push(article);
    existingByFeedId.set(article.feedId, group);
  });
  const mergedRefreshedArticles: Article[] = [];

  refreshedFeedIds.forEach((feedId) => {
    const oldForFeed = existingByFeedId.get(feedId) || [];
    const freshForFeed = fetchedByFeedId.get(feedId) || [];
    const matchIndex = buildFeedArticleMatchIndex(oldForFeed);
    const usedOldIds = new Set<string>();
    const emittedFreshIds = new Set<string>();

    freshForFeed.forEach((fresh) => {
      const old = findIndexedMatchingArticle(fresh, matchIndex, usedOldIds);
      if (old) {
        usedOldIds.add(old.id);
        if (old.id !== fresh.id) articleIdMap.set(old.id, fresh.id);
      }

      const migrated = old
        ? {
            ...old,
            ...fresh,
            read: old.read,
            starred: old.starred,
            savedAt: old.savedAt,
            aiSummary: old.aiSummary,
          }
        : fresh;

      if (!emittedFreshIds.has(migrated.id)) {
        emittedFreshIds.add(migrated.id);
        mergedRefreshedArticles.push(migrated);
      }

      const backReferenceCandidates = new Set<Article>();
      getEpisodeMatchKeys(fresh).forEach((key) => {
        matchIndex.backReferencesByEpisodeKey.get(key)?.forEach((candidate) => {
          if (articleIdMap.has(candidate.id)) removeBackReferenceCandidate(matchIndex, candidate);
          else backReferenceCandidates.add(candidate);
        });
      });
      [...backReferenceCandidates]
        .sort((a, b) => (matchIndex.position.get(a) ?? 0) - (matchIndex.position.get(b) ?? 0))
        .forEach((candidate) => {
          if (candidate.id === fresh.id || articleIdMap.has(candidate.id)) return;
          articleIdMap.set(candidate.id, fresh.id);
          removeBackReferenceCandidate(matchIndex, candidate);
        });
    });

    oldForFeed.forEach((old) => {
      if (usedOldIds.has(old.id)) return;
      if (articleIdMap.has(old.id)) return;
      if (old.starred) mergedRefreshedArticles.push(old);
    });
  });

  return {
    articles: [...mergedRefreshedArticles, ...unchangedArticles],
    articleIdMap,
  };
}

export async function backfillArticleBidclubReferences(
  articles: Article[],
  feeds: Feed[],
  fetchFeed: (feedUrl: string) => Promise<RssParseResponse> = fetchRssFeed
): Promise<{
  articles: Article[];
  changed: boolean;
  diagnostics: BidclubMatchDiagnostics;
  failedFeedUrls: string[];
}> {
  const helperFeeds = new Map<string, { feedId?: string; url: string; allowFallback: boolean }>();
  const bidclubPrimaryFeedIds = new Set(
    feeds.filter((feed) => feed.enrichmentDisabled !== true && isBidclubFeedUrl(feed.feedUrl)).map((feed) => feed.id)
  );

  feeds.forEach((feed) => {
    const bidclubFeedUrl = resolveFeedEnrichmentSource(feed).bidclubFeedUrl;
    if (bidclubFeedUrl) {
      helperFeeds.set(bidclubFeedUrl, {
        feedId: feed.id,
        url: bidclubFeedUrl,
        allowFallback: true,
      });
    }
  });
  const jobs = [...helperFeeds.values()];
  const eligibleFeedIds = new Set(jobs.flatMap((job) => job.feedId ? [job.feedId] : []));
  const normalizedArticles = articles.map((article) => {
    const normalized = normalizeStoredArticle(article);
    if (!bidclubPrimaryFeedIds.has(normalized.feedId) || normalized.enrichment?.provider === "bidclub") {
      return normalized;
    }
    const enrichment = getBidclubReference(normalized, "source-url");
    return enrichment ? { ...normalized, enrichment } : normalized;
  });
  const patches = new Map<string, EnrichmentReference>();
  const matchPriority: Record<EnrichmentMatchMethod, number> = {
    "source-url": 5,
    "episode-number": 4,
    title: 3,
    "pub-date": 2,
    api: 2,
    legacy: 1,
  };
  const diagnostics: BidclubMatchDiagnostics = {
    sourceUrl: 0,
    episodeNumber: 0,
    title: 0,
    pubDate: 0,
    unmatched: 0,
    failedFeeds: 0,
  };
  const failedFeedUrls: string[] = [];

  let cursor = 0;
  const worker = async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      const candidates = normalizedArticles.filter((article) => {
        if (isVerifiedBidclubEnrichment(article.enrichment)) return false;
        return !job.feedId || article.feedId === job.feedId;
      });
      if (candidates.length === 0) continue;

      try {
        const helper = await fetchFeed(job.url);
        const result = matchBidclubItems(candidates, helper.items, {
          allowFallback: job.allowFallback,
        });
        diagnostics.sourceUrl += result.diagnostics.sourceUrl;
        diagnostics.episodeNumber += result.diagnostics.episodeNumber;
        diagnostics.title += result.diagnostics.title;
        diagnostics.pubDate += result.diagnostics.pubDate;
        result.items.forEach((article) => {
          if (!article.enrichment) return;
          const existing = patches.get(article.id);
          if (!existing || matchPriority[article.enrichment.matchedBy] > matchPriority[existing.matchedBy]) {
            patches.set(article.id, article.enrichment);
          }
        });
      } catch (error) {
        diagnostics.failedFeeds += 1;
        failedFeedUrls.push(job.url);
        console.warn(`Failed to repair BidClub feed ${job.url}:`, error);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, () => worker()));
  diagnostics.unmatched = articles.filter(
    (article) => eligibleFeedIds.has(article.feedId) &&
      !isVerifiedBidclubEnrichment(article.enrichment) &&
      !patches.has(article.id)
  ).length;
  const nextArticles = normalizedArticles.map((article) => {
    const enrichment = patches.get(article.id);
    return enrichment ? { ...article, enrichment } : article;
  });

  return {
    articles: nextArticles,
    changed: patches.size > 0 || normalizedArticles.some((article, index) => article !== articles[index]),
    diagnostics,
    failedFeedUrls,
  };
}

export function migrateArticleBackrefs(
  values: string[],
    articleIdMap: Map<string, string>
): string[] {
  const migrated = values.map((value) => articleIdMap.get(value) || value);
  return Array.from(new Set(migrated));
}

export function migrateAudioProgressMap(
  progressMap: Record<string, AudioProgress>,
  articleIdMap: Map<string, string>
): Record<string, AudioProgress> {
  const migrated = { ...progressMap };
  articleIdMap.forEach((newId, oldId) => {
    const oldProgress = migrated[oldId];
    if (!oldProgress) return;
    const existing = migrated[newId];
    if (!existing || oldProgress.updatedAt > existing.updatedAt) {
      migrated[newId] = oldProgress;
    }
    delete migrated[oldId];
  });
  return migrated;
}

// Fetch full BidClub episode detail (TL;DR + digest + transcript) from server proxy
export async function fetchBidclubEpisode(episodeUrl: string): Promise<BidclubEpisode> {
  const encodeUrl = encodeURIComponent(episodeUrl);
  const response = await fetch(`/api/bidclub/episode?url=${encodeUrl}`);
  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.error || `HTTP ${response.status}: Failed to fetch BidClub episode`);
  }
  return await response.json();
}

// Summarize an article with the user's configured OpenAI-compatible endpoint.
export async function summarizeArticleWithAI(
  title: string,
  content: string,
  snippet: string,
  source: "article" | "transcript" = "article",
  onProgress?: (progress: number) => void,
): Promise<string> {
  const config = await getAiRequestConfig();
  const response = await fetch(`/api/ai/summarize${onProgress ? "?stream=1" : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, content, snippet, source, ...(config ? { config } : {}) }),
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    const error = new Error(errJson.error || "Failed to generate AI summary.") as Error & { code?: string };
    error.code = errJson.code;
    throw new Error(getAiErrorMessage(error));
  }

  if (onProgress) {
    if (!response.body) throw new Error("无法读取 AI 摘要进度，请稍后重试。");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let summary = "";
    let streamError: (Error & { code?: string }) | null = null;
    const handleLine = (line: string) => {
      if (!line.trim()) return;
      const event = JSON.parse(line) as {
        type?: string;
        progress?: number;
        summary?: string;
        error?: string;
        code?: string;
      };
      if (event.type === "progress" && Number.isFinite(event.progress)) {
        onProgress(Math.min(100, Math.max(0, Math.round(event.progress as number))));
      } else if (event.type === "result" && typeof event.summary === "string") {
        summary = event.summary;
      } else if (event.type === "error") {
        streamError = Object.assign(new Error(event.error || "Failed to generate AI summary."), { code: event.code });
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      lines.forEach(handleLine);
      if (done) break;
    }
    handleLine(buffer);
    if (streamError) throw new Error(getAiErrorMessage(streamError));
    if (!summary) throw new Error("AI 摘要生成失败，请稍后重试。");
    return summary;
  }

  const data = await response.json();
  return data.summary;
}

// Export OPML file
export function exportOpml(feeds: Feed[]) {
  const xmlLines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<opml version="2.0">`,
    `  <head>`,
    `    <title>Inoreader Subscriptions Export</title>`,
    `    <dateCreated>${new Date().toUTCString()}</dateCreated>`,
    `  </head>`,
    `  <body>`,
  ];

  // Group by categories
  const categoriesMap = new Map<string, Feed[]>();
  feeds.forEach((feed) => {
    const cat = feed.category || "Uncategorized";
    if (!categoriesMap.has(cat)) categoriesMap.set(cat, []);
    categoriesMap.get(cat)!.push(feed);
  });

  categoriesMap.forEach((categoryFeeds, catName) => {
    xmlLines.push(`    <outline text="${escapeXml(catName)}" title="${escapeXml(catName)}">`);
    categoryFeeds.forEach((f) => {
      xmlLines.push(
        `      <outline type="rss" text="${escapeXml(f.title)}" title="${escapeXml(
          f.title
        )}" xmlUrl="${escapeXml(f.feedUrl)}" htmlUrl="${escapeXml(f.siteUrl || "")}" />`
      );
    });
    xmlLines.push(`    </outline>`);
  });

  xmlLines.push(`  </body>`, `</opml>`);

  const blob = new Blob([xmlLines.join("\n")], { type: "text/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `inoreader_export_${new Date().toISOString().slice(0, 10)}.opml`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
