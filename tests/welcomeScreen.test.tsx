import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CuratedFeedOption } from "../src/types";
import { WelcomeScreen } from "../src/components/WelcomeScreen";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const feeds: CuratedFeedOption[] = [
  {
    id: "feed-a",
    title: "Feed A",
    feedUrl: "https://a.example/feed",
    category: "科技 | 商业",
    description: "A",
    favicon: "https://a.example/favicon.ico",
    featured: true,
    contentType: "podcast",
  },
  {
    id: "feed-b",
    title: "Feed B",
    feedUrl: "https://b.example/feed",
    category: "人文 | 生活",
    description: "B",
    favicon: "https://b.example/favicon.ico",
    featured: true,
    contentType: "article",
  },
];

async function renderWelcome(overrides: Partial<React.ComponentProps<typeof WelcomeScreen>> = {}) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const props = {
    featuredFeeds: feeds,
    onUseFeatured: vi.fn(),
    onImportOpml: vi.fn().mockResolvedValue(true),
    onStartEmpty: vi.fn(),
    ...overrides,
  };
  await act(async () => root.render(<WelcomeScreen {...props} />));
  return { container, root, props };
}

function click(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(text));
  if (!button) throw new Error(`Missing button: ${text}`);
  button.click();
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("WelcomeScreen", () => {
  it("preselects featured feeds and lets the user trim the starter set", async () => {
    const { container, root, props } = await renderWelcome();

    await act(async () => click(container, "使用精选订阅开始"));
    expect(container.textContent).toContain("已选择 2 个订阅");

    await act(async () => click(container, "Feed A"));
    expect(container.textContent).toContain("已选择 1 个订阅");

    await act(async () => click(container, "开始使用"));
    expect(props.onUseFeatured).toHaveBeenCalledWith(["feed-b"], {});

    await act(async () => root.unmount());
  });

  it("keeps the welcome actions separated and shows selectable two-column feed cards", async () => {
    const { container, root } = await renderWelcome();
    const actions = container.querySelector(".mt-8") as HTMLElement;
    expect(actions.className).toContain("gap-3");

    await act(async () => click(container, "使用精选订阅开始"));
    const cards = Array.from(container.querySelectorAll('button[aria-pressed]'));
    expect(cards).toHaveLength(2);
    expect(cards.every((card) => card.getAttribute("aria-pressed") === "true")).toBe(true);
    expect(cards[0].textContent).toContain("播客");
    expect(cards[1].textContent).toContain("文章");
    expect(cards[0].parentElement?.className).toContain("sm:grid-cols-2");
    expect(cards[0].parentElement?.className).toContain("sm:gap-x-6");
    expect(cards[0].className).toContain("wreader-featured-feed-card");
    expect(cards[0].querySelector("img")).toBeNull();

    await act(async () => root.unmount());
  });

  it("uses original RSS artwork for selected podcast feeds", async () => {
    const { container, root, props } = await renderWelcome();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ feedImage: "https://a.example/show-cover.jpg" }),
    }));

    await act(async () => {
      click(container, "使用精选订阅开始");
      await Promise.resolve();
    });

    const podcastCard = container.querySelector('button[aria-pressed]') as HTMLButtonElement;
    expect(podcastCard.querySelector("img")?.src).toBe("https://a.example/show-cover.jpg");
    await act(async () => click(container, "开始使用"));
    expect(props.onUseFeatured).toHaveBeenCalledWith(["feed-a", "feed-b"], {
      "feed-a": "https://a.example/show-cover.jpg",
    });

    await act(async () => root.unmount());
  });

  it("supports starting with an empty library", async () => {
    const { container, root, props } = await renderWelcome();

    await act(async () => click(container, "从空白开始"));
    expect(props.onStartEmpty).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it("passes an OPML file to the existing import flow", async () => {
    const { container, root, props } = await renderWelcome();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["<opml></opml>"], "feeds.opml", { type: "text/xml" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });

    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    expect(props.onImportOpml).toHaveBeenCalledWith(file);
    await act(async () => root.unmount());
  });
});
