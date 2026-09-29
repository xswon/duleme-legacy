import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RssParseResponse } from "../src/types";

const serviceMocks = vi.hoisted(() => ({
  fetchRssFeed: vi.fn(),
  matchBidclubItems: vi.fn(),
}));

vi.mock("../src/services/rssService", () => ({
  fetchRssFeed: serviceMocks.fetchRssFeed,
  matchBidclubItems: serviceMocks.matchBidclubItems,
}));

import { AddFeedModal } from "../src/components/AddFeedModal";
import { CURATED_FEEDS } from "../src/data/defaultFeeds";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const parsedFeed: RssParseResponse = {
  title: "Example",
  description: "Example feed",
  link: "https://example.com",
  feedUrl: CURATED_FEEDS[0].feedUrl,
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

async function renderModal(onAddFeed = vi.fn(), onShowToast = vi.fn()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <AddFeedModal
        isOpen
        onClose={vi.fn()}
        existingFeeds={[]}
        onAddFeed={onAddFeed}
        onImportOpmlFile={vi.fn()}
        onShowToast={onShowToast}
      />
    );
  });
  return { container, root, onAddFeed, onShowToast };
}

function setInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function subscribeUrl(container: HTMLElement, feedUrl: string, helperUrl?: string) {
  const inputs = container.querySelectorAll<HTMLInputElement>('input[type="url"]');
  await act(async () => {
    setInputValue(inputs[0], feedUrl);
    if (helperUrl) setInputValue(inputs[1], helperUrl);
  });
  await act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')?.click());
}

function buttonWithText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.includes(text)
  );
}

