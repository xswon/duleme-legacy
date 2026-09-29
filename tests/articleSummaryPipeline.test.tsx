import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Article } from "../src/types";
import { closeDB, saveTranscriptionSettings } from "../src/services/dbService";

const pipeline = vi.hoisted(() => ({
  start: vi.fn(),
  summarize: vi.fn(),
  article: null as Article | null,
  patch: undefined as ((id: string, patch: Partial<Article>) => void) | undefined,
}));

vi.mock("../src/hooks/useBidclubEpisode", () => ({
  useBidclubEpisode: () => ({ episode: null, loading: false, error: null, retry: vi.fn() }),
}));

vi.mock("../src/hooks/useLocalPodcast", () => ({
  useLocalPodcast: () => ({
    artifacts: null,
    progress: 0,
    fetchError: null,
    restoring: false,
    refresh: vi.fn(),
    startTranscription: vi.fn(),
    regenerateTranscription: vi.fn(),
    retryTranscription: vi.fn(),
    createInsight: vi.fn(),
  }),
}));

vi.mock("../src/hooks/useCloudTranscription", () => ({
  useCloudTranscription: (article: Article | null, onPatch?: (id: string, patch: Partial<Article>) => void) => {
    pipeline.article = article;
    pipeline.patch = onPatch;
    return {
      start: pipeline.start,
      poll: vi.fn(),
      missingKey: false,
      clearMissingKey: vi.fn(),
    };
  },
}));

vi.mock("../src/services/aiSettingsService", () => ({
  AI_SETTINGS_CHANGED_EVENT: "wreader:ai-settings-changed",
  getAiCapability: async () => ({ configured: true, model: "test-model" }),
}));

vi.mock("../src/services/rssService", () => ({
  summarizeArticleWithAI: pipeline.summarize,
}));

import { ArticleDetailModal } from "../src/components/ArticleDetailModal";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const sourceArticle: Article = {
  id: "pipeline-episode",
  feedId: "podcast-feed",
  feedTitle: "Podcast",
  title: "Pipeline episode",
  link: "https://example.com/episode",
  content: "<p>Show notes</p>",
  snippet: "Show notes",
  pubDate: "2026-09-20T00:00:00.000Z",
  read: false,
  starred: false,
  audioUrl: "https://cdn.example.com/episode.mp3",
};

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  throw new Error("Timed out waiting for pipeline state");
}

describe("podcast AI summary pipeline", () => {
  beforeEach(async () => {
    await closeDB();
    const databases = await indexedDB.databases();
    await Promise.all(databases.map(({ name }) => name ? new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    }) : Promise.resolve()));

    await saveTranscriptionSettings({
      provider: "aliyun",
      apiKey: "test-transcription-key",
      language: "auto",
      diarization: true,
      contextEnhancement: true,
    });

    pipeline.summarize.mockReset();
    pipeline.summarize.mockResolvedValue("Pipeline summary");
    pipeline.start.mockReset();
    pipeline.start.mockImplementation(async () => {
      const current = pipeline.article;
      if (!current || !pipeline.patch) return { started: false, error: "missing article" };
      pipeline.patch(current.id, {
        transcription: {
          provider: "aliyun",
          sourceAudioUrl: current.audioUrl || "",
          status: "completed",
          segments: [
            { startMs: 0, text: "First segment" },
            { startMs: 10_000, text: "Second segment" },
          ],
          updatedAt: new Date().toISOString(),
        },
      });
      return { started: true };
    });
  });

  it("runs transcription then summary from one AI summary click and saves both results", async () => {
    const patches: Array<Partial<Article>> = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    function Harness() {
      const [article, setArticle] = useState(sourceArticle);
      const onPatch = (id: string, patch: Partial<Article>) => {
        patches.push(patch);
        setArticle((current) => current.id === id ? { ...current, ...patch } : current);
      };
      return (
        <ArticleDetailModal
          article={article}
          onClose={vi.fn()}
          onToggleStar={vi.fn()}
          onToggleRead={vi.fn()}
          onArticlePatch={onPatch}
          initialDetailTab="overview"
        />
      );
    }

    await act(async () => root.render(<Harness />));
    await waitFor(() => container.textContent?.includes("尚无 AI 摘要") === true);

    const generate = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.trim() === "立即生成");
    expect(generate).toBeTruthy();

    await act(async () => generate?.click());
    await waitFor(() => container.textContent?.includes("Pipeline summary") === true);

    expect(pipeline.start).toHaveBeenCalledTimes(1);
    expect(pipeline.summarize).toHaveBeenCalledWith(
      "Pipeline episode",
      "[00:00] First segment\n[00:10] Second segment",
      "Show notes",
      "transcript",
      expect.any(Function),
    );
    expect(patches).toEqual(expect.arrayContaining([
      expect.objectContaining({
        transcription: expect.objectContaining({
          status: "completed",
          segments: expect.any(Array),
        }),
      }),
      expect.objectContaining({
        aiSummary: "Pipeline summary",
        aiSummarySource: "transcript",
      }),
    ]));

    const transcriptTab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      .find((button) => button.textContent === "逐字稿");
    await act(async () => transcriptTab?.click());
    expect(container.textContent).toContain("First segment");
    expect(container.textContent).toContain("Second segment");

    await act(async () => root.unmount());
    container.remove();
  });
});
