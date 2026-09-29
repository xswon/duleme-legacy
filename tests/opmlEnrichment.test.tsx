import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CURATED_FEEDS } from "../src/data/defaultFeeds";
import { useFeedManagement } from "../src/hooks/useFeedManagement";
import type { Feed } from "../src/types";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("OPML import enrichment", () => {
  it("migrates a legacy RSS URL before enrichment without matching unknown feed titles", async () => {
    const known = CURATED_FEEDS.find((feed) => feed.bidclubFeedUrl)!;
    const dwarkesh = CURATED_FEEDS.find((feed) => feed.id === "feed-dwarkesh")!;
    const setFeeds = vi.fn();
    const queueRefresh = vi.fn();
    let importOpmlFile: ReturnType<typeof useFeedManagement>["importOpmlFile"] = async () => false;
    function Harness() {
      ({ importOpmlFile } = useFeedManagement({
        feeds: [], setFeeds, feedsRef: { current: [] }, articlesRef: { current: [] },
        setArticles: vi.fn(), categories: [], setCategories: vi.fn(), setFeedOrderByFolder: vi.fn(),
        selectedFeedId: null, setSelectedFeedId: vi.fn(), selectedCategory: null, setSelectedCategory: vi.fn(),
        selectedArticle: null, setSelectedArticleId: vi.fn(), isSettingsOpen: false,
        navigateToRoute: vi.fn(), queueRefresh, invalidateRefresh: vi.fn(), showToast: vi.fn(),
      }));
      return null;
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<Harness />));
    const xml = `<opml><body><outline title="${known.title}" xmlUrl="${known.feedUrl}"/><outline title="${dwarkesh.title}" xmlUrl="https://apple.dwarkesh-podcast.workers.dev/feed.rss"/><outline title="${dwarkesh.title}" xmlUrl="https://unknown.example/rss.xml"/></body></opml>`;
    const file = new File([xml], "feeds.opml", { type: "text/xml" });
    Object.defineProperty(file, "text", { value: async () => xml });

    await act(async () => expect(await importOpmlFile(file)).toBe(true));

    const saved = setFeeds.mock.calls[0][0]([]) as Feed[];
    expect(saved[0]).toMatchObject({ feedUrl: known.feedUrl, bidclubFeedUrl: known.bidclubFeedUrl, bidclubShowSlug: known.bidclubShowSlug });
    expect(saved[1]).toMatchObject({ feedUrl: dwarkesh.feedUrl, bidclubFeedUrl: dwarkesh.bidclubFeedUrl, bidclubShowSlug: dwarkesh.bidclubShowSlug });
    expect(saved[2]).toMatchObject({ feedUrl: "https://unknown.example/rss.xml", title: dwarkesh.title });
    expect(saved[2].bidclubFeedUrl).toBeUndefined();
    expect(saved[2].bidclubShowSlug).toBeUndefined();
    expect(queueRefresh).toHaveBeenCalledWith(saved.map((feed) => feed.id));
    await act(async () => root.unmount());
  });
});
