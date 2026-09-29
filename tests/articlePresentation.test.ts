import { describe, expect, it } from "vitest";
import { resolveArticlePresentation } from "../src/services/articlePresentation";
import type { Article, RuntimeCapabilities } from "../src/types";

const article = (overrides: Partial<Article> = {}): Article => ({
  id: "article-1",
  feedId: "feed-1",
  feedTitle: "Feed",
  title: "Title",
  link: "https://example.com/article",
  content: "<p>Body</p>",
  snippet: "Body",
  pubDate: "2026-08-18T00:00:00.000Z",
  read: false,
  starred: false,
  ...overrides,
});

const runtime = (patch: Partial<RuntimeCapabilities> = {}): RuntimeCapabilities => ({
  aiConfigured: false,
  transcriptionAvailable: false,
  ...patch,
});

const enrichment = (status: "candidate" | "available" = "candidate") => ({
  provider: "bidclub" as const,
  episodeId: "episode-1",
  episodeUrl: "https://bidclub.ai/e/episode-1",
  status,
  matchedBy: status === "available" ? "api" as const : "legacy" as const,
});

describe("article presentation resolver", () => {
  it("keeps ordinary article navigation stable when AI is not configured", () => {
    const result = resolveArticlePresentation(article());

    expect(result.tabs).toEqual([
      { key: "body", label: "正文" },
      { key: "overview", label: "AI 摘要" },
    ]);
    expect(result.overviewState).toBe("needs_ai_config");
    expect(result.transcriptState).toBeUndefined();
    expect(result.capabilities.canGenerateOverview).toBe(false);
  });

  it("lets an ordinary article generate a summary when AI is configured", () => {
    const result = resolveArticlePresentation(article(), {}, runtime({ aiConfigured: true }));

    expect(result.overviewState).toBe("can_generate");
    expect(result.capabilities.canGenerateOverview).toBe(true);
  });

  it("keeps a saved ordinary article summary readable after AI is disabled", () => {
    const result = resolveArticlePresentation(article({ aiSummary: "Saved summary" }));

    expect(result.overviewState).toBe("ready");
    expect(result.capabilities.hasOverview).toBe(true);
  });

  it("keeps audio navigation stable and combines missing configuration", () => {
    const result = resolveArticlePresentation(article({ audioUrl: "https://cdn.example.com/e.mp3" }));

    expect(result.tabs).toEqual([
      { key: "body", label: "节目介绍" },
      { key: "overview", label: "AI 摘要" },
      { key: "transcript", label: "逐字稿" },
    ]);
    expect(result.overviewState).toBe("needs_all_config");
    expect(result.transcriptState).toBe("needs_config");
  });

  it("reports only the missing transcription service", () => {
    const result = resolveArticlePresentation(
      article({ audioUrl: "https://cdn.example.com/e.mp3" }),
      {},
      runtime({ aiConfigured: true, transcriptionAvailable: false }),
    );

    expect(result.overviewState).toBe("needs_transcription_config");
    expect(result.transcriptState).toBe("needs_config");
  });

  it("reports only the missing AI model", () => {
    const result = resolveArticlePresentation(
      article({ audioUrl: "https://cdn.example.com/e.mp3" }),
      {},
      runtime({ aiConfigured: false, transcriptionAvailable: true }),
    );

    expect(result.overviewState).toBe("needs_ai_config");
    expect(result.transcriptState).toBe("can_generate");
  });

  it("makes one-click summary generation available when both services are configured", () => {
    const result = resolveArticlePresentation(
      article({ audioUrl: "https://cdn.example.com/e.mp3" }),
      {},
      runtime({ aiConfigured: true, transcriptionAvailable: true }),
    );

    expect(result.overviewState).toBe("can_generate");
    expect(result.transcriptState).toBe("can_generate");
    expect(result.capabilities.canGenerateOverview).toBe(true);
  });

  it("reports transcription progress without changing navigation", () => {
    const result = resolveArticlePresentation(
      article({
        audioUrl: "https://cdn.example.com/e.mp3",
        transcription: {
          provider: "aliyun",
          sourceAudioUrl: "https://cdn.example.com/e.mp3",
          status: "processing",
          updatedAt: "now",
        },
      }),
      {},
      runtime({ aiConfigured: true, transcriptionAvailable: true }),
    );

    expect(result.tabs.map((tab) => tab.key)).toEqual(["body", "overview", "transcript"]);
    expect(result.overviewState).toBe("transcribing");
    expect(result.transcriptState).toBe("generating");
  });

  it("asks only for AI configuration after a transcript is already ready", () => {
    const result = resolveArticlePresentation(
      article({
        audioUrl: "https://cdn.example.com/e.mp3",
        transcription: {
          provider: "aliyun",
          sourceAudioUrl: "https://cdn.example.com/e.mp3",
          status: "completed",
          segments: [{ startMs: 0, text: "hello" }],
          updatedAt: "now",
        },
      }),
      {},
      runtime({ aiConfigured: false, transcriptionAvailable: false }),
    );

    expect(result.overviewState).toBe("needs_ai_config");
    expect(result.transcriptState).toBe("ready");
    expect(result.capabilities.hasTranscript).toBe(true);
  });

  it("allows transcript-based AI summary generation without requiring transcription config again", () => {
    const result = resolveArticlePresentation(
      article({
        audioUrl: "https://cdn.example.com/e.mp3",
        transcription: {
          provider: "aliyun",
          sourceAudioUrl: "https://cdn.example.com/e.mp3",
          status: "completed",
          segments: [{ startMs: 0, text: "hello" }],
          updatedAt: "now",
        },
      }),
      {},
      runtime({ aiConfigured: true, transcriptionAvailable: false }),
    );

    expect(result.overviewState).toBe("can_generate");
    expect(result.transcriptState).toBe("ready");
    expect(result.capabilities.canGenerateOverview).toBe(true);
  });

  it("recognizes a newly generated transcript-based audio summary as reliable", () => {
    const result = resolveArticlePresentation(
      article({
        audioUrl: "https://cdn.example.com/e.mp3",
        aiSummary: "Transcript summary",
        aiSummarySource: "transcript",
      }),
    );

    expect(result.overviewState).toBe("ready");
    expect(result.capabilities.hasOverview).toBe(true);
  });

  it("does not treat a legacy show-note summary as a transcript-based podcast summary", () => {
    const result = resolveArticlePresentation(
      article({ audioUrl: "https://cdn.example.com/e.mp3", aiSummary: "legacy" }),
    );

    expect(result.overviewState).toBe("needs_all_config");
    expect(result.capabilities.hasOverview).toBe(false);
  });

  it("keeps provider digest and transcript readable independently from user configuration", () => {
    const result = resolveArticlePresentation(
      article({ audioUrl: "https://cdn.example.com/e.mp3", enrichment: enrichment("available") }),
      { status: "available", digest: "<p>Digest</p>", transcript: "<p>Transcript</p>" },
      runtime(),
    );

    expect(result.tabs.map((tab) => tab.key)).toEqual(["body", "overview", "transcript"]);
    expect(result.overviewState).toBe("ready");
    expect(result.transcriptState).toBe("ready");
    expect(result.capabilities).toMatchObject({
      hasOverview: true,
      hasDigest: true,
      hasTranscript: true,
    });
  });

  it("keeps BidClub tabs in a loading state while provider content is being checked", () => {
    const result = resolveArticlePresentation(
      article({ audioUrl: "https://cdn.example.com/e.mp3", enrichment: enrichment("available") }),
      { status: "checking" },
      runtime(),
    );

    expect(result.overviewState).toBe("ready");
    expect(result.transcriptState).toBe("ready");
    expect(result.capabilities).toMatchObject({
      hasOverview: false,
      hasTranscript: false,
      canGenerateOverview: false,
    });
  });

  it("does not infer podcast state from titles", () => {
    const result = resolveArticlePresentation(article({ feedTitle: "Podcast", title: "Episode 12" }));
    expect(result.contentType).toBe("article");
  });
});
