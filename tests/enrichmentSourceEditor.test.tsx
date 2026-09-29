import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Feed, RssParseResponse } from "../src/types";
import { CURATED_FEEDS } from "../src/data/defaultFeeds";

const serviceMocks = vi.hoisted(() => ({
  fetchRssFeed: vi.fn(),
  matchBidclubItems: vi.fn(),
}));

vi.mock("../src/services/rssService", () => ({
  fetchRssFeed: serviceMocks.fetchRssFeed,
  matchBidclubItems: serviceMocks.matchBidclubItems,
  exportOpml: vi.fn(),
}));

import { AddFeedModal } from "../src/components/AddFeedModal";
import { SettingsPage } from "../src/components/ManageFeedsModal";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const parsedFeed: RssParseResponse = {
  title: "Example",
  description: "Example feed",
  link: "https://example.com",
  feedUrl: "https://example.com/feed.xml",
  favicon: "https://example.com/favicon.ico",
  itemCount: 1,
  items: [{
    id: "item-1",
    title: "First item",
    link: "https://example.com/item-1",
    content: "Content",
    snippet: "Snippet",
    pubDate: "2026-08-31T00:00:00Z",
  }],
};

const feed: Feed = {
  id: "feed-1",
  title: "Example",
  feedUrl: "https://example.com/feed.xml",
  siteUrl: "https://example.com",
  category: "未分类",
  unreadCount: 0,
  bidclubFeedUrl: "https://bidclub.ai/feeds/example.xml",
};

function renderAddFeed(onAddFeed = vi.fn()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <AddFeedModal
        isOpen
        onClose={vi.fn()}
        existingFeeds={[]}
        onAddFeed={onAddFeed}
        onImportOpmlFile={vi.fn()}
      />
    );
  });
  return { container, root, onAddFeed };
}

function renderSettings(onUpdateFeedUrls = vi.fn(), currentFeed = feed) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <SettingsPage
        feeds={[currentFeed]}
        categories={["未分类", "科技"]}
        onAddCategory={vi.fn()}
        onRenameCategory={vi.fn()}
        onDeleteCategory={vi.fn()}
        onUpdateFeedCategory={vi.fn()}
        onUpdateFeedUrls={onUpdateFeedUrls}
        onDeleteFeed={vi.fn()}
        onBack={vi.fn()}
        onOpenAddFeed={vi.fn()}
      />
    );
  });
  return { container, root, onUpdateFeedUrls };
}

beforeEach(() => {
  serviceMocks.fetchRssFeed.mockReset();
  serviceMocks.matchBidclubItems.mockReset();
  vi.stubEnv("VITE_ENABLE_ENRICHMENT_SOURCE_EDITOR", "false");
});

afterEach(() => {
  vi.unstubAllEnvs();
  document.body.innerHTML = "";
});

