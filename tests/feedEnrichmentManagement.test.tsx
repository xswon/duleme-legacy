import React, { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CURATED_FEEDS } from "../src/data/defaultFeeds";
import type { Article, Feed } from "../src/types";

const storageMocks = vi.hoisted(() => ({ updateStoredArticlesStatus: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/services/rssService", () => ({
  saveStoredArticles: vi.fn(),
  updateStoredArticlesStatus: storageMocks.updateStoredArticlesStatus,
}));

import { useFeedManagement } from "../src/hooks/useFeedManagement";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const known = CURATED_FEEDS.find((feed) => feed.bidclubFeedUrl)!;
const initialFeed: Feed = {
  id: "feed-1", title: known.title, feedUrl: known.feedUrl,
  siteUrl: known.siteUrl || known.feedUrl, category: "科技", unreadCount: 0,
  bidclubFeedUrl: known.bidclubFeedUrl,
};
const initialArticle: Article = {
  id: "article-1", feedId: initialFeed.id, feedTitle: initialFeed.title,
  title: "Episode", link: "https://example.com/episode", content: "", snippet: "",
  pubDate: "2026-09-01T00:00:00Z", read: false, starred: false,
  enrichment: { provider: "bidclub", episodeId: "episode-1", status: "candidate", matchedBy: "source-url" },
};

afterEach(() => {
  storageMocks.updateStoredArticlesStatus.mockClear();
  document.body.innerHTML = "";
});

describe("feed management enhancement state", () => {
  it("clears saved article references when enhancement is disabled", async () => {
    let updateFeedUrls!: ReturnType<typeof useFeedManagement>["updateFeedUrls"];
    let currentFeed!: Feed;
    let currentArticle!: Article;
    const invalidateRefresh = vi.fn();
    function Harness() {
      const [feeds, setFeeds] = useState([initialFeed]);
      const [articles, setArticles] = useState([initialArticle]);
      const feedsRef = useRef(feeds);
      const articlesRef = useRef(articles);
      feedsRef.current = feeds;
      articlesRef.current = articles;
      currentFeed = feeds[0];
      currentArticle = articles[0];
      ({ updateFeedUrls } = useFeedManagement({
        feeds, setFeeds, feedsRef, articlesRef, setArticles,
        categories: ["科技"], setCategories: vi.fn(), setFeedOrderByFolder: vi.fn(),
        selectedFeedId: null, setSelectedFeedId: vi.fn(), selectedCategory: null, setSelectedCategory: vi.fn(),
        selectedArticle: null, setSelectedArticleId: vi.fn(), isSettingsOpen: true,
        navigateToRoute: vi.fn(), queueRefresh: vi.fn(), invalidateRefresh, showToast: vi.fn(),
      }));
      return null;
    }
    const root = createRoot(document.body.appendChild(document.createElement("div")));
    await act(async () => root.render(<Harness />));
    await act(async () => updateFeedUrls(initialFeed.id, { feedUrl: initialFeed.feedUrl, enrichmentDisabled: true }));

    expect(storageMocks.updateStoredArticlesStatus).toHaveBeenCalledWith([initialArticle.id], { enrichment: undefined });
    expect(invalidateRefresh).toHaveBeenCalledTimes(1);
    expect(currentFeed).toMatchObject({ enrichmentDisabled: true, bidclubFeedUrl: undefined });
    expect(currentArticle.enrichment).toBeUndefined();
    await act(async () => root.unmount());
  });
});
