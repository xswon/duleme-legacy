import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ReaderFeedbackLayer } from "../src/components/ReaderFeedbackLayer";
import type { ArticleGenerationTask } from "../src/hooks/useArticleGenerationTasks";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const baseTask: ArticleGenerationTask = {
  articleId: "episode-1",
  articleTitle: "Long episode",
  kind: "transcription",
  stage: "transcribing",
  status: "processing",
  progress: 42,
  updatedAt: 1,
};

describe("reader generation feedback", () => {
  it("reuses the top feedback layer for progress and failure actions", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onView = vi.fn();
    const onDismiss = vi.fn();
    const common = {
      toast: null,
      refreshFeedback: null,
      refreshState: { failed: [], successful: 0, newArticles: 0 },
      failureDetailsOpen: false,
      onFailureDetailsOpenChange: vi.fn(),
      onDismissRefresh: vi.fn(),
      onRetryFailed: vi.fn(),
      onRetryFeed: vi.fn(),
      onViewGeneration: onView,
      onDismissGeneration: onDismiss,
    };

    await act(async () => root.render(
      <ReaderFeedbackLayer {...common} generationTask={baseTask} generationCount={2} />,
    ));
    expect(container.textContent).toContain("正在生成《Long episode》的逐字稿 · 42% · 另有 1 项");
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "查看")?.click());
    expect(onView).toHaveBeenCalledWith(baseTask);

    const failedTask: ArticleGenerationTask = { ...baseTask, status: "failed", error: "provider failed" };
    await act(async () => root.render(
      <ReaderFeedbackLayer {...common} generationTask={failedTask} generationCount={0} />,
    ));
    expect(container.textContent).toContain("《Long episode》的逐字稿生成失败");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="关闭生成失败提示"]')?.click());
    expect(onDismiss).toHaveBeenCalledWith("episode-1");

    await act(async () => root.unmount());
  });
});
