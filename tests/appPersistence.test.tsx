import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Article, Feed, RssParseResponse } from "../src/types";
import {
  closeDB,
  replaceFeedsInDB,
  saveAppStateToDB,
  saveArticlesToDB,
} from "../src/services/dbService";

const rss = vi.hoisted(() => ({
  fetchRssFeed: vi.fn(),
  replaceRefreshSnapshot: vi.fn(),
  updateArticle: vi.fn(),
  updateArticles: vi.fn(),
}));

const articleActions = vi.hoisted(() => ({
  toggleRead: undefined as ((articleId: string) => void) | undefined,
  toggleStar: undefined as ((articleId: string) => void) | undefined,
}));

const audioUpdates = vi.hoisted(() => ({
  advance: undefined as (() => void) | undefined,
}));

vi.mock("../src/services/rssService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/rssService")>();
  return {
    ...actual,
    fetchRssFeed: rss.fetchRssFeed,
    replaceStoredArticlesForFeedsAndMigrateReferences: rss.replaceRefreshSnapshot,
    updateStoredArticleStatus: rss.updateArticle,
    updateStoredArticlesStatus: rss.updateArticles,
  };
});

vi.mock("../src/components/Sidebar", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Component mock accepts only the production props exercised by this persistence test.
  Sidebar: ({ setActiveTab }: any) => <button type="button" onClick={() => setActiveTab("playlist")}>test-playlist</button>,
}));

vi.mock("../src/components/Header", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Component mock accepts only the production props exercised by this persistence test.
  Header: ({ setFilterType, onMarkAllRead, onRefresh }: any) => <>
    <button type="button" onClick={() => setFilterType("all")}>test-all-filter</button>
    <button type="button" onClick={() => setFilterType("starred")}>test-starred-filter</button>
    <button type="button" onClick={onMarkAllRead}>test-mark-all</button>
    <button type="button" onClick={onRefresh}>test-refresh</button>
    <button type="button" onClick={() => articleActions.toggleStar?.("a")}>test-newer-star</button>
    <button type="button" onClick={() => articleActions.toggleRead?.("a")}>test-newer-read</button>
  </>,
}));

vi.mock("../src/components/ArticleList", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Component mock accepts only the production props exercised by this persistence test.
  ArticleList: ({ articles, onSelectArticle, onToggleRead, onToggleStar }: any) => {
    articleActions.toggleRead = onToggleRead;
    articleActions.toggleStar = onToggleStar;
    return <div data-testid="articles" data-state={articles.map((article: Article) => `${article.id}:${article.read ? "read" : "unread"}:${article.starred ? "starred" : "plain"}`).join("|")}>
    {articles.map((article: Article) => <button key={article.id} type="button" onClick={() => onSelectArticle(article)}>select-{article.id}</button>)}
    </div>;
  },
}));

vi.mock("../src/components/ArticleDetailModal", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Component mock accepts only the production props exercised by this persistence test.
  ArticleDetailModal: ({ article, onToggleRead, onToggleStar }: any) => <div data-testid="detail">
    <span>{article.id}</span>
    <button type="button" onClick={() => onToggleRead(article.id)}>test-toggle-read</button>
    <button type="button" onClick={() => onToggleStar(article.id)}>test-toggle-star</button>
  </div>,
}));

vi.mock("../src/components/PlaylistView", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Component mock accepts only the production props exercised by this persistence test.
  PlaylistView: ({ articles, audioProgressMap }: any) => <div data-testid="playlist" data-articles={articles.map((article: Article) => article.id).join("|")} data-progress={Object.keys(audioProgressMap).sort().join("|")} />,
}));

vi.mock("../src/components/AddFeedModal", () => ({ AddFeedModal: () => null }));
vi.mock("../src/components/ManageFeedsModal", () => ({ SettingsPage: () => null }));
vi.mock("../src/components/SearchView", () => ({ SearchView: () => null }));
vi.mock("../src/components/NotesView", () => ({ NotesView: () => null }));
vi.mock("../src/components/KeyboardShortcutsModal", () => ({ KeyboardShortcutsModal: () => null }));
vi.mock("../src/hooks/useAudioPlayer", async () => {
  const { useState } = await import("react");
  return {
    useSharedAudioPlayer: () => {
      const [currentTime, setCurrentTime] = useState(0);
      audioUpdates.advance = () => setCurrentTime((value) => value + 1);
      return { stop: vi.fn(), loadArticle: vi.fn(), migrateArticleId: vi.fn(), articleId: null, isPlaying: false, currentTime, duration: 0 };
    },
  };
});
vi.mock("../src/services/localDayRefresh", () => ({ subscribeToLocalDayRefresh: () => () => {} }));

import App from "../src/App";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const feed: Feed = {
  id: "feed-1",
  title: "Feed",
  feedUrl: "https://example.com/feed",
  siteUrl: "https://example.com",
  category: "未分类",
  unreadCount: 0,
};

