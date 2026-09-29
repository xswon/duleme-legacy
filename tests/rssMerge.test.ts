import { describe, expect, it } from "vitest";
import type { Article } from "../src/types";
import { mergeFetchedFeedArticles } from "../src/services/rssService";

const article = (id: string, overrides: Partial<Article> = {}): Article => ({
  id,
  feedId: "feed-1",
  feedTitle: "Feed",
  title: id,
  link: `https://example.com/${id}`,
  content: "",
  snippet: "",
  pubDate: "2026-09-24T00:00:00Z",
  read: false,
  starred: false,
  ...overrides,
});
const enrichment = (episodeId: string) => ({
  provider: "bidclub" as const,
  episodeId,
  status: "available" as const,
  matchedBy: "api" as const,
});

describe("indexed refresh merge", () => {
  it("keeps exact-id priority ahead of provider and title matches", () => {
    const exact = article("fresh", { title: "other", read: true });
    const provider = article("provider", { title: "same", enrichment: enrichment("episode"), starred: true });
    const fresh = article("fresh", { title: "same", enrichment: enrichment("episode") });
    const result = mergeFetchedFeedArticles([provider, exact], [fresh], new Set(["feed-1"]));
    expect(result.articles[0]).toMatchObject({ id: "fresh", read: true, starred: false });
  });

  it("matches provider IDs before episode/title keys", () => {
    const titleMatch = article("title", { title: "Shared", read: true });
    const providerMatch = article("provider", { title: "Different", enrichment: enrichment("episode"), starred: true });
    const fresh = article("fresh", { title: "Shared", enrichment: enrichment("episode") });
    expect(mergeFetchedFeedArticles([titleMatch, providerMatch], [fresh], new Set(["feed-1"])).articles[0])
      .toMatchObject({ id: "fresh", read: false, starred: true });
  });

  it("matches normalized episode titles and uses the earliest deterministic tie", () => {
    const first = article("first", { title: "Episode — ONE!", read: true });
    const second = article("second", { title: "episode one", starred: true });
    const fresh = article("fresh", { title: "Episode One" });
    const result = mergeFetchedFeedArticles([first, second], [fresh], new Set(["feed-1"]));
    expect(result.articles[0]).toMatchObject({ id: "fresh", read: true, starred: false });
    expect(result.articleIdMap.get("first")).toBe("fresh");
  });

  it("never reuses a primary old match and retains unmatched starred articles", () => {
    const old = article("old", { title: "Shared", read: true });
    const saved = article("saved", { title: "Unmatched", starred: true });
    const firstFresh = article("fresh-1", { title: "Shared" });
    const secondFresh = article("fresh-2", { title: "Shared" });
    const result = mergeFetchedFeedArticles([old, saved], [firstFresh, secondFresh], new Set(["feed-1"]));
    expect(result.articles.find((item) => item.id === "fresh-1")?.read).toBe(true);
    expect(result.articles.find((item) => item.id === "fresh-2")?.read).toBe(false);
    expect(result.articles.some((item) => item.id === "saved")).toBe(true);
  });

  it("isolates feeds and suppresses duplicate fresh IDs", () => {
    const other = article("old", { feedId: "feed-2", title: "Shared", read: true });
    const fresh = article("fresh", { title: "Shared" });
    const result = mergeFetchedFeedArticles([other], [fresh, { ...fresh }], new Set(["feed-1"]));
    expect(result.articles.filter((item) => item.id === "fresh")).toHaveLength(1);
    expect(result.articles.find((item) => item.id === "fresh")?.read).toBe(false);
    expect(result.articles).toContain(other);
  });
});
