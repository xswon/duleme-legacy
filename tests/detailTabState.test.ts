import { describe, expect, it } from "vitest";
import {
  normalizeDetailPresentation,
  resolveArticleDefaultTab,
  resolveDetailTab,
} from "../src/components/detailTabState";
import { Article, ArticlePresentation } from "../src/types";

const articlePresentation: ArticlePresentation = {
  contentType: "article",
  processingState: "raw",
  enrichmentStatus: "none",
  capabilities: {
    hasAudio: false,
    hasCover: false,
    hasBody: true,
    hasOverview: true,
    hasDigest: false,
    hasTranscript: false,
    canGenerateOverview: true,
  },
  overviewState: "can_generate",
  tabs: [{ key: "body", label: "正文" }, { key: "overview", label: "概要" }],
  defaultTab: "body",
};

const digestedPresentation: ArticlePresentation = {
  ...articlePresentation,
  contentType: "podcast",
  processingState: "digested",
  enrichmentStatus: "available",
  enrichmentProvider: "bidclub",
  overviewState: "ready",
  transcriptState: "ready",
  tabs: [
    { key: "overview", label: "内容精华" },
    { key: "digest", label: "深度摘要" },
    { key: "transcript", label: "逐字稿" },
    { key: "body", label: "节目介绍" },
  ],
  defaultTab: "overview",
};

const checkingPresentation: ArticlePresentation = {
  ...digestedPresentation,
  processingState: "raw",
  enrichmentStatus: "checking",
  overviewState: "needs_transcription_config",
  transcriptState: "needs_config",
  tabs: [
    { key: "body", label: "节目介绍" },
    { key: "overview", label: "AI 摘要" },
    { key: "transcript", label: "逐字稿" },
  ],
  defaultTab: "body",
  capabilities: {
    ...digestedPresentation.capabilities,
    hasOverview: false,
    hasDigest: false,
    hasTranscript: false,
  },
};

describe("detail tab state", () => {
  it("recomputes a digested episode default from the new article itself", () => {
    const nextArticle: Article = {
      id: "next",
      feedId: "feed",
      feedTitle: "Podcast",
      title: "Next episode",
      link: "https://example.com/next",
      content: "show notes",
      snippet: "notes",
      pubDate: "2026-08-18T00:00:00Z",
      read: false,
      starred: false,
      audioUrl: "https://example.com/next.mp3",
      enrichment: {
        provider: "bidclub",
        episodeId: "next",
        status: "available",
        matchedBy: "source-url",
      },
    };
    // A previous episode may have resolved to digest-only, but that remote state
    // must not influence the next episode's initial entry point.
    expect(resolveArticleDefaultTab(nextArticle)).toBe("body");
  });

  it("resets to the new article's default tab", () => {
    expect(resolveDetailTab("transcript", articlePresentation, true)).toBe("body");
    expect(resolveDetailTab("transcript", digestedPresentation, true)).toBe("body");
  });

  it("preserves a valid user selection when capabilities resolve", () => {
    expect(resolveDetailTab("digest", digestedPresentation, false)).toBe("overview");
  });

  it("falls back when a selected capability disappears", () => {
    expect(resolveDetailTab("transcript", articlePresentation, false)).toBe("body");
  });

  it("keeps candidate/checking podcast navigation stable", () => {
    expect(normalizeDetailPresentation(checkingPresentation).tabs.map((tab) => tab.key)).toEqual([
      "body",
      "overview",
      "transcript",
    ]);
    expect(resolveDetailTab("body", checkingPresentation, false)).toBe("body");
  });

  it("keeps a valid explicit show-notes selection after real tabs arrive", () => {
    expect(resolveDetailTab("body", digestedPresentation, false)).toBe("body");
    expect(normalizeDetailPresentation(digestedPresentation).tabs.map((tab) => tab.key)).toEqual([
      "body",
      "overview",
      "transcript",
    ]);
  });

  it("keeps the product tab order and labels stable across partial capabilities", () => {
    const presentation = normalizeDetailPresentation({
      ...digestedPresentation,
      tabs: [
        { key: "transcript", label: "逐字稿" },
        { key: "body", label: "节目介绍" },
        { key: "digest", label: "深度摘要" },
        { key: "overview", label: "内容精华" },
      ],
    });

    expect(presentation.tabs).toEqual([
      { key: "body", label: "正文" },
      { key: "overview", label: "AI 摘要" },
      { key: "transcript", label: "逐字稿" },
    ]);
    expect(presentation.defaultTab).toBe("body");
  });
});
