import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Article } from "../src/types";
import { ArticleList } from "../src/components/ArticleList";
import { SearchView } from "../src/components/SearchView";
import { VirtualWindow } from "../src/components/VirtualWindow";
import { buildArticleIndexById, getArticleByLogicalOffset } from "../src/services/articleIndex";
import { getUnreadArticleIds } from "../src/services/articleVisibility";
import { searchArticles } from "../src/services/searchService";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const articles = Array.from({ length: 50_000 }, (_, index): Article => ({
  id: `article-${index}`,
  feedId: `feed-${index % 500}`,
  feedTitle: `Feed ${index % 500}`,
  title: `Needle item ${index}`,
  link: `https://example.com/${index}`,
  content: "<p>Needle body</p>",
  snippet: "Needle summary",
  pubDate: "2026-09-24T00:00:00Z",
  read: false,
  starred: false,
}));

const listProps = {
  onSelectArticle: vi.fn(),
  onToggleStar: vi.fn(),
  onToggleRead: vi.fn(),
  onSummarizeAI: vi.fn(),
};

describe("large-list virtualization", () => {
  it("bounds timeline DOM rows and keeps the older control reachable", () => {
    const html = renderToStaticMarkup(
      <ArticleList {...listProps} articles={articles} olderArticleCount={20} onShowOlder={vi.fn()} />,
    );
    expect((html.match(/data-article-id=/g) || []).length).toBeLessThan(200);
    expect(html).toContain('data-virtual-count="50000"');
    expect(html).toContain("继续加载 30 天");
  });

  it("bounds search rows while preserving mounted-row highlighting", () => {
    const results = searchArticles(articles, "needle");
    const html = renderToStaticMarkup(
      <SearchView
        results={results}
        feeds={[]}
        searchQuery="needle"
        setSearchQuery={vi.fn()}
        onSelectArticle={vi.fn()}
        onToggleStar={vi.fn()}
        onToggleRead={vi.fn()}
        onSummarizeAI={vi.fn()}
      />,
    );
    expect((html.match(/wreader-search-result"/g) || []).length).toBeLessThan(200);
    expect(html).toContain('data-virtual-count="50000"');
    expect(html).toContain("<mark");
  });

  it("uses the list offset relative to an offset scroller and updates when content above changes", async () => {
    const scroller = document.createElement("div");
    scroller.className = "wreader-master-scroll";
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 400 },
      clientTop: { configurable: true, value: 4 },
      offsetHeight: { configurable: true, value: 400 },
      offsetWidth: { configurable: true, value: 600 },
    });
    scroller.getBoundingClientRect = () => ({ x: 0, y: 300, top: 300, left: 0, right: 600, bottom: 700, width: 600, height: 400, toJSON: () => ({}) });
    document.body.appendChild(scroller);
    const root = createRoot(scroller);
    let headerHeight = 200;
    const renderWindow = () => root.render(<>
      <div data-testid="virtual-header" style={{ height: headerHeight }} />
      <VirtualWindow className="test-virtual-window" count={50_000} estimateSize={40} overscan={0} renderItem={(index) => <span data-row={index}>{index}</span>} />
    </>);
    await act(async () => {
      renderWindow();
    });
    const virtualRoot = scroller.querySelector<HTMLElement>(".test-virtual-window")!;
    virtualRoot.getBoundingClientRect = () => ({
      x: 0,
      y: 304 + headerHeight - scroller.scrollTop,
      top: 304 + headerHeight - scroller.scrollTop,
      left: 0,
      right: 600,
      bottom: 304 + headerHeight - scroller.scrollTop + virtualRoot.offsetHeight,
      width: 600,
      height: virtualRoot.offsetHeight,
      toJSON: () => ({}),
    });
    await act(async () => {
      renderWindow();
    });
    expect(virtualRoot.dataset.virtualScrollMargin).toBe("200");

    await act(async () => {
      scroller.scrollTop = 1_000;
      scroller.dispatchEvent(new Event("scroll"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const afterScroll = Array.from(scroller.querySelectorAll("[data-row]")).map((node) => Number(node.getAttribute("data-row")));
    expect(Math.min(...afterScroll)).toBe(20);
    expect(afterScroll.length).toBeLessThan(20);

    headerHeight = 320;
    await act(async () => {
      renderWindow();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const afterHeaderResize = Array.from(scroller.querySelectorAll("[data-row]")).map((node) => Number(node.getAttribute("data-row")));
    expect(virtualRoot.dataset.virtualScrollMargin).toBe("320");
    expect(Math.min(...afterHeaderResize)).toBe(17);
    expect(afterHeaderResize.length).toBeLessThan(20);
    await act(async () => root.unmount());
    scroller.remove();
  });

  it("feeds mark-all-read every logical visible ID rather than mounted row IDs", () => {
    const html = renderToStaticMarkup(<ArticleList {...listProps} articles={articles} />);
    const mountedIds = new Set([...html.matchAll(/data-article-id="([^"]+)"/g)].map((match) => match[1]));
    const batchIds = getUnreadArticleIds(articles);

    expect(mountedIds.size).toBeLessThan(200);
    expect(batchIds).toHaveLength(50_000);
    expect(batchIds.at(-1)).toBe("article-49999");
    expect(mountedIds.has(batchIds.at(-1)!)).toBe(false);
  });

  it("navigates through the logical list beyond the initially mounted window", () => {
    const html = renderToStaticMarkup(<ArticleList {...listProps} articles={articles} />);
    const mountedIds = new Set([...html.matchAll(/data-article-id="([^"]+)"/g)].map((match) => match[1]));
    const indexById = buildArticleIndexById(articles);
    let current = articles[0];
    for (let step = 0; step < 1_000; step += 1) {
      current = getArticleByLogicalOffset(articles, indexById, current.id, 1)!;
    }

    expect(current.id).toBe("article-1000");
    expect(mountedIds.has(current.id)).toBe(false);
  });

  it("opens the correct article from a mounted virtual row", async () => {
    const onSelectArticle = vi.fn();
    const scroller = document.createElement("div");
    scroller.className = "wreader-master-scroll";
    Object.defineProperties(scroller, {
      offsetHeight: { configurable: true, value: 800 },
      offsetWidth: { configurable: true, value: 600 },
    });
    document.body.appendChild(scroller);
    const root = createRoot(scroller);
    await act(async () => {
      root.render(<ArticleList {...listProps} onSelectArticle={onSelectArticle} articles={articles} />);
    });
    const row = scroller.querySelector<HTMLElement>("[data-article-id]");
    const id = row?.dataset.articleId;
    await act(async () => row?.click());
    expect(onSelectArticle).toHaveBeenCalledWith(expect.objectContaining({ id }));
    await act(async () => root.unmount());
    scroller.remove();
  });
});
