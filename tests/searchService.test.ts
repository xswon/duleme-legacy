import { describe, expect, it } from "vitest";
import { Article } from "../src/types";
import {
  getHighlightSegments,
  getSearchExcerpt,
  getSearchableFields,
  matchesSearchQuery,
  searchArticles,
  stripHtml,
} from "../src/services/searchService";

const article = (overrides: Partial<Article> = {}): Article => ({
  id: "article-1",
  feedId: "feed-1",
  feedTitle: "Example Source",
  title: "A title",
  link: "https://example.com/item",
  content: "<p>Article body</p>",
  snippet: "A short summary",
  pubDate: "2026-08-18T00:00:00Z",
  read: false,
  starred: false,
  ...overrides,
});

describe("searchService", () => {
  it("searches title, HTML body, summary, source, author, and AI summary", () => {
    expect(matchesSearchQuery(article({ title: "Design systems" }), "design")).toBe(true);
    expect(matchesSearchQuery(article({ content: "<p>Reliable observability matters</p>" }), "observability")).toBe(true);
    expect(matchesSearchQuery(article({ snippet: "A summary about indexing" }), "indexing")).toBe(true);
    expect(matchesSearchQuery(article({ feedTitle: "The Research Desk" }), "research")).toBe(true);
    expect(matchesSearchQuery(article({ author: "Ada Lovelace" }), "ada")).toBe(true);
    expect(matchesSearchQuery(article({ aiSummary: "A concise note about retrieval" }), "retrieval")).toBe(true);
  });

  it("requires every query term while allowing terms to match different fields", () => {
    const result = searchArticles(
      [article({ title: "Reader" }), article({ id: "reader-ada", title: "Reader notes", author: "Ada" }), article({ id: "notes", title: "Notes" })],
      "reader ada",
    );
    expect(result.map(({ article: item }) => item.id)).toEqual(["reader-ada"]);
  });

  it("applies search-page filters to the same result set", () => {
    const items = [
      article({ id: "unread", feedId: "one", read: false, starred: true }),
      article({ id: "read", feedId: "two", read: true, starred: true }),
      article({ id: "other", feedId: "one", read: false, starred: false }),
    ];
    expect(searchArticles(items, "", { feedId: "one", read: "UNREAD", starredOnly: true }).map(({ article: item }) => item.id)).toEqual([
      "unread",
    ]);
  });

  it("strips markup and decodes entities without leaving executable HTML", () => {
    expect(stripHtml('<script>alert("x")</script><p>Hello &amp; welcome<br>reader</p>')).toBe("Hello & welcome reader");
    expect(getSearchableFields(article({ content: "<img src=x onerror=alert(1)>Safe" })).content).toBe("Safe");
  });

  it("returns safe highlight segments rather than HTML", () => {
    expect(getHighlightSegments("A <script> tag & a match", "match")).toEqual([
      { text: "A <script> tag & a ", highlighted: false },
      { text: "match", highlighted: true },
    ]);
    expect(getHighlightSegments("Alpha beta", "alpha beta")).toEqual([
      { text: "Alpha", highlighted: true },
      { text: " ", highlighted: false },
      { text: "beta", highlighted: true },
    ]);
  });

  it("builds an excerpt around a body match", () => {
    const item = article({ content: `<p>${"x ".repeat(130)}needle near the end</p>` });
    const excerpt = getSearchExcerpt(item, "needle", 50);
    expect(excerpt).toContain("needle");
    expect(excerpt.length).toBeLessThanOrEqual(52);
  });

  it("preserves NFKC/case matching and reports every matching field", () => {
    const item = article({ title: "Ｆｕｌｌ Reader", content: "<p>reader body</p>", author: "READER team" });
    const [result] = searchArticles([item], "full READER");
    expect(result.article).toBe(item);
    expect(result.matchedFields).toEqual(["title", "content", "author"]);
  });

  it("recomputes cached preprocessing when searchable content changes", () => {
    const item = article({ content: "<p>before</p>" });
    expect(searchArticles([item], "before")).toHaveLength(1);
    item.content = "<p>after</p>";
    expect(searchArticles([item], "before")).toHaveLength(0);
    expect(searchArticles([item], "after")).toHaveLength(1);
  });
});
