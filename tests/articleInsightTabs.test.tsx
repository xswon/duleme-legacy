import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ArticleInsightTabs, InsightModel } from "../src/components/ArticleInsightTabs";
import { Article } from "../src/types";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const article: Article = {
  id: "article-1",
  feedId: "feed-1",
  feedTitle: "Example",
  title: "An article",
  link: "https://example.com/article",
  content: "<p>Readable body</p>",
  snippet: "Readable fallback",
  pubDate: "2026-08-18T00:00:00Z",
  read: false,
  starred: false,
};

function renderModel(patch: Partial<InsightModel> = {}) {
  const model: InsightModel = {
    article,
    tab: "body",
    summary: null,
    overviewState: "needs_ai_config",
    transcriptState: undefined,
    enrichmentLoading: false,
    enrichmentError: null,
    onSummarize: vi.fn(),
    summarizing: false,
    summaryError: null,
    ...patch,
  };
  return renderToStaticMarkup(<ArticleInsightTabs model={model} />);
}

function parseMarkup(html: string) {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("ArticleInsightTabs", () => {
  it("uses the same empty-state layout when transcription is not configured", () => {
    const html = renderModel({
      article: { ...article, audioUrl: "https://cdn.example.com/a.mp3" },
      tab: "transcript",
      transcriptState: "needs_config",
      onConfigureTranscription: vi.fn(),
    });
    expect(html).toContain('class="reader-feature-empty"');
    expect(html).toContain("尚无逐字稿");
    expect(html).toContain("配置转录服务后，即可将音频转换为可搜索的文本。");
    expect(html).toContain("配置转录服务");
    expect(html).not.toContain("API Key");
  });

  it.each(["overview", "transcript"] as const)(
    "shows a loading placeholder instead of configuration while BidClub %s is pending",
    (tab) => {
      const html = renderModel({
        article: {
          ...article,
          audioUrl: "https://cdn.example.com/a.mp3",
          enrichment: {
            provider: "bidclub",
            episodeId: "episode-1",
            status: "available",
            matchedBy: "api",
          },
        },
        tab,
        overviewState: "ready",
        transcriptState: "ready",
        enrichmentLoading: true,
      });

      expect(html).toContain("正在加载整理内容");
      expect(html).not.toContain("配置以下服务");
      expect(html).not.toContain(">配置<");
    },
  );

  it("offers explicit transcript generation when transcription is configured", () => {
    const html = renderModel({
      article: { ...article, audioUrl: "https://cdn.example.com/a.mp3" },
      tab: "transcript",
      transcriptState: "can_generate",
      transcriptionMode: "local",
      onStartTranscription: vi.fn(),
    });
    expect(html).toContain("尚无逐字稿");
    expect(html).toContain("将音频转成可阅读文本，方便搜索与回听。");
    expect(html).toContain("转录方式：本地");
    expect(html).toContain("开始转录");
    expect(html).not.toContain("重新转录");
    expect(html).not.toContain("NextEcho");
  });

  it("keeps retranscription out of the transcript empty state", () => {
    const html = renderModel({
      article: { ...article, audioUrl: "https://cdn.example.com/a.mp3" },
      tab: "transcript",
      transcriptState: "can_generate",
      transcriptionMode: "local",
      onStartTranscription: vi.fn(),
      onRegenerateTranscript: vi.fn(),
    });
    expect(html).toContain("开始转录");
    expect(html).not.toContain("已有结果不准确？");
    expect(html).not.toContain("重新转录");
  });

  it("confirms before forcing a local retranscription", async () => {
    const onRegenerateTranscript = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    const model: InsightModel = {
      article: {
        ...article,
        audioUrl: "https://cdn.example.com/a.mp3",
        localPodcast: {
          sourceAudioUrl: "https://cdn.example.com/a.mp3",
          transcriptionStatus: "completed",
          insightStatus: "not_started",
          updatedAt: "now",
        },
      },
      tab: "transcript",
      summary: null,
      overviewState: "ready",
      transcriptState: "ready",
      enrichmentLoading: false,
      enrichmentError: null,
      onSummarize: vi.fn(),
      summarizing: false,
      summaryError: null,
      localArtifacts: {
        transcript: [{ startMs: 0, timestamp: "00:00:00,000", text: "已有逐字稿" }],
      },
      onRegenerateTranscript,
    };
    await act(async () => root.render(<ArticleInsightTabs model={model} />));
    const retranscribe = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "重新转录") as HTMLButtonElement;
    await act(async () => retranscribe.click());
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain("确认重新转录？");
    expect(dialog.textContent).toContain("将使用 Small 模型重新生成本地逐字稿。");
    expect(dialog.textContent).not.toContain("BidClub");
    expect(onRegenerateTranscript).not.toHaveBeenCalled();
    const confirm = Array.from(dialog.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "确认") as HTMLButtonElement;
    await act(async () => confirm.click());
    expect(onRegenerateTranscript).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it("keeps retry and error context in the transcript card", () => {
    const html = renderModel({
      article: {
        ...article,
        audioUrl: "https://cdn.example.com/a.mp3",
        transcription: {
          provider: "aliyun",
          sourceAudioUrl: "https://cdn.example.com/a.mp3",
          status: "failed",
          updatedAt: "now",
          error: "转录请求失败",
        },
      },
      tab: "transcript",
      transcriptState: "can_generate",
      onRetryTranscription: vi.fn(),
    });
    expect(html).toContain("重试生成");
    expect(html).toContain("转录请求失败");
  });

  it("shows two independent configuration shortcuts when both dependencies are missing", () => {
    const html = renderModel({
      article: { ...article, audioUrl: "https://cdn.example.com/a.mp3" },
      tab: "overview",
      overviewState: "needs_all_config",
      onConfigureTranscription: vi.fn(),
      onConfigureAi: vi.fn(),
    });
    const document = parseMarkup(html);
    expect(html).toContain('class="reader-feature-empty"');
    expect(html).toContain("尚无 AI 摘要");
    expect(html).toContain("逐字稿");
    expect(html).toContain("AI 摘要");
    expect(html).toContain("先配置转录服务和 AI 模型，生成时会自动创建逐字稿。");
    expect(document.querySelectorAll("button")).toHaveLength(2);
    expect(Array.from(document.querySelectorAll("button")).map((button) => button.textContent?.trim()))
      .toEqual(["配置转录服务", "配置 AI 模型"]);
    expect(html).not.toContain("开启 AI 摘要");
    expect(html).not.toContain("未配置");
  });

  it("maps single missing dependencies to one focused action", () => {
    const audio = { ...article, audioUrl: "https://cdn.example.com/a.mp3" };

    const needsTranscription = renderModel({
      article: audio,
      tab: "overview",
      overviewState: "needs_transcription_config",
      onConfigureTranscription: vi.fn(),
    });
    expect(needsTranscription).toContain("尚无 AI 摘要");
    expect(needsTranscription).toContain("逐字稿");
    expect(needsTranscription).toContain("配置转录服务");
    expect(needsTranscription).not.toContain("AI 模型");

    const needsAi = renderModel({
      article: audio,
      tab: "overview",
      overviewState: "needs_ai_config",
      onConfigureAi: vi.fn(),
    });
    expect(needsAi).toContain("尚无 AI 摘要");
    expect(needsAi).toContain("AI 摘要");
    expect(needsAi).toContain("配置 AI 模型");
    expect(needsAi).not.toContain("逐字稿");
  });

  it("offers one-click podcast summary generation when both dependencies are ready", () => {
    const html = renderModel({
      article: { ...article, audioUrl: "https://cdn.example.com/a.mp3" },
      tab: "overview",
      overviewState: "can_generate",
      transcriptState: "can_generate",
      onSummarize: vi.fn(),
    });
    expect(html).toContain("尚无 AI 摘要");
    expect(html).toContain("从逐字稿提炼本期要点，方便快速回顾。");
    expect(html).toContain("立即生成");
    expect(html).not.toContain("✨ 生成 AI 摘要");
  });

  it("shows the actual local transcription percentage", () => {
    const html = renderModel({
      article: {
        ...article,
        audioUrl: "https://cdn.example.com/a.mp3",
        localPodcast: {
          sourceAudioUrl: "https://cdn.example.com/a.mp3",
          transcriptionStatus: "processing",
          insightStatus: "not_started",
          updatedAt: "now",
        },
      },
      tab: "transcript",
      transcriptState: "generating",
      localProgress: 63.4,
    });
    expect(html).toContain("转录进度");
    expect(html).toContain("63%");
    expect(html).toContain('aria-valuenow="63"');
    expect(html).toContain("width:63%");
  });

  it("renders the two-stage podcast pipeline", () => {
    const transcribing = renderModel({
      article: {
        ...article,
        audioUrl: "https://cdn.example.com/a.mp3",
        transcription: {
          provider: "aliyun",
          sourceAudioUrl: "https://cdn.example.com/a.mp3",
          status: "processing",
          updatedAt: "now",
        },
      },
      tab: "overview",
      overviewState: "processing",
      pipelineStage: "transcribing",
      pipelinePendingSummary: true,
      onCancelPipeline: vi.fn(),
    });
    expect(transcribing).toContain("正在准备 AI 摘要");
    expect(transcribing).toContain("生成逐字稿");
    expect(transcribing).toContain("生成 AI 摘要");
    expect(transcribing).toContain("取消");

    const summarizing = renderModel({
      article: { ...article, audioUrl: "https://cdn.example.com/a.mp3" },
      tab: "overview",
      overviewState: "processing",
      pipelineStage: "summarizing",
      pipelinePendingSummary: true,
      summaryProgress: 68,
    });
    expect(summarizing).toContain("已完成");
    expect(summarizing).toContain("68%");
    expect(summarizing).toContain('aria-label="AI 摘要进度"');
    expect(summarizing).toContain('aria-valuenow="68"');
    expect(summarizing).toContain("width:68%");
  });

  it("moves generated-summary service and regeneration controls above the card", () => {
    const html = renderModel({
      article: { ...article, audioUrl: "https://cdn.example.com/a.mp3" },
      tab: "overview",
      summary: "Generated summary",
      transcriptState: "ready",
      summaryServiceLabel: "DeepSeek · deepseek-chat",
      onRegenerateSummary: vi.fn(),
    });
    expect(html).toContain("Generated summary");
    expect(html).toContain("摘要模型：DeepSeek · deepseek-chat");
    expect(html).toContain("重新生成");
    expect(html).not.toContain("复制");
    expect(html).not.toContain("原文");
    expect(html).not.toContain("查看完整逐字稿");
  });

  it("renders generated podcast Markdown with collapsed deep highlights", () => {
    const html = renderModel({
      article: { ...article, audioUrl: "https://cdn.example.com/a.mp3" },
      tab: "overview",
      summary: "## 核心摘要\n\n- **核心观点**：正文。\n\n## 深度精华\n\n### 1. 第一部分\n\n深入说明。",
      transcriptState: "ready",
    });
    const document = parseMarkup(html);
    expect(document.querySelector(".bidclub-overview strong")?.textContent).toBe("核心观点");
    expect(document.querySelector(".bidclub-overview h2")).toBeNull();
    expect(document.querySelector(".bidclub-overview")?.textContent).not.toContain("核心摘要");
    expect(document.querySelector(".audio-deep-summary-toggle")?.textContent).toContain("展开深度精华");
    expect(document.querySelector(".audio-deep-summary")?.hasAttribute("hidden")).toBe(true);
    expect(document.querySelector(".bidclub-digest h3")?.textContent).toBe("1. 第一部分");
    expect(html).not.toContain("**核心观点**");
  });

  it("shows precise local transcript timestamps", () => {
    const html = renderModel({
      article: {
        ...article,
        audioUrl: "https://cdn.example.com/a.mp3",
        localPodcast: { sourceAudioUrl: "https://cdn.example.com/a.mp3", transcriptionStatus: "completed", insightStatus: "not_started", updatedAt: "now" },
      },
      tab: "transcript",
      localArtifacts: {
        transcript: [
          { startMs: 754000, timestamp: "00:12:34,000", text: "第一段" },
          { startMs: 6523000, timestamp: "01:48:43,000", text: "第二段" },
        ],
      },
      onRegenerateTranscript: vi.fn(),
    });
    const document = parseMarkup(html);
    const buttons = Array.from(document.querySelectorAll("button.transcript-time"));
    expect(buttons.map((button) => button.textContent)).toEqual(["12:34", "1:48:43"]);
    expect(document.body.textContent).toContain("重新转录");
    expect(html).toContain('data-transcript-start-ms="754000"');
    expect(html).toContain('data-transcript-start-ms="6523000"');
    expect(html).toContain("转录服务：本地 · Small");
    expect(html).not.toContain("NextEcho");
    expect(html).not.toContain("00:12:34,000");
    expect(html).not.toContain("01:48:43,000");
  });

  it("prefers BidClub content while local artifacts can fill missing tabs", () => {
    const bidclub = renderModel({ article: { ...article, audioUrl: "https://cdn.example.com/a.mp3" }, tab: "overview", overviewHtml: "<p>BidClub wins</p>", localArtifacts: { transcript: [], digest: { one_sentence: "Local fallback" } } });
    const local = renderModel({ article: { ...article, audioUrl: "https://cdn.example.com/a.mp3", localPodcast: { sourceAudioUrl: "https://cdn.example.com/a.mp3", transcriptionStatus: "completed", insightStatus: "completed", updatedAt: "now" } }, tab: "digest", localArtifacts: { transcript: [], digest: { chapters: [{ title: "Local chapter", summary: "Local summary" }] } } });
    expect(bidclub).toContain("BidClub wins");
    expect(bidclub).not.toContain("Local fallback");
    expect(local).toContain("Local chapter");
    expect(local).toContain("Local summary");
  });

  it("attributes displayed enhancement content and links to its episode", () => {
    const html = renderModel({
      article: { ...article, audioUrl: "https://cdn.example.com/a.mp3", enrichment: { provider: "bidclub", episodeId: "ep-1", episodeUrl: "https://bidclub.ai/e/ep-1", status: "available", matchedBy: "api" } },
      tab: "overview",
      overviewHtml: "<p>Enhanced summary</p>",
      bidclubEpisodeUrl: "https://bidclub.ai/e/ep-1",
    });
    const document = parseMarkup(html);
    const attribution = document.querySelector('[data-testid="enrichment-attribution"]');
    expect(attribution?.textContent).toContain("增强内容由 BidClub 提供");
    expect(attribution?.querySelector("a")?.getAttribute("href")).toBe("https://bidclub.ai/e/ep-1");
    expect(html).not.toContain("BidClub 摘要");
    expect(html).not.toContain("BidClub 逐字稿");
  });

  it("does not attribute candidate references or user-generated summaries and transcripts", () => {
    const candidate = renderModel({
      article: { ...article, audioUrl: "https://cdn.example.com/a.mp3", enrichment: { provider: "bidclub", episodeId: "ep-1", status: "candidate", matchedBy: "title" } },
      tab: "overview",
      overviewHtml: "",
    });
    const userSummary = renderModel({
      article: { ...article, audioUrl: "https://cdn.example.com/a.mp3", enrichment: { provider: "bidclub", episodeId: "ep-1", status: "available", matchedBy: "api" } },
      tab: "overview",
      summary: "User generated summary",
      overviewHtml: "<p>Other enhanced summary</p>",
    });
    const userTranscript = renderModel({
      article: { ...article, audioUrl: "https://cdn.example.com/a.mp3", enrichment: { provider: "bidclub", episodeId: "ep-1", status: "available", matchedBy: "api" } },
      tab: "transcript",
      localArtifacts: { transcript: [{ startMs: 0, timestamp: "00:00:00,000", text: "User transcript" }] },
    });
    expect(candidate).not.toContain("enrichment-attribution");
    expect(userSummary).toContain("User generated summary");
    expect(userSummary).not.toContain("enrichment-attribution");
    expect(userTranscript).toContain("User transcript");
    expect(userTranscript).not.toContain("enrichment-attribution");
  });

  it("does not add the local retranscription action to BidClub transcripts", () => {
    const html = renderModel({
      article: { ...article, audioUrl: "https://cdn.example.com/a.mp3" },
      tab: "transcript",
      transcriptHtml: "<p>BidClub transcript</p>",
      onRegenerateTranscript: vi.fn(),
    });
    expect(html).toContain("BidClub transcript");
    expect(html).toContain("转录服务：读了么官方转录");
    expect(html).not.toContain("重新转录");
  });

  it("labels prepared summaries as official without exposing regeneration controls", () => {
    const official = renderModel({
      tab: "overview",
      overviewHtml: "<p>Prepared highlights</p>",
      onRegenerateSummary: vi.fn(),
    });

    expect(official).toContain("摘要服务：读了么官方整理");
    expect(official).not.toContain("摘要依据");
    expect(official).not.toContain("重新生成");
  });

  it("keeps the body available when BidClub enrichment fails", () => {
    const html = renderModel({ tab: "body", enrichmentError: "BidClub unavailable" });
    expect(html).toContain("Readable body");
    expect(html).not.toContain("BidClub unavailable");
  });

  it("keeps the body available while enrichment is loading", () => {
    const html = renderModel({ tab: "body", enrichmentLoading: true });
    expect(html).toContain("Readable body");
    expect(html).not.toContain("正在加载整理内容");
  });

  it("does not offer AI generation when the capability is unavailable", () => {
    const html = renderModel({ tab: "overview", overviewHtml: "<p>Prepared highlights</p>" });
    expect(html).toContain("Prepared highlights");
    expect(html).not.toContain("生成文章概要");
  });

  it("scopes enrichment errors to enriched content", () => {
    const html = renderModel({ tab: "digest", enrichmentError: "BidClub unavailable" });
    expect(html).toContain("BidClub unavailable");
    expect(html).not.toContain("Readable body");
  });

  it("renders BidClub overview Markdown without exposing formatting markers", () => {
    const html = renderModel({
      tab: "overview",
      overviewHtml: "**核心观点**：正文说明\n\n- 第一项\n- 第二项",
    });
    expect(html).toContain('class="reader-content bidclub-overview"');
    expect(html).toContain("<strong>核心观点</strong>");
    expect(html).toContain("<ul>");
    expect(html).not.toContain("**");
  });

  it("keeps overview list items semantic so CSS can mark only bold-led viewpoints", () => {
    const html = renderModel({
      tab: "overview",
      overviewHtml: "<ul><li><strong>核心观点</strong>：正文说明</li><li>补充说明，不是观点标题</li></ul>",
    });
    const document = parseMarkup(html);
    const items = Array.from(document.querySelectorAll(".bidclub-overview li"));

    expect(items).toHaveLength(2);
    expect(items[0].querySelector(":scope > strong")?.textContent).toBe("核心观点");
    expect(items[1].querySelector(":scope > strong")).toBeNull();
    expect(items[1].textContent).toBe("补充说明，不是观点标题");
  });

  it("keeps BidClub digest headings and real lists semantic", () => {
    const html = renderModel({
      tab: "digest",
      digestHtml: "## 第一章\n\n普通段落。\n\n1. 结论一\n2. 结论二",
    });
    expect(html).toContain('class="reader-content bidclub-digest"');
    expect(html).toContain("<h2");
    expect(html).toContain("<ol>");
    expect(html).not.toContain("**");
  });

  it("keeps paragraph-shaped highlights and digest sub-points separated", () => {
    const overview = renderModel({
      tab: "overview",
      overviewHtml: "<p><strong>观点标题</strong>：观点正文</p>",
    });
    const digest = renderModel({
      tab: "digest",
      digestHtml: "## 1.观点\n\n第一段。\n\n第二段。",
    });

    expect(overview).toContain('class="reader-content bidclub-overview"');
    expect(overview).toContain("<p><strong>观点标题</strong>：观点正文</p>");
    expect(digest).toContain('class="reader-content bidclub-digest"');
    expect(digest.match(/<p>/g)).toHaveLength(2);
  });

  it("keeps the digest introduction outside the rich-text surface without stacked utility spacing", () => {
    const html = renderModel({
      tab: "digest",
      dek: "摘要导语",
      digestHtml: "## 第一章\n\n第一段。\n\n第二段。\n\n第三段。",
    });
    const document = parseMarkup(html);
    const layout = document.querySelector(".audio-insight-layout");
    const digest = layout?.querySelector(".audio-deep-summary .bidclub-digest");

    expect(layout).not.toBeNull();
    expect(layout?.classList.contains("space-y-5")).toBe(false);
    expect(layout?.querySelector(":scope > .space-y-5")).toBeNull();
    expect(layout?.querySelector(".audio-deep-summary-toggle")?.textContent).toContain("展开深度精华");
    expect(layout?.querySelector(".audio-deep-summary")?.hasAttribute("hidden")).toBe(true);
    expect(layout?.querySelector(".audio-deep-summary > p")?.textContent).toBe("摘要导语");
    expect(digest?.querySelector(":scope > h2")?.textContent).toBe("第一章");
  });

  it("renders three ordinary digest paragraphs as separate top-level paragraphs", () => {
    const html = renderModel({
      tab: "digest",
      digestHtml: "## 第一章\n\n第一段。\n\n第二段。\n\n第三段。\n\n<blockquote><p>引用</p></blockquote>\n\n<ul><li>无序项</li></ul>\n\n<ol><li>有序项</li></ol>",
    });
    const document = parseMarkup(html);
    const digest = document.querySelector(".bidclub-digest");
    const directChildren = Array.from(digest?.children || []);

    expect(digest).not.toBeNull();
    expect(directChildren.filter((element) => element.tagName === "P")).toHaveLength(3);
    expect(directChildren.filter((element) => /^H[1-3]$/.test(element.tagName))).toHaveLength(1);
    expect(digest?.querySelectorAll("blockquote > p")).toHaveLength(1);
    expect(digest?.querySelectorAll("ul > li, ol > li")).toHaveLength(2);
    expect(digest?.querySelectorAll("p:not(:is(li p, blockquote p))")).toHaveLength(3);
  });

  it("does not emit decorative overview triangles or duplicate digest list marks", () => {
    const overview = renderModel({
      tab: "overview",
      overviewHtml: "<p><strong>观点标题</strong>：观点正文</p>",
    });
    const digest = renderModel({
      tab: "digest",
      digestHtml: "<h3>1. 观点</h3><p>第一段。</p><p>第二段。</p><ul><li>已有列表</li></ul>",
    });

    expect(overview).not.toContain("▸");
    expect(digest).toContain("<h3>1. 观点</h3>");
    expect(digest).toContain("<ul><li>已有列表</li></ul>");
    expect(digest).not.toContain("–");
  });
});
