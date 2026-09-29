import { describe, expect, it } from "vitest";
import { buildReaderUrl, parseReaderRoute } from "../src/services/router";

describe("reader URL routing", () => {
  it("round-trips scopes, article selection and detail tabs", () => {
    const url = buildReaderUrl({
      activeTab: "feeds",
      filterType: "all",
      selectedFeedId: "feed/one",
      selectedCategory: null,
      searchQuery: "",
      articleId: "article 1",
      detailTab: "transcript",
    });
    expect(url).toBe("/feed/feed%2Fone?article=article+1&tab=transcript");
    expect(parseReaderRoute({ pathname: "/feed/feed%2Fone", search: "?article=article+1&tab=transcript" })).toMatchObject({
      selectedFeedId: "feed/one",
      articleId: "article 1",
      detailTab: "transcript",
    });
  });

  it("keeps search query separate from article state", () => {
    const route = parseReaderRoute({ pathname: "/search", search: "?q=local%20first&article=a1" });
    expect(route).toMatchObject({ activeTab: "search", searchQuery: "local first", articleId: "a1" });
    expect(buildReaderUrl(route)).toBe("/search?q=local+first&article=a1");
  });

  it("migrates legacy unread URLs and keeps starred as a stable scope", () => {
    const legacyUnread = parseReaderRoute({ pathname: "/unread", search: "" });
    expect(legacyUnread.filterType).toBe("unread");
    expect(buildReaderUrl(legacyUnread)).toBe("/today?unread=1");
    expect(parseReaderRoute({ pathname: "/starred", search: "" }).filterType).toBe("starred");
    expect(buildReaderUrl({ activeTab: "feeds", filterType: "starred", selectedFeedId: null, selectedCategory: null, searchQuery: "", articleId: null })).toBe("/starred");
  });

  it("round-trips timeline filters and history on timeline, feed and folder scopes", () => {
    for (const pathname of ["/today", "/feed/feed-1", "/folder/Tech"]) {
      const route = parseReaderRoute({ pathname, search: "?unread=1&type=podcast&days=60" });
      expect(route).toMatchObject({ filterType: "unread", contentType: "podcast", historyWindowDays: 60 });
      expect(buildReaderUrl(route)).toContain("unread=1");
      expect(buildReaderUrl(route)).toContain("type=podcast");
      expect(buildReaderUrl(route)).toContain("days=60");
    }
  });

  it("omits default filters and rejects unsupported history values", () => {
    const route = parseReaderRoute({ pathname: "/today", search: "?type=video&days=31" });
    expect(route).toMatchObject({ contentType: "all", historyWindowDays: 30 });
    expect(buildReaderUrl(route)).toBe("/today");
  });
});
