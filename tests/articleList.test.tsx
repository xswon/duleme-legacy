import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ArticleList, formatDurationMinutes } from "../src/components/ArticleList";
import type { Article } from "../src/types";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const article = (overrides: Partial<Article> = {}): Article => ({
  id: "article-1",
  feedId: "feed-1",
  feedTitle: "Example",
  title: "An item",
  link: "https://example.com/item",
  content: "<p>Body</p>",
  snippet: "Body",
  pubDate: "2026-08-18T00:00:00Z",
  read: false,
  starred: false,
  ...overrides,
});

function renderList(item: Article) {
  return renderToStaticMarkup(
    <ArticleList
      articles={[item]}
      onSelectArticle={vi.fn()}
      onToggleStar={vi.fn()}
      onToggleRead={vi.fn()}
      onSummarizeAI={vi.fn()}
      onTogglePlaylist={vi.fn()}
    />
  );
}

describe("ArticleList content capabilities", () => {
  it("exposes source and read state separately from the article heading", () => {
    const unread = renderList(article({ feedTitle: "来源示例" }));
    const read = renderList(article({ read: true }));
    expect(unread).toContain('class="wreader-story-source-meta"');
    expect(unread).toContain('aria-label="未读"');
    expect(unread.indexOf("来源示例")).toBeLessThan(unread.indexOf("<h2"));
    expect(read).not.toContain('aria-label="已读"');
    expect(read).not.toContain('class="wreader-unread-dot"');
    expect(read).not.toContain("opacity-70");
  });

  it("shows audio duration instead of author in the subtitle", () => {
    const html = renderList(article({
      audioUrl: "https://cdn.example.com/episode.mp3",
      duration: "01:02:03",
      author: "Ada",
    }));

    expect(html).toContain("62 分钟");
    expect(html).not.toContain("Ada");
  });

  it("formats feed durations to the nearest minute", () => {
    expect(formatDurationMinutes("01:02:03")).toBe("62 分钟");
    expect(formatDurationMinutes("65")).toBe("1 分钟");
  });

  it("highlights the selected article without adding row-level action controls", () => {
    const html = renderToStaticMarkup(
      <ArticleList
        articles={[article()]}
        selectedArticleId="article-1"
        onSelectArticle={vi.fn()}
        onToggleStar={vi.fn()}
        onToggleRead={vi.fn()}
        onSummarizeAI={vi.fn()}
      />
    );
    expect(html).toContain("is-selected bg-blue-50");
    expect(html).not.toContain("标记为已读");
    expect(html).not.toContain("收藏文章");
  });

  it("does not mark a BidClub candidate as digested or offer playlist controls without audio", () => {
    const html = renderList(article({ enrichment: {
      provider: "bidclub",
      episodeId: "episode-1",
      status: "candidate",
      matchedBy: "legacy",
    } }));

    expect(html).not.toContain("已整理");
    expect(html).not.toContain("加入播放列表");
  });

  it("keeps podcast status in metadata instead of overlaying the thumbnail or title", () => {
    const title = "A very long podcast title that can wrap across multiple lines without moving the icon";
    const html = renderList(
      article({ title, audioUrl: "https://cdn.example.com/episode.mp3", duration: "01:02:03", thumbnail: "https://cdn.example.com/cover.jpg" }),
    );
    const heading = html.slice(html.indexOf("<h2"), html.indexOf("</h2>") + 5);

    expect(heading).not.toContain("播客");
    expect(html).not.toContain('aria-label="播客"');
    expect(html).toContain("62 分钟");
    expect(html).not.toContain("加入待播列表");
    expect(html).not.toContain("lucide-list-plus");
    expect(html).not.toContain("文章概要");
  });

  it("keeps playlist controls out of timeline rows regardless of queue state", () => {
    const item = article({ audioUrl: "https://cdn.example.com/episode.mp3" });
    expect(renderList(item)).not.toContain("lucide-list-plus");
    expect(renderList(item)).not.toContain("加入待播列表");
  });

  it("keeps bookmark controls in the detail toolbar rather than timeline rows", () => {
    const activeHtml = renderList(article({ starred: true }));
    expect(activeHtml).not.toContain("lucide-bookmark");
    expect(activeHtml).not.toContain('aria-label="取消收藏"');
  });

  it("keeps the fallback thumbnail free of a podcast overlay", () => {
    const html = renderList(article({ audioUrl: "https://cdn.example.com/episode.mp3" }));
    const heading = html.slice(html.indexOf("<h2"), html.indexOf("</h2>") + 5);

    expect(html).not.toContain('aria-label="播客"');
    expect(html).not.toContain("bottom-2");
    expect(heading).not.toContain("播客");
  });

  it("keeps enrichment status out of the compact timeline row", () => {
    const item = article({ enrichment: {
      provider: "bidclub",
      episodeId: "episode-1",
      status: "candidate",
      matchedBy: "legacy",
    }, audioUrl: "https://cdn.example.com/episode.mp3" });

    expect(renderList(item)).not.toContain("已整理");
    expect(renderList({ ...item, enrichment: { ...item.enrichment!, status: "available", matchedBy: "api" } })).not.toContain("已整理");
  });

  it("does not show a podcast icon for a non-audio article", () => {
    expect(renderList(article())).not.toContain('aria-label="播客"');
  });

  it("shows an older content entry below the current list and invokes it", () => {
    const onShowOlder = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <ArticleList
          articles={[article()]}
          onSelectArticle={vi.fn()}
          onToggleStar={vi.fn()}
          onToggleRead={vi.fn()}
          onSummarizeAI={vi.fn()}
          olderArticleCount={12}
          onShowOlder={onShowOlder}
        />
      );
    });

    expect(container.textContent).not.toContain("更早内容");
    expect(container.textContent).toContain("继续加载 30 天");
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "继续加载 30 天"
    );
    act(() => button?.click());
    expect(onShowOlder).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    container.remove();
  });

  it("uses the older-content empty state when no recent articles are available", () => {
    const html = renderToStaticMarkup(
      <ArticleList
        articles={[]}
        onSelectArticle={vi.fn()}
        onToggleStar={vi.fn()}
        onToggleRead={vi.fn()}
        onSummarizeAI={vi.fn()}
        olderArticleCount={3}
        onShowOlder={vi.fn()}
      />
    );

    expect(html).toContain("最近 30 天没有内容，还有 3 篇更早内容");
    expect(html).toContain("查看最近 60 天");
    expect(html).not.toContain("未找到相关文章");
  });

  it("uses matching history controls above and below an expanded list", () => {
    const html = renderToStaticMarkup(
      <ArticleList
        articles={[article()]}
        onSelectArticle={vi.fn()}
        onToggleStar={vi.fn()}
        onToggleRead={vi.fn()}
        onSummarizeAI={vi.fn()}
        olderArticleCount={3}
        historyWindowDays={60}
        onShowOlder={vi.fn()}
        onHideOlder={vi.fn()}
      />
    );

    expect(html).toContain("收起至最近 30 天");
    expect(html).toContain("继续加载 30 天");
    expect(html).not.toContain("正在显示最近 60 天");
    expect((html.match(/wreader-timeline-history-control/g) || []).length).toBe(2);
  });

  it("keeps the existing empty state when there are no older articles", () => {
    const html = renderToStaticMarkup(
      <ArticleList
        articles={[]}
        onSelectArticle={vi.fn()}
        onToggleStar={vi.fn()}
        onToggleRead={vi.fn()}
        onSummarizeAI={vi.fn()}
      />
    );

    expect(html).toContain("未找到相关文章");
    expect(html).not.toContain("查看最近 60 天");
  });
});