const article = (id: string, patch: Partial<Article> = {}): Article => ({
  id,
  feedId: feed.id,
  feedTitle: feed.title,
  title: "Same episode",
  link: `https://example.com/${id}`,
  pubDate: "2026-09-23T00:00:00.000Z",
  snippet: "snippet",
  content: "content",
  read: false,
  starred: false,
  ...patch,
});

const remoteFeed = (item: Article): RssParseResponse => ({
  title: feed.title,
  description: "description",
  link: feed.siteUrl,
  feedUrl: feed.feedUrl,
  favicon: "https://example.com/favicon.ico",
  itemCount: 1,
  items: [{
    id: item.id,
    title: item.title,
    link: item.link,
    pubDate: item.pubDate,
    snippet: item.snippet,
    content: item.content,
    audioUrl: item.audioUrl,
    enrichment: item.enrichment,
  }],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (predicate()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  throw new Error(`Timed out waiting for App state: ${document.body.textContent}`);
}

async function resetStorage() {
  await closeDB();
  const databases = await indexedDB.databases();
  await Promise.all(databases.map(({ name }) => name ? new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  }) : Promise.resolve()));
  localStorage.clear();
  window.history.replaceState({}, "", "/today");
}

async function renderApp() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<App />));
  return { container, root };
}

function click(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === text);
  if (!button) throw new Error(`Missing button: ${text}`);
  button.click();
}

