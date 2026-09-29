import { performance } from "node:perf_hooks";
import type { Article, Feed } from "../src/types";
import { buildArticleLookup } from "../src/services/articleIndex";
import { deriveArticleMetrics } from "../src/services/articleMetrics";
import { deriveTimeline, getLocalCalendarDayWindow } from "../src/services/articleVisibility";
import { getArticleEnrichmentId, getEpisodeMatchKeys, mergeFetchedFeedArticles, normalizeEpisodeTitle } from "../src/services/rssService";
import { getSearchableFields, searchArticles, stripHtml, tokenizeSearchQuery } from "../src/services/searchService";
import { createPerfData, PERF_NOW } from "./perfData";

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function measure(run: () => unknown, runs = 5): number {
  const values = Array.from({ length: runs }, () => {
    const start = performance.now();
    run();
    return performance.now() - start;
  });
  return median(values);
}

function legacyUnread(feeds: Feed[], articles: Article[]) {
  const window = getLocalCalendarDayWindow(30, PERF_NOW)!;
  const counts = feeds.map((feed) => articles.filter((article) => {
    if (article.feedId !== feed.id || article.read) return false;
    const timestamp = new Date(article.pubDate).getTime();
    return Number.isFinite(timestamp) && timestamp >= window.start && timestamp <= window.end;
  }).length);
  return counts.reduce((sum, count) => sum + count, 0) + articles.filter((article) => article.starred).length;
}

function legacyTimeline(articles: Article[], feeds: Feed[]) {
  const window = getLocalCalendarDayWindow(30, PERF_NOW)!;
  return articles.filter((article) => {
    const timestamp = new Date(article.pubDate).getTime();
    if (!Number.isFinite(timestamp) || timestamp < window.start || timestamp > window.end) return false;
    const categoryFeedIds = new Set(feeds.filter((feed) => feed.category === "Category 3").map((feed) => feed.id));
    return categoryFeedIds.has(article.feedId);
  }).sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
}

function legacySearch(articles: Article[], query: string) {
  const preparedTerms = tokenizeSearchQuery(query);
  const matches = articles.filter((article) => {
    const terms = tokenizeSearchQuery(query);
    const text = Object.values(getSearchableFields(article)).join(" ").normalize("NFKC").toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
  return matches.map((article) => Object.values(getSearchableFields(article))
    .filter((field) => preparedTerms.some((term) => stripHtml(field).normalize("NFKC").toLocaleLowerCase().includes(term))));
}

function legacyMerge(existing: Article[], fetched: Article[], refreshedFeedIds: Set<string>) {
  const unchanged = existing.filter((article) => !refreshedFeedIds.has(article.feedId));
  const merged: Article[] = [];
  refreshedFeedIds.forEach((feedId) => {
    const oldForFeed = existing.filter((article) => article.feedId === feedId);
    const freshForFeed = fetched.filter((article) => article.feedId === feedId);
    const used = new Set<string>();
    freshForFeed.forEach((fresh) => {
      const freshKeys = new Set(getEpisodeMatchKeys(fresh));
      const slug = getArticleEnrichmentId(fresh);
      let best: { article: Article; score: number } | undefined;
      oldForFeed.forEach((old) => {
        if (used.has(old.id)) return;
        let score = old.id === fresh.id ? 1000 : 0;
        if (slug && slug === getArticleEnrichmentId(old)) score = Math.max(score, 900);
        if (getEpisodeMatchKeys(old).some((key) => freshKeys.has(key))) score = Math.max(score, 700);
        if (normalizeEpisodeTitle(old.title) === normalizeEpisodeTitle(fresh.title)) score = Math.max(score, 500);
        if (score > 0 && (!best || score > best.score)) best = { article: old, score };
      });
      if (best) used.add(best.article.id);
      merged.push(best ? { ...best.article, ...fresh, read: best.article.read, starred: best.article.starred } : fresh);
    });
  });
  return [...merged, ...unchanged];
}

const { articles, feeds } = createPerfData();
const mergeOld = articles.slice(0, 10_000).map((article, index) => ({ ...article, feedId: "merge-feed", id: `merge-${index}`, title: `Merge ${index}` }));
const mergeFresh = mergeOld.slice(0, 1_000).map((article) => ({ ...article }));
const refreshed = new Set(["merge-feed"]);
const coldArticles = articles.map((article) => ({ ...article }));

const rows = [
  ["lookup build", undefined, measure(() => buildArticleLookup(articles))],
  ["unread aggregation", measure(() => legacyUnread(feeds, articles), 3), measure(() => deriveArticleMetrics(articles, PERF_NOW))],
  ["timeline derivation", measure(() => legacyTimeline(articles, feeds), 3), measure(() => deriveTimeline(articles, feeds, { selectedCategory: "Category 3", now: PERF_NOW }))],
  ["search cold", measure(() => legacySearch(coldArticles, "needle performance"), 1), measure(() => searchArticles(coldArticles, "needle performance"), 1)],
  ["search repeated/warm", measure(() => legacySearch(articles, "needle performance"), 3), (() => { searchArticles(articles, "needle performance"); return measure(() => searchArticles(articles, "needle performance"), 5); })()],
  ["refresh merge", measure(() => legacyMerge(mergeOld, mergeFresh, refreshed), 3), measure(() => mergeFetchedFeedArticles(mergeOld, mergeFresh, refreshed), 5)],
] as const;

console.log("50k deterministic benchmark (median milliseconds; local machine only)");
console.table(rows.map(([path, before, after]) => ({
  path,
  before_ms: before === undefined ? "n/a" : before.toFixed(2),
  after_ms: after.toFixed(2),
})));
