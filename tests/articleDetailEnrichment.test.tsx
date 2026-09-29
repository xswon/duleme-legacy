import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Article, BidclubEpisode } from "../src/types";

const hookState = vi.hoisted(() => ({
  value: { episode: null, loading: false, error: null } as {
    episode: BidclubEpisode | null;
    loading: boolean;
    error: string | null;
  },
}));

vi.mock("../src/hooks/useBidclubEpisode", () => ({
  useBidclubEpisode: () => hookState.value,
}));

import { ArticleDetailModal } from "../src/components/ArticleDetailModal";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const article: Article = {
  id: "podcast-1",
  feedId: "feed-1",
  feedTitle: "Podcast",
  title: "Candidate episode",
  link: "https://example.com/episode",
  content: "<p>Original show notes</p>",
  snippet: "Original show notes",
  pubDate: "2026-08-18T00:00:00Z",
  read: false,
  starred: false,
  audioUrl: "https://cdn.example.com/episode.mp3",
  enrichment: {
    provider: "bidclub",
    episodeId: "candidate-episode",
    status: "candidate",
    matchedBy: "legacy",
  },
};

const emptyEpisode = (overrides: Partial<BidclubEpisode> = {}): BidclubEpisode => ({
  title: "Candidate episode",
  dek: "",
  dekAlt: "",
  lang: "zh",
  langAlt: "",
  tldrHtml: "",
  digestHtml: "",
  transcriptHtml: "",
  tldrAltHtml: "",
  digestAltHtml: "",
  chapters: [],
  chaptersAlt: [],
  ...overrides,
});

function renderDetail(detailArticle: Article = article) {
  return renderToStaticMarkup(
    <ArticleDetailModal
      article={detailArticle}
      onClose={vi.fn()}
      onToggleStar={vi.fn()}
      onToggleRead={vi.fn()}
    />
  );
}

beforeEach(() => {
  hookState.value = { episode: null, loading: false, error: null };
});

describe("ArticleDetailModal enrichment timing", () => {
  it("keeps a checking candidate on show notes with a muted AI summary entry", () => {
    hookState.value = { episode: null, loading: true, error: null };
    const html = renderDetail();

    expect(html).toContain("Original show notes");
    expect(html).toContain("正在检查整理内容");
    expect(html).toContain("AI 摘要");
    expect(html).toContain("逐字稿");
    expect(html).not.toContain("增强内容由 BidClub 提供");
    expect(html).not.toContain("已整理");
    expect(html).toContain('data-insight-icon="ai-summary"');
    expect(html).toContain('data-insight-icon="transcript"');
    expect(html).not.toContain("text-violet-500");
  });

  it("keeps show notes when a successful response contains no enrichment", () => {
    hookState.value = { episode: emptyEpisode(), loading: false, error: null };
    const html = renderDetail();

    expect(html).toContain("Original show notes");
    expect(html).toContain("AI 摘要");
    expect(html).toContain("逐字稿");
    expect(html).not.toContain("已整理");
  });

  it("marks the verified overview tab with the violet Sparkle icon", () => {
    hookState.value = {
      episode: emptyEpisode({ tldrHtml: "<p>Verified overview</p>" }),
      loading: false,
      error: null,
    };
    const html = renderDetail({
      ...article,
      enrichment: { ...article.enrichment!, status: "available", matchedBy: "api" },
    });

    expect(html).toContain("正文");
    expect(html).toContain("AI 摘要");
    expect(html).toContain('data-insight-icon="ai-summary"');
    expect(html).not.toContain("text-violet-500");
    expect(html).not.toContain("已整理");
    expect(html).toContain("逐字稿");
  });

  it.each([
    ["digest", emptyEpisode({ digestHtml: "<p>Verified digest</p>" })],
    ["transcript", emptyEpisode({ transcriptHtml: "<p>Verified transcript</p>" })],
  ])("keeps real %s content behind the merged tabs", (_kind, episode) => {
    hookState.value = { episode, loading: false, error: null };
    const html = renderDetail({
      ...article,
      enrichment: { ...article.enrichment!, status: "available", matchedBy: "api" },
    });

    if (_kind === "digest") {
      expect(html).toContain("AI 摘要");
      expect(html).toContain("逐字稿");
      expect(html).toContain('data-insight-icon="ai-summary"');
      expect(html).not.toContain("text-violet-500");
    } else {
      expect(html).toContain("AI 摘要");
      expect(html).toContain("逐字稿");
      expect(html).toContain('data-insight-icon="ai-summary"');
      expect(html).toContain('data-insight-icon="transcript"');
      expect(html).not.toContain("text-violet-500");
    }
    expect(html).not.toContain("已整理");
  });

  it("shows a local error without hiding show notes", () => {
    hookState.value = { episode: null, loading: false, error: "network failure" };
    const html = renderDetail({
      ...article,
      enrichment: { ...article.enrichment!, status: "available", matchedBy: "api" },
    });

    expect(html).toContain("Original show notes");
    expect(html).toContain("整理内容暂时无法加载");
    expect(html).not.toContain("增强内容由 BidClub 提供");
    expect(html).not.toContain("已整理");
    expect(html).not.toContain("AI 整理内容");
  });

  it("persists a failed detail request as a candidate instead of available", async () => {
    hookState.value = { episode: null, loading: false, error: "network failure" };
    const onArticlePatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ArticleDetailModal
          article={{
            ...article,
            enrichment: { ...article.enrichment!, status: "available", matchedBy: "api" },
          }}
          onClose={vi.fn()}
          onToggleStar={vi.fn()}
          onToggleRead={vi.fn()}
          onArticlePatch={onArticlePatch}
        />
      );
    });

    expect(onArticlePatch).toHaveBeenCalledWith("podcast-1", {
      enrichment: expect.objectContaining({ status: "candidate", matchedBy: "api" }),
    });

    await act(async () => root.unmount());
    container.remove();
  });
});