describe("enrichment source editor feature flag", () => {
  it("hides the second Feed input by default", () => {
    const { container, root } = renderAddFeed();

    expect(container.querySelector('input[placeholder*="bidclub"]')).toBeNull();
    expect(container.textContent).not.toContain("内容增强源（高级）");
    act(() => root.unmount());
  });

  it("shows the enrichment source editor in advanced mode", () => {
    vi.stubEnv("VITE_ENABLE_ENRICHMENT_SOURCE_EDITOR", "true");
    const { container, root } = renderAddFeed();

    expect(container.querySelector('input[placeholder*="bidclub"]')).not.toBeNull();
    expect(container.textContent).toContain("内容增强源（高级）");
    expect(container.textContent).toContain("不会替换主 RSS 或音频来源");
    act(() => root.unmount());

    const settings = renderSettings();
    act(() => settings.container.querySelector<HTMLButtonElement>('button[aria-label="编辑Example"]')?.click());
    expect(settings.container.querySelector('input[placeholder*="bidclub"]')).not.toBeNull();
    expect(settings.container.textContent).toContain("内容增强源（高级）");
    act(() => settings.root.unmount());
  });

  it("keeps an existing enrichment URL when a regular user changes only the category", () => {
    const onUpdateFeedUrls = vi.fn();
    const { container, root } = renderSettings(onUpdateFeedUrls);

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="编辑Example"]')?.click());
    const category = container.querySelector<HTMLSelectElement>('select[aria-label="更改Example所属文件夹"]');
    expect(container.querySelector('input[placeholder*="bidclub"]')).toBeNull();
    expect(category).not.toBeNull();
    act(() => {
      if (!category) return;
      category.value = "科技";
      category.dispatchEvent(new Event("change", { bubbles: true }));
    });
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="保存订阅设置"]')?.click());

    expect(onUpdateFeedUrls).toHaveBeenCalledWith("feed-1", { feedUrl: feed.feedUrl });
    act(() => root.unmount());
  });

  it("keeps explicit disablement untouched in regular mode", () => {
    const onUpdateFeedUrls = vi.fn();
    const { container, root } = renderSettings(onUpdateFeedUrls, { ...feed, enrichmentDisabled: true });
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="编辑Example"]')?.click());
    expect(container.textContent).not.toContain("恢复自动增强");
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="保存订阅设置"]')?.click());
    expect(onUpdateFeedUrls).toHaveBeenCalledWith("feed-1", { feedUrl: feed.feedUrl });
    act(() => root.unmount());
  });

  it("offers explicit disable and automatic restore in advanced mode", () => {
    vi.stubEnv("VITE_ENABLE_ENRICHMENT_SOURCE_EDITOR", "true");
    const onUpdateFeedUrls = vi.fn();
    const { container, root } = renderSettings(onUpdateFeedUrls);
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="编辑Example"]')?.click());
    act(() => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "关闭内容增强")?.click());
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="保存订阅设置"]')?.click());
    expect(onUpdateFeedUrls).toHaveBeenCalledWith("feed-1", { feedUrl: feed.feedUrl, enrichmentDisabled: true });
    act(() => root.unmount());

    const restored = renderSettings(onUpdateFeedUrls, { ...feed, enrichmentDisabled: true });
    act(() => restored.container.querySelector<HTMLButtonElement>('button[aria-label="编辑Example"]')?.click());
    act(() => Array.from(restored.container.querySelectorAll("button")).find((button) => button.textContent === "恢复自动增强")?.click());
    act(() => restored.container.querySelector<HTMLButtonElement>('button[aria-label="保存订阅设置"]')?.click());
    expect(onUpdateFeedUrls).toHaveBeenLastCalledWith("feed-1", { feedUrl: feed.feedUrl, enrichmentDisabled: false });
    act(() => restored.root.unmount());
  });

  it("re-enables enhancement when a custom URL is entered in advanced mode", () => {
    vi.stubEnv("VITE_ENABLE_ENRICHMENT_SOURCE_EDITOR", "true");
    const onUpdateFeedUrls = vi.fn();
    const { container, root } = renderSettings(onUpdateFeedUrls, { ...feed, enrichmentDisabled: true });
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="编辑Example"]')?.click());
    const input = container.querySelector<HTMLInputElement>('input[placeholder*="bidclub"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "https://bidclub.ai/feeds/custom.xml");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="保存订阅设置"]')?.click());
    expect(onUpdateFeedUrls).toHaveBeenCalledWith("feed-1", {
      feedUrl: feed.feedUrl,
      enrichmentDisabled: false,
      bidclubFeedUrl: "https://bidclub.ai/feeds/custom.xml",
    });
    act(() => root.unmount());
  });

  it("adds the main RSS when the optional enrichment feed fails", async () => {
    vi.stubEnv("VITE_ENABLE_ENRICHMENT_SOURCE_EDITOR", "true");
    serviceMocks.fetchRssFeed
      .mockResolvedValueOnce(parsedFeed)
      .mockRejectedValueOnce(new Error("enrichment unavailable"));
    const onAddFeed = vi.fn();
    const { container, root } = renderAddFeed(onAddFeed);
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="url"]');
    const setInputValue = (input: HTMLInputElement, value: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };

    act(() => {
      setInputValue(inputs[0], parsedFeed.feedUrl);
      setInputValue(inputs[1], "https://bidclub.ai/feeds/example.xml");
    });
    await act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')?.click());

    expect(onAddFeed).toHaveBeenCalledTimes(1);
    expect(onAddFeed.mock.calls[0][0].feedUrl).toBe(parsedFeed.feedUrl);
    act(() => root.unmount());
  });

  it("can subscribe to a known RSS with enhancement explicitly disabled", async () => {
    vi.stubEnv("VITE_ENABLE_ENRICHMENT_SOURCE_EDITOR", "true");
    const known = CURATED_FEEDS.find((candidate) => candidate.bidclubFeedUrl)!;
    serviceMocks.fetchRssFeed.mockResolvedValueOnce({ ...parsedFeed, feedUrl: known.feedUrl });
    const onAddFeed = vi.fn();
    const { container, root } = renderAddFeed(onAddFeed);
    const input = container.querySelector<HTMLInputElement>('input[type="url"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, known.feedUrl);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "关闭内容增强")?.click();
    });
    await act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')?.click());
    expect(serviceMocks.fetchRssFeed).toHaveBeenCalledTimes(1);
    expect(onAddFeed.mock.calls[0][0]).toMatchObject({ feedUrl: known.feedUrl, enrichmentDisabled: true, bidclubFeedUrl: undefined });
    act(() => root.unmount());
  });
});
