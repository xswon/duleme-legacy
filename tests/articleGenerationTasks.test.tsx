import React, { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Article } from "../src/types";

const services = vi.hoisted(() => ({
  startLocal: vi.fn(),
  pollLocal: vi.fn(),
  summarize: vi.fn(),
}));

vi.mock("../src/services/localPodcastService", () => ({
  localPodcastApi: {
    start: services.startLocal,
    status: services.pollLocal,
  },
}));

vi.mock("../src/services/rssService", () => ({
  summarizeArticleWithAI: services.summarize,
}));

vi.mock("../src/services/transcriptionService", () => ({
  transcriptionApi: { submit: vi.fn(), poll: vi.fn() },
}));

import { useArticleGenerationTasks, type ArticleGenerationController } from "../src/hooks/useArticleGenerationTasks";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const sourceArticle: Article = {
  id: "episode-1",
  feedId: "podcasts",
  feedTitle: "Podcast",
  title: "Long episode",
  link: "https://example.com/episode",
  content: "Show notes",
  snippet: "Show notes",
  pubDate: "2026-09-20T00:00:00.000Z",
  read: false,
  starred: false,
  audioUrl: "https://cdn.example.com/episode.mp3",
};

describe("article generation task controller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    services.startLocal.mockReset().mockResolvedValue({ session_id: "session-1", job_id: "job-1" });
    services.pollLocal.mockReset().mockResolvedValue({
      session_id: "session-1",
      job_id: "job-1",
      job: { status: "completed", progress: 100, insight_status: "not_requested" },
      artifacts: { transcript: [{ startMs: 0, text: "Completed transcript" }] },
    });
    services.summarize.mockReset().mockImplementation(async (_title, _input, _snippet, _source, onProgress) => {
      onProgress?.(65);
      return "Generated summary";
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("continues a transcript-to-summary pipeline outside the detail view and marks both results unseen", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const completed = vi.fn();
    let controller: ArticleGenerationController | undefined;
    let latestArticles: Article[] = [];

    function Harness() {
      const [articles, setArticles] = useState([sourceArticle]);
      const articlesRef = useRef(articles);
      articlesRef.current = articles;
      latestArticles = articles;
      const patchArticle = (articleId: string, patch: Partial<Article>) => {
        const next = articlesRef.current.map((article) => article.id === articleId ? { ...article, ...patch } : article);
        articlesRef.current = next;
        setArticles(next);
      };
      controller = useArticleGenerationTasks({
        articles,
        articlesRef,
        patchArticle,
        isResultVisible: () => false,
        onCompleted: completed,
      });
      return null;
    }

    await act(async () => root.render(<Harness />));
    await act(async () => {
      await controller?.startSummary(sourceArticle.id, {
        source: "transcript",
        input: "",
        snippet: sourceArticle.snippet,
        preferLocal: true,
      });
    });
    expect(controller?.tasks[sourceArticle.id]).toMatchObject({ kind: "pipeline", stage: "transcribing", status: "processing" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(services.pollLocal).toHaveBeenCalledWith("session-1");
    expect(services.summarize).toHaveBeenCalledWith(
      "Long episode",
      "[00:00] Completed transcript",
      "Show notes",
      "transcript",
      expect.any(Function),
    );
    expect(controller?.tasks[sourceArticle.id]).toMatchObject({ stage: "summarizing", status: "completed", progress: 100 });
    expect(latestArticles[0]).toMatchObject({
      aiSummary: "Generated summary",
      aiSummarySource: "transcript",
      insightUnread: { transcript: true, summary: true },
    });
    expect(completed).toHaveBeenCalledTimes(1);
    expect(completed).toHaveBeenCalledWith(
      "《Long episode》的逐字稿和 AI 摘要已生成",
      sourceArticle.id,
      "overview",
    );

    await act(async () => controller?.clearUnread(sourceArticle.id, "transcript"));
    expect(latestArticles[0].insightUnread).toEqual({ transcript: false, summary: true });

    await act(async () => root.unmount());
  });
});
