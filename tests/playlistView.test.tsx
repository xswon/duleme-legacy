import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaylistView } from "../src/components/PlaylistView";
import type { Article } from "../src/types";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const article = (id: string, title = id): Article => ({
  id,
  feedId: "feed-1",
  feedTitle: "Example",
  title,
  link: `https://example.com/${id}`,
  content: "<p>Body</p>",
  snippet: "Body",
  pubDate: "2026-08-18T00:00:00Z",
  read: false,
  starred: false,
  audioUrl: `https://cdn.example.com/${id}.mp3`,
});

const baseProps = () => ({
  articles: [article("one"), article("two"), article("three")],
  audioProgressMap: {},
  onSelectArticle: vi.fn(),
  onRemoveFromPlaylist: vi.fn(),
  onClearPlaylist: vi.fn(),
  onNavigateFeeds: vi.fn(),
});

function renderView(props: ReturnType<typeof baseProps> & Record<string, unknown>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<PlaylistView {...props} />));
  return { container, root };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("PlaylistView", () => {
  it("uses the audio label while restoring the audio page", () => {
    const { container, root } = renderView({ ...baseProps(), isLoading: true });

    expect(container.querySelector('[role="status"]')?.textContent).toContain("正在加载音频");
    expect(container.querySelector('[role="status"]')?.textContent).not.toContain("正在加载播放列表");
    act(() => root.unmount());
  });

  it("renders the prototype player and compact queue rows", () => {
    const { container, root } = renderView({
      ...baseProps(),
      articles: [
        { ...article("with-cover"), thumbnail: "https://cdn.example.com/cover.jpg" },
        article("without-cover", "Fallback"),
      ],
    });
    expect(container.querySelector('[aria-label="播放控制器"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="上一条"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="下一条"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="调整播放速度"]')?.textContent).toBe("1x");
    expect(container.querySelectorAll("audio")).toHaveLength(0);
    expect(container.querySelectorAll(".playlist-thumb")).toHaveLength(2);
    act(() => root.unmount());
  });

  it("shows remaining and completed state without changing the source order", () => {
    const { container, root } = renderView({
      ...baseProps(),
      audioProgressMap: {
        two: { currentTime: 100, duration: 100, updatedAt: 1 },
      },
    });

    const rows = Array.from(container.querySelectorAll(".playlist-list article"));
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("one"),
      expect.stringContaining("two"),
      expect.stringContaining("three"),
    ]);
    expect(rows[0].textContent).toContain("尚未开始");
    expect(rows[1].textContent).toContain("已播放完");
    act(() => root.unmount());
  });

  it("removes an episode from its row action", () => {
    const onRemoveFromPlaylist = vi.fn();
    const { container, root } = renderView({ ...baseProps(), onRemoveFromPlaylist });
    const remove = container.querySelector('button[aria-label="从播放列表删除 one"]') as HTMLButtonElement;
    act(() => remove.click());
    expect(onRemoveFromPlaylist).toHaveBeenCalledWith("one");
    act(() => root.unmount());
  });

  it("returns the complete ID order when an item is dropped on another item", () => {
    const onReorder = vi.fn();
    const { container, root } = renderView({ ...baseProps(), onReorder });
    const rows = Array.from(container.querySelectorAll("article"));
    const dataTransfer = {
      effectAllowed: "",
      setData: vi.fn(),
      getData: vi.fn(() => "one"),
    };
    void act(() => rows[0].dispatchEvent(Object.assign(new Event("dragstart", { bubbles: true }), { dataTransfer })));
    void act(() => rows[2].dispatchEvent(Object.assign(new Event("drop", { bubbles: true }), { dataTransfer })));
    expect(onReorder).toHaveBeenCalledWith(["two", "three", "one"]);
    act(() => root.unmount());
  });
});
