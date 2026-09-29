import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ArticleDetailModal } from "../src/components/ArticleDetailModal";
import type { Article } from "../src/types";

const article: Article = {
  id: "article-without-cover",
  feedId: "feed-1",
  feedTitle: "Example",
  title: "Article without a cover",
  link: "https://example.com/article",
  content: "<p>Readable body</p>",
  snippet: "Readable body",
  pubDate: "2026-08-18T00:00:00Z",
  read: false,
  starred: false,
};

describe("ArticleDetailModal", () => {
  it("uses Mail/MailOpen state icons with explicit read-state labels", () => {
    const unreadHtml = renderToStaticMarkup(
      <ArticleDetailModal
        article={{ ...article, read: false }}
        onClose={vi.fn()}
        onToggleStar={vi.fn()}
        onToggleRead={vi.fn()}
      />
    );
    expect(unreadHtml).toContain('aria-label="标记为已读"');
    expect(unreadHtml).toContain('title="标记为已读"');
    expect(unreadHtml).toContain("lucide-mail-open");
    expect(unreadHtml).not.toContain("lucide-circle");

    const readHtml = renderToStaticMarkup(
      <ArticleDetailModal
        article={{ ...article, read: true }}
        onClose={vi.fn()}
        onToggleStar={vi.fn()}
        onToggleRead={vi.fn()}
      />
    );
    expect(readHtml).toContain('aria-label="标记为未读"');
    expect(readHtml).toContain('title="标记为未读"');
    expect(readHtml).toContain("lucide-mail");
    expect(readHtml).not.toContain("lucide-circle");
  });

  it("renders a coverless article with its body and reorganized actions intact", () => {
    const html = renderToStaticMarkup(
      <ArticleDetailModal
        article={article}
        onClose={vi.fn()}
        onToggleStar={vi.fn()}
        onToggleRead={vi.fn()}
      />
    );

    expect(html).toContain("Article without a cover");
    expect(html).toContain("Readable body");
    expect(html).toContain('title="打开原文"');
    expect(html).toContain('aria-label="打开原文"');
    expect(html).not.toContain('title="更多操作"');
    expect(html).not.toContain(">原文</span>");
    expect(html).not.toContain(">更多</span>");
    expect(html).not.toContain("复制原文链接");
    expect(html).not.toContain("原文来源");
    expect(html).not.toContain("<img");
  });

  it("uses one compact action-button treatment while preserving status colors", () => {
    const html = renderToStaticMarkup(
      <ArticleDetailModal
        article={{ ...article, starred: true, read: false }}
        onClose={vi.fn()}
        onToggleStar={vi.fn()}
        onToggleRead={vi.fn()}
      />
    );

    expect((html.match(/h-9 w-9 min-h-9 min-w-9/g) || []).length).toBe(4);
    expect(html).toContain("sm:h-10 sm:w-10 sm:min-h-10 sm:min-w-10");
    expect(html).toContain("gap-1");
    expect(html).not.toContain("text-amber-500");
    expect(html).toContain("text-blue-600");
    expect(html).toContain("text-slate-600");
    expect(html).toContain("focus-visible:ring-2");
  });

  it("uses the shared icon set for content tabs and keeps metadata ordered", () => {
    const html = renderToStaticMarkup(
      <ArticleDetailModal
        article={{
          ...article,
          author: "author@example.com",
          audioUrl: "https://example.com/audio.mp3",
          localPodcast: {
            sourceAudioUrl: "https://example.com/audio.mp3",
            transcriptionStatus: "completed",
            insightStatus: "completed",
            updatedAt: "now",
          },
        }}
        onClose={vi.fn()}
        onToggleStar={vi.fn()}
        onToggleRead={vi.fn()}
      />
    );

    expect(html).toContain("lucide-file-text");
    expect(html).toContain('data-insight-icon="ai-summary"');
    expect(html).toContain('data-insight-icon="transcript"');
    expect(html.indexOf("author@example.com")).toBeGreaterThan(html.indexOf("Example"));
    // The relative-time formatter switches to a localized calendar date after
    // 30 days; retain the metadata ordering assertion without coupling to it.
    expect(html).toMatch(/author@example\.com<\/span><span>·<\/span><span>/);
    expect(html).not.toContain("已整理");

  });

  it("keeps audio titles free of the redundant headphone icon", () => {
    const html = renderToStaticMarkup(
      <ArticleDetailModal
        article={{ ...article, audioUrl: "https://example.com/audio.mp3" }}
        onClose={vi.fn()}
        onToggleStar={vi.fn()}
        onToggleRead={vi.fn()}
      />
    );

    expect(html).not.toContain('aria-label="音频"');
    expect(html).toContain(">Article without a cover</h1>");
  });

  it("renders as an embedded reader with return, immersion, and body-first article tabs", () => {
    const html = renderToStaticMarkup(
      <ArticleDetailModal
        article={{ ...article, aiSummary: "A concise summary" }}
        onClose={vi.fn()}
        onToggleStar={vi.fn()}
        onToggleRead={vi.fn()}
        onToggleImmersive={vi.fn()}
      />
    );

    expect(html).toContain('id="article-reader"');
    expect(html).toContain('aria-label="返回文章列表"');
    expect(html).toContain('aria-label="进入沉浸模式"');
    expect(html).toContain('aria-label="文章内容"');
    expect((html.match(/role="tab"/g) || []).length).toBe(2);
    expect(html).toContain("正文</button>");
    expect(html).toContain("AI 摘要</button>");
    expect(html).toContain("Readable body");
    // The summary lives behind its own tab now, so the body tab stays uncluttered.
    expect(html).not.toContain('aria-label="AI 摘要"');
    expect(html).not.toContain("A concise summary");
    expect(html).not.toContain('aria-expanded="true"');
    expect(html).not.toContain("收起");
    expect(html).not.toContain(">概要<");
    expect(html).not.toContain("fixed inset-0");
    expect(html).not.toContain('role="dialog"');
  });

  it("keeps article actions in one aligned toolbar with a safe progress fill", () => {
    const html = renderToStaticMarkup(
      <ArticleDetailModal
        article={article}
        onClose={vi.fn()}
        onToggleStar={vi.fn()}
        onToggleRead={vi.fn()}
        onPrevArticle={vi.fn()}
        onNextArticle={vi.fn()}
        onToggleImmersive={vi.fn()}
        savedReadingProgress={Number.NaN}
      />
    );

    expect((html.match(/aria-label="收藏文章"/g) || []).length).toBe(1);
    expect(html).toContain("lucide-star");
    expect(html).not.toContain("lucide-bookmark");
    expect((html.match(/aria-label="标记为已读"/g) || []).length).toBe(1);
    expect((html.match(/aria-label="打开原文"/g) || []).length).toBe(1);
    expect(html).not.toContain('aria-label="更多操作"');
    expect(html).toContain('aria-label="阅读工具栏"');
    expect(html).toContain('class="wreader-reader-actions reader-actions flex shrink-0 items-center gap-1"');
    expect(html).not.toContain('style="grid-column:2;justify-self:center"');
    expect(html).toContain("max-w-[760px]");
    expect(html).toContain('aria-label="返回文章列表"');
    expect(html).not.toContain("pr-10");
    expect(html).toContain('data-reading-progress="true"');
    expect(html).toContain('style="width:0%"');
  });
});