beforeEach(async () => {
  await resetStorage();
  rss.fetchRssFeed.mockReset();
  rss.replaceRefreshSnapshot.mockReset();
  rss.updateArticle.mockReset();
  rss.updateArticles.mockReset();
  articleActions.toggleRead = undefined;
  articleActions.toggleStar = undefined;
  audioUpdates.advance = undefined;
  rss.fetchRssFeed.mockRejectedValue(new Error("initial refresh failure"));
  rss.replaceRefreshSnapshot.mockResolvedValue(undefined);
  rss.updateArticle.mockResolvedValue(undefined);
  rss.updateArticles.mockResolvedValue(undefined);
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("App persistence rollback", () => {
  it("keeps a primary RSS refresh successful when its optional enrichment feed fails", async () => {
    const feedWithEnrichment = {
      ...feed,
      bidclubFeedUrl: "https://bidclub.ai/feeds/example.xml",
    };
    const refreshed = article("main-rss-article", {
      snippet: "main feed remains available",
      enrichment: { provider: "bidclub", episodeId: "ep-1", status: "available", matchedBy: "api" },
    });
    await replaceFeedsInDB([feedWithEnrichment]);
    rss.fetchRssFeed
      .mockResolvedValueOnce(remoteFeed(refreshed))
      .mockRejectedValueOnce(new Error("enrichment service unavailable"));

    const { container, root } = await renderApp();
    await waitFor(() => container.textContent?.includes("同步完成：已更新 1 个订阅源") === true);

    expect(rss.fetchRssFeed.mock.calls.map(([url]) => url)).toEqual([
      feedWithEnrichment.feedUrl,
      feedWithEnrichment.bidclubFeedUrl,
    ]);
    expect(container.querySelector('[data-testid="articles"]')?.getAttribute("data-state"))
      .toContain("main-rss-article:unread:plain");
    expect(container.textContent).not.toContain("订阅源同步失败");
    await act(async () => root.unmount());
  });

  it("composes bootstrap, article mutation, navigation and refresh without losing local state", async () => {
    await replaceFeedsInDB([feed]);
    await saveArticlesToDB([article("a")]);
    rss.fetchRssFeed.mockRejectedValueOnce(new Error("initial refresh failure"));
    const refreshed = article("a", { snippet: "refreshed" });

    const { container, root } = await renderApp();
    await waitFor(() => container.querySelector('[data-testid="articles"]')?.getAttribute("data-state") === "a:unread:plain");
    await waitFor(() => container.textContent?.includes("1 个订阅源同步失败") === true);
    await act(async () => click(container, "select-a"));
    expect(window.location.search).toContain("article=a");
    await act(async () => click(container, "test-toggle-read"));
    await waitFor(() => rss.updateArticle.mock.calls.length === 1);

    rss.fetchRssFeed.mockResolvedValueOnce(remoteFeed(refreshed));
    await act(async () => click(container, "test-refresh"));
    await waitFor(() => rss.replaceRefreshSnapshot.mock.calls.length === 1);
    expect(container.querySelector('[data-testid="detail"]')?.textContent).toContain("a");
    expect(container.querySelector('[data-testid="articles"]')?.getAttribute("data-state")).toBe("a:read:plain");
    await act(async () => root.unmount());
  });

  it("does not rebuild a full article-ID Set during audio progress renders", async () => {
    const storedArticles = Array.from({ length: 500 }, (_, index) => article(`perf-${index}`));
    await replaceFeedsInDB([feed]);
    await saveArticlesToDB(storedArticles);
    const { container, root } = await renderApp();
    await waitFor(() => {
      return container.querySelector('[data-testid="articles"]')?.getAttribute("data-state")?.includes("perf-499:") ?? false;
    });

    const NativeSet = globalThis.Set;
    let fullArticleIdCollections = 0;
    class TrackingSet<T> extends NativeSet<T> {
      constructor(values?: Iterable<T> | null) {
        if (
          Array.isArray(values) &&
          values.length === storedArticles.length &&
          values.every((value) => typeof value === "string" && value.startsWith("perf-"))
        ) {
          fullArticleIdCollections += 1;
        }
        super(values ?? undefined);
      }
    }
    vi.stubGlobal("Set", TrackingSet);
    try {
      await act(async () => audioUpdates.advance?.());
      expect(fullArticleIdCollections).toBe(0);
    } finally {
      vi.stubGlobal("Set", NativeSet);
    }

    await act(async () => root.unmount());
  });

  it("keeps retry results out of UI state when refresh persistence fails", async () => {
    const legacy = article("legacy", { audioUrl: "https://cdn.example.com/legacy.mp3" });
    const canonical = article("canonical", { audioUrl: "https://cdn.example.com/canonical.mp3" });
    await replaceFeedsInDB([feed]);
    await saveArticlesToDB([legacy]);
    await saveAppStateToDB({
      playlistIds: [legacy.id],
      audioProgressMap: { [legacy.id]: { currentTime: 4, duration: 10, updatedAt: 1 } },
    });
    rss.fetchRssFeed.mockRejectedValueOnce(new Error("initial refresh failure"));
    rss.fetchRssFeed.mockResolvedValueOnce(remoteFeed(canonical));
    rss.replaceRefreshSnapshot.mockRejectedValueOnce(new Error("IndexedDB replacement failed"));
    const unhandled = vi.fn();
    window.addEventListener("unhandledrejection", unhandled);

    const { container, root } = await renderApp();
    await waitFor(() => Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "重试"));
    await act(async () => click(container, "重试"));
    await waitFor(() => rss.replaceRefreshSnapshot.mock.calls.length === 1);

    expect(container.querySelector('[data-testid="articles"]')?.getAttribute("data-state")).toContain("legacy:");
    expect(container.querySelector('[data-testid="articles"]')?.getAttribute("data-state")).not.toContain("canonical:");
    expect(container.textContent).toContain("1 个订阅源同步失败");
    await act(async () => click(container, "test-playlist"));
    expect(container.querySelector('[data-testid="playlist"]')?.getAttribute("data-articles")).toBe("legacy");
    expect(container.querySelector('[data-testid="playlist"]')?.getAttribute("data-progress")).toBe("legacy");
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(unhandled).not.toHaveBeenCalled();
    window.removeEventListener("unhandledrejection", unhandled);
    await act(async () => root.unmount());
  });

  it("preserves a newer star mutation when clear favorites rolls back", async () => {
    const pending = deferred<void>();
    await replaceFeedsInDB([feed]);
    await saveArticlesToDB([article("a", { starred: true }), article("b", { starred: true })]);
    rss.updateArticles.mockReturnValueOnce(pending.promise);
    const { container, root } = await renderApp();
    await waitFor(() => {
      return container.querySelector('[data-testid="articles"]')?.getAttribute("data-state")?.includes("a:") ?? false;
    });
    await act(async () => click(container, "test-starred-filter"));
    await act(async () => click(container, "test-mark-all"));
    await act(async () => click(container, "test-newer-star"));
    await act(async () => click(container, "test-newer-star"));
    await act(async () => {
      pending.reject(new Error("clear favorites failed"));
      await Promise.resolve();
    });
    await act(async () => click(container, "test-all-filter"));
    await waitFor(() => container.querySelector('[data-testid="articles"]')?.getAttribute("data-state") === "a:unread:plain|b:unread:starred");

    await act(async () => root.unmount());
  });

  it("preserves a newer read mutation when batch mark-read rolls back", async () => {
    const pending = deferred<void>();
    await replaceFeedsInDB([feed]);
    await saveArticlesToDB([article("a"), article("b")]);
    rss.updateArticles.mockReturnValueOnce(pending.promise);
    const { container, root } = await renderApp();
    await waitFor(() => {
      return container.querySelector('[data-testid="articles"]')?.getAttribute("data-state")?.includes("a:unread") ?? false;
    });
    await act(async () => click(container, "test-mark-all"));
    await act(async () => click(container, "test-newer-read"));
    await act(async () => click(container, "test-newer-read"));
    await act(async () => {
      pending.reject(new Error("batch read failed"));
      await Promise.resolve();
    });
    await waitFor(() => container.querySelector('[data-testid="articles"]')?.getAttribute("data-state") === "a:read:plain|b:unread:plain");

    await act(async () => root.unmount());
  });
});
