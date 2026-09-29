import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArticleNotesTab } from "../src/components/ArticleNotesTab";
import type { ArticleNote } from "../src/types";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const notes: ArticleNote[] = [
  {
    id: "body-note",
    articleId: "article",
    source: "body",
    quote: "正文摘录",
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: "transcript-note",
    articleId: "article",
    source: "transcript",
    quote: "逐字稿摘录",
    note: "已有想法",
    transcriptStartMs: 754000,
    createdAt: 2,
    updatedAt: 2,
  },
  {
    id: "remote-transcript-note",
    articleId: "article",
    source: "transcript",
    quote: "没有可靠时间戳的逐字稿摘录",
    createdAt: 3,
    updatedAt: 3,
  },
];

afterEach(() => { document.body.innerHTML = ""; });

describe("ArticleNotesTab", () => {
  it("shows source, excerpt, optional note and opens only transcript excerpts", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onOpenTranscript = vi.fn();

    await act(async () => root.render(
      <ArticleNotesTab notes={notes} onUpdate={vi.fn()} onDelete={vi.fn()} onOpenTranscript={onOpenTranscript} />
    ));

    expect(container.textContent).toContain("正文摘录");
    expect(container.textContent).toContain("逐字稿 · 12:34");
    expect(container.textContent).toContain("已有想法");

    const cards = container.querySelectorAll("article");
    await act(async () => (cards[0] as HTMLElement).click());
    expect(onOpenTranscript).not.toHaveBeenCalled();
    await act(async () => (cards[1] as HTMLElement).click());
    expect(onOpenTranscript).toHaveBeenCalledWith(notes[1]);
    onOpenTranscript.mockClear();
    await act(async () => (cards[2] as HTMLElement).click());
    expect(onOpenTranscript).not.toHaveBeenCalled();
    expect(cards[2].className).not.toContain("cursor-pointer");
    await act(async () => root.unmount());
  });

  it("supports editing and deleting a note without opening the transcript", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onUpdate = vi.fn();
    const onDelete = vi.fn();
    const onOpenTranscript = vi.fn();

    await act(async () => root.render(
      <ArticleNotesTab notes={[notes[1]]} onUpdate={onUpdate} onDelete={onDelete} onOpenTranscript={onOpenTranscript} />
    ));
    await act(async () => (container.querySelector('[aria-label="编辑笔记"]') as HTMLButtonElement).click());
    const textarea = container.querySelector('textarea[aria-label="笔记内容"]') as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(textarea, "更新后的想法");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "保存")?.click());
    expect(onUpdate).toHaveBeenCalledWith(notes[1], "更新后的想法");
    expect(onOpenTranscript).not.toHaveBeenCalled();

    await act(async () => (container.querySelector('[aria-label="删除笔记"]') as HTMLButtonElement).click());
    expect(onDelete).toHaveBeenCalledWith(notes[1]);
    expect(onOpenTranscript).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});
