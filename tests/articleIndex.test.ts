import { describe, expect, it } from "vitest";
import type { Article } from "../src/types";
import { buildArticleIndexById, buildArticleLookup, derivePlayablePlaylist } from "../src/services/articleIndex";

const article = (id: string, audio = false): Article => ({
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
  audioUrl: audio ? `https://example.com/${id}.mp3` : undefined,
});

describe("article indexes", () => {
  it("keeps canonical references and playlist order while dropping missing and non-audio entries", () => {
    const one = article("one", true);
    const two = article("two");
    const three = article("three", true);
    const lookup = buildArticleLookup([one, two, three]);
    const playlist = derivePlayablePlaylist(["three", "missing", "two", "one"], lookup);

    expect(lookup.byId.get("one")).toBe(one);
    expect(playlist.ids).toEqual(["three", "one"]);
    expect(playlist.articles).toEqual([three, one]);
    expect(playlist.articles[0]).toBe(three);
  });

  it("indexes the entire logical list independently of mounted rows", () => {
    const articles = Array.from({ length: 50_000 }, (_, index) => article(`article-${index}`));
    expect(buildArticleIndexById(articles).get("article-49999")).toBe(49_999);
  });
});