beforeEach(() => {
  serviceMocks.fetchRssFeed.mockReset();
  serviceMocks.matchBidclubItems.mockReset();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("AddFeedModal curated subscriptions", () => {
  it("does not create an empty subscription when fetching a recommendation fails", async () => {
    serviceMocks.fetchRssFeed.mockRejectedValueOnce(new Error("源暂时不可用"));
    const { container, root, onAddFeed } = await renderModal();

    await act(async () => buttonWithText(container, "推荐源")?.click());
    await act(async () => buttonWithText(container, "订阅")?.click());

    expect(onAddFeed).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("源暂时不可用");
    expect(buttonWithText(container, "重试")).toBeTruthy();
    serviceMocks.fetchRssFeed.mockResolvedValueOnce(parsedFeed);
    await act(async () => buttonWithText(container, "重试")?.click());
    expect(onAddFeed).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it("does not create a recommendation whose successful response has no articles", async () => {
    serviceMocks.fetchRssFeed.mockResolvedValueOnce({ ...parsedFeed, items: [], itemCount: 0 });
    const { container, root, onAddFeed } = await renderModal();

    await act(async () => buttonWithText(container, "推荐源")?.click());
    await act(async () => buttonWithText(container, "订阅")?.click());

    expect(onAddFeed).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("未创建订阅");
    await act(async () => root.unmount());
  });

  it("creates a recommendation only after a successful non-empty fetch", async () => {
    serviceMocks.fetchRssFeed.mockResolvedValueOnce(parsedFeed);
    const { container, root, onAddFeed } = await renderModal();

    await act(async () => buttonWithText(container, "推荐源")?.click());
    await act(async () => buttonWithText(container, "订阅")?.click());

    expect(onAddFeed).toHaveBeenCalledTimes(1);
    expect(onAddFeed.mock.calls[0][1]).toHaveLength(1);
    expect(onAddFeed.mock.calls[0][0].bidclubFeedUrl).toBe(CURATED_FEEDS[0].bidclubFeedUrl);
    expect(onAddFeed.mock.calls[0][0].bidclubShowSlug).toBe(CURATED_FEEDS[0].bidclubShowSlug);
    await act(async () => root.unmount());
  });
});

describe("AddFeedModal manual RSS subscriptions", () => {
  it("loads and saves the mapped enrichment source and shows a one-time recommendation notice", async () => {
    const known = CURATED_FEEDS.find((feed) => feed.bidclubFeedUrl)!;
    const helperItems = [{ ...parsedFeed.items[0], id: "helper-1" }];
    serviceMocks.fetchRssFeed.mockResolvedValueOnce(parsedFeed).mockResolvedValueOnce({ ...parsedFeed, items: helperItems });
    serviceMocks.matchBidclubItems.mockReturnValue({ items: parsedFeed.items, diagnostics: {} });
    const { container, root, onAddFeed, onShowToast } = await renderModal();

    await subscribeUrl(container, known.feedUrl);

    expect(serviceMocks.fetchRssFeed.mock.calls.map(([url]) => url)).toEqual([known.feedUrl, known.bidclubFeedUrl]);
    expect(serviceMocks.matchBidclubItems).toHaveBeenCalledWith(parsedFeed.items, helperItems);
    expect(onAddFeed.mock.calls[0][0]).toMatchObject({
      feedUrl: known.feedUrl,
      bidclubFeedUrl: known.bidclubFeedUrl,
      bidclubShowSlug: known.bidclubShowSlug,
    });
    expect(onShowToast).toHaveBeenCalledTimes(1);
    expect(onShowToast).toHaveBeenCalledWith("已识别为推荐节目，可直接使用已提供的摘要、章节或逐字稿。");
    await act(async () => root.unmount());
  });

  it("uses the manually entered enhancement URL before the known mapping", async () => {
    vi.stubEnv("VITE_ENABLE_ENRICHMENT_SOURCE_EDITOR", "true");
    const known = CURATED_FEEDS.find((feed) => feed.bidclubFeedUrl)!;
    const manualUrl = "https://bidclub.ai/feeds/manual.xml";
    serviceMocks.fetchRssFeed.mockResolvedValue(parsedFeed);
    serviceMocks.matchBidclubItems.mockReturnValue({ items: parsedFeed.items, diagnostics: {} });
    const { container, root, onAddFeed } = await renderModal();

    await subscribeUrl(container, known.feedUrl, manualUrl);

    expect(serviceMocks.fetchRssFeed.mock.calls.map(([url]) => url)).toEqual([known.feedUrl, manualUrl]);
    expect(onAddFeed.mock.calls[0][0]).toMatchObject({ feedUrl: known.feedUrl, bidclubFeedUrl: manualUrl });
    expect(onAddFeed.mock.calls[0][0].bidclubShowSlug).toBeUndefined();
    await act(async () => root.unmount());
    vi.unstubAllEnvs();
  });

  it("adds the primary RSS when the automatically mapped helper fails", async () => {
    const known = CURATED_FEEDS.find((feed) => feed.bidclubFeedUrl)!;
    serviceMocks.fetchRssFeed.mockResolvedValueOnce(parsedFeed).mockRejectedValueOnce(new Error("helper failed"));
    const { container, root, onAddFeed } = await renderModal();

    await subscribeUrl(container, known.feedUrl);

    expect(onAddFeed).toHaveBeenCalledTimes(1);
    expect(onAddFeed.mock.calls[0][0].bidclubFeedUrl).toBe(known.bidclubFeedUrl);
    expect(onAddFeed.mock.calls[0][1]).toHaveLength(parsedFeed.items.length);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it("does not show the recommendation notice when saving the subscription fails", async () => {
    const known = CURATED_FEEDS.find((feed) => feed.bidclubFeedUrl)!;
    serviceMocks.fetchRssFeed.mockResolvedValueOnce(parsedFeed).mockRejectedValueOnce(new Error("helper failed"));
    const onAddFeed = vi.fn().mockResolvedValue(false);
    const { container, root, onShowToast } = await renderModal(onAddFeed);

    await subscribeUrl(container, known.feedUrl);

    expect(onAddFeed).toHaveBeenCalledTimes(1);
    expect(onShowToast).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it("does not show a recommendation notice for an unknown RSS with a known program title", async () => {
    serviceMocks.fetchRssFeed.mockResolvedValueOnce({ ...parsedFeed, title: CURATED_FEEDS[0].title });
    const { container, root, onAddFeed, onShowToast } = await renderModal();

    await subscribeUrl(container, "https://unknown.example/rss.xml");

    expect(serviceMocks.fetchRssFeed).toHaveBeenCalledTimes(1);
    expect(onAddFeed.mock.calls[0][0].bidclubFeedUrl).toBeUndefined();
    expect(onShowToast).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});
