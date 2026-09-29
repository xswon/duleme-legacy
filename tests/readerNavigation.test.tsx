import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReaderNavigation } from "../src/hooks/useReaderNavigation";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  const navigation = useReaderNavigation();
  return <div
    data-testid="route"
    data-tab={navigation.activeTab}
    data-filter={navigation.filterType}
    data-feed={navigation.selectedFeedId || ""}
    data-category={navigation.selectedCategory || ""}
    data-query={navigation.searchQuery}
    data-article={navigation.selectedArticleId || ""}
    data-detail={navigation.activeDetailTab || ""}
    data-settings={String(navigation.isSettingsOpen)}
  >
    <button type="button" onClick={() => navigation.navigateToRoute({ activeTab: "feeds", selectedFeedId: "feed/two", selectedCategory: null, articleId: null, detailTab: undefined })}>push-feed</button>
    <button type="button" onClick={() => navigation.navigateToRoute({ activeTab: "search", searchQuery: "local first" }, true)}>replace-search</button>
  </div>;
}

function click(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === text);
  if (!button) throw new Error(`Missing button: ${text}`);
  button.click();
}

async function renderHarness(): Promise<{ root: Root; container: HTMLElement }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<Harness />));
  return { root, container };
}

beforeEach(() => window.history.replaceState({}, "", "/today"));
afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

describe("useReaderNavigation", () => {
  it("hydrates feed/article/detail deep links and preserves push and search replace behavior", async () => {
    window.history.replaceState({}, "", "/feed/feed%2Fone?article=article+1&tab=transcript");
    const pushSpy = vi.spyOn(window.history, "pushState");
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    const { root, container } = await renderHarness();
    const route = container.querySelector('[data-testid="route"]')!;
    expect(route.getAttribute("data-feed")).toBe("feed/one");
    expect(route.getAttribute("data-article")).toBe("article 1");
    expect(route.getAttribute("data-detail")).toBe("transcript");

    await act(async () => click(container, "push-feed"));
    expect(pushSpy).toHaveBeenCalled();
    expect(window.location.pathname).toBe("/feed/feed%2Ftwo");

    await act(async () => click(container, "replace-search"));
    expect(replaceSpy).toHaveBeenCalled();
    expect(window.location.pathname + window.location.search).toBe("/search?q=local+first");
    await act(async () => root.unmount());
  });

  it("synchronizes folder, starred, settings and search routes on popstate", async () => {
    const { root, container } = await renderHarness();
    const route = container.querySelector('[data-testid="route"]')!;
    expect(route.getAttribute("data-tab")).toBe("feeds");
    expect(window.location.pathname).toBe("/today");

    await act(async () => {
      window.history.pushState({}, "", "/folder/Tech?unread=1");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(route.getAttribute("data-category")).toBe("Tech");
    expect(route.getAttribute("data-filter")).toBe("unread");

    await act(async () => {
      window.history.pushState({}, "", "/starred");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(route.getAttribute("data-filter")).toBe("starred");

    await act(async () => {
      window.history.pushState({}, "", "/search?q=reader");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(route.getAttribute("data-tab")).toBe("search");
    expect(route.getAttribute("data-query")).toBe("reader");

    await act(async () => {
      window.history.pushState({}, "", "/settings");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(route.getAttribute("data-tab")).toBe("feeds");
    expect(route.getAttribute("data-settings")).toBe("true");
    await act(async () => root.unmount());
  });
});
