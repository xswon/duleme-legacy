import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotesView } from "../src/components/NotesView";
import type { Article, ArticleNote } from "../src/types";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const articles: Article[] = [
  { id: "a", feedId: "f", feedTitle: "Feed", title: "Older article", link: "https://example.com/a", content: "", snippet: "", pubDate: "2026-01-01", read: false, starred: false },
  { id: "b", feedId: "f", feedTitle: "Feed", title: "Newer article", link: "https://example.com/b", content: "", snippet: "", pubDate: "2026-01-02", read: false, starred: false },
];
const notes: ArticleNote[] = [
  { id: "old", articleId: "a", source: "body", quote: "Older quote", createdAt: 1, updatedAt: 1 },
  { id: "new", articleId: "b", source: "digest", quote: "Newer quote", note: "A thought", createdAt: 2, updatedAt: 3 },
  { id: "orphan", articleId: "missing", source: "body", quote: "Orphan", createdAt: 3, updatedAt: 4 },
];

afterEach(() => { document.body.innerHTML = ""; });

describe("NotesView", () => {
  it("uses the prototype empty state without repeating page guidance", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<NotesView notes={[]} articles={articles} onOpen={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />));

    expect(container.querySelector(".wreader-notes-empty")?.textContent).toBe("暂无笔记");
    expect(container.querySelector(".wreader-notes-empty svg")).toBeNull();
    expect(container.textContent).not.toContain("在文章详情中选择文字");
    await act(async () => root.unmount());
  });

  it("lists linked notes by update time and opens the selected note", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onOpen = vi.fn();
    await act(async () => root.render(<NotesView notes={notes} articles={articles} onOpen={onOpen} onUpdate={vi.fn()} onDelete={vi.fn()} />));

    expect(container.textContent).not.toContain("Orphan");
    expect(container.textContent!.indexOf("Newer article")).toBeLessThan(container.textContent!.indexOf("Older article"));
    expect(container.textContent).not.toContain("保存于文章中的标注和想法");
    expect(container.textContent).not.toContain("工具");
    await act(async () => (container.querySelectorAll("article")[0] as HTMLElement).click());
    expect(onOpen).toHaveBeenCalledWith(notes[1]);
    await act(async () => root.unmount());
  });

  it("supports edit and delete actions without opening the card", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onOpen = vi.fn();
    const onUpdate = vi.fn();
    const onDelete = vi.fn();
    await act(async () => root.render(<NotesView notes={[notes[1]]} articles={articles} onOpen={onOpen} onUpdate={onUpdate} onDelete={onDelete} />));

    await act(async () => (container.querySelector('[aria-label="编辑笔记"]') as HTMLButtonElement).click());
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(textarea, "Changed");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "保存")?.click());
    expect(onUpdate).toHaveBeenCalledWith(notes[1], "Changed");
    await act(async () => (container.querySelector('[aria-label="删除笔记"]') as HTMLButtonElement).click());
    expect(onDelete).toHaveBeenCalledWith(notes[1]);
    expect(onOpen).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});
