import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Article, ArticleNote, BidclubEpisode, DetailTab } from "../src/types";
import { closeDB, getArticleNotesFromDB, saveArticleNoteToDB } from "../src/services/dbService";

const hookState = vi.hoisted(() => ({
  value: { episode: null, loading: true, error: null } as {
    episode: BidclubEpisode | null;
    loading: boolean;
    error: string | null;
  },
}));

vi.mock("../src/hooks/useBidclubEpisode", () => ({
  useBidclubEpisode: () => ({ ...hookState.value, retry: vi.fn() }),
}));

import { ArticleDetailModal } from "../src/components/ArticleDetailModal";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const baseArticle: Article = {
  id: "episode-178",
  feedId: "latetalk",
  feedTitle: "LateTalk",
  title: "178: 与田渊栋聊 RSI：模型自进化如何到来？",
  link: "https://podcast.latepost.com/178",
  content: "<p>Original show notes</p>",
  snippet: "Original show notes",
  pubDate: "2026-08-07T02:00:00.000Z",
  read: false,
  starred: false,
  audioUrl: "https://cdn.example.com/178.mp3",
  enrichment: {
    provider: "bidclub",
    episodeId: "latetalk-2026-08-07-178-rsi",
    status: "available",
    matchedBy: "source-url",
  },
};

const episode: BidclubEpisode = {
  title: baseArticle.title,
  dek: "",
  dekAlt: "",
  lang: "ZH",
  langAlt: "EN",
  tldrHtml: "<p>Verified overview</p>",
  digestHtml: "<p>Verified digest</p>",
  transcriptHtml: "<p>Verified transcript</p>",
  tldrAltHtml: "",
  digestAltHtml: "",
  chapters: [],
  chaptersAlt: [],
};

function renderDetail(
  root: ReturnType<typeof createRoot>,
  article: Article,
  options: {
    onPrevArticle?: () => void;
    onNextArticle?: () => void;
    savedScrollTop?: number;
    onScrollPositionChange?: (articleId: string, scrollTop: number) => void;
    onReadingProgressChange?: (articleId: string, progress: number) => void;
    initialOpenTarget?: { tab: "notes" } | { tab: "transcript"; note: ArticleNote };
    initialDetailTab?: Extract<DetailTab, "body" | "overview" | "transcript">;
    onDetailTabChange?: (tab: DetailTab | "notes") => void;
    onOpenAiSettings?: () => void;
    onOpenTranscriptionSettings?: () => void;
  } = {},
) {
  root.render(
    <ArticleDetailModal
      article={article}
      onClose={vi.fn()}
      onToggleStar={vi.fn()}
      onToggleRead={vi.fn()}
      onArticlePatch={vi.fn()}
      {...options}
    />
  );
}

async function waitForNotesToLoad(container: HTMLElement) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (container.querySelector('#article-reader')?.getAttribute("data-notes-loaded") === "true") return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  throw new Error("Timed out waiting for article notes to load");
}

beforeEach(async () => {
  await closeDB();
  const databases = await indexedDB.databases();
  await Promise.all(databases.map(({ name }) => name ? new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  }) : Promise.resolve()));
  hookState.value = { episode: null, loading: true, error: null };
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ArticleDetailModal resolved enrichment behavior", () => {
  it("keeps the article action capsule controls interactive", async () => {
    const onRead = vi.fn();
    const onStar = vi.fn();
    const onImmersive = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ArticleDetailModal
          article={baseArticle}
          onClose={vi.fn()}
          onToggleRead={onRead}
          onToggleStar={onStar}
          onToggleImmersive={onImmersive}
        />
      );
    });
    await waitForNotesToLoad(container);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="标记为已读"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="收藏文章"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="阅读设置"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="进入沉浸模式"]')?.click();
    });

    expect(onRead).toHaveBeenCalledWith(baseArticle.id);
    expect(onStar).toHaveBeenCalledWith(baseArticle.id);
    expect(onImmersive).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="dialog"][aria-label="阅读设置"]')).not.toBeNull();
    expect(container.querySelector<HTMLAnchorElement>('[aria-label="打开原文"]')?.href).toBe(baseArticle.link);

    await act(async () => root.unmount());
  });

  it("uses action-oriented mail icons for read state changes", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ArticleDetailModal
          article={baseArticle}
          onClose={vi.fn()}
          onToggleRead={vi.fn()}
          onToggleStar={vi.fn()}
        />
      );
    });
    await waitForNotesToLoad(container);

    const markReadButton = container.querySelector<HTMLButtonElement>('[aria-label="标记为已读"]');
    expect(markReadButton?.querySelector(".lucide-mail-open")).not.toBeNull();
    expect(markReadButton?.querySelector(".lucide-mail")).toBeNull();

    await act(async () => {
      root.render(
        <ArticleDetailModal
          article={{ ...baseArticle, read: true }}
          onClose={vi.fn()}
          onToggleRead={vi.fn()}
          onToggleStar={vi.fn()}
        />
      );
    });

    const markUnreadButton = container.querySelector<HTMLButtonElement>('[aria-label="标记为未读"]');
    expect(markUnreadButton?.querySelector(".lucide-mail")).not.toBeNull();
    expect(markUnreadButton?.querySelector(".lucide-mail-open")).toBeNull();

    await act(async () => root.unmount());
  });

  it("honors an explicit initial notes target from the global notes page", async () => {
    const note: ArticleNote = { id: "open-note", articleId: baseArticle.id, source: "body", quote: "Open directly", createdAt: 1, updatedAt: 1 };
    await saveArticleNoteToDB(note);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => renderDetail(root, baseArticle, { initialOpenTarget: { tab: "notes" } }));
    await waitForNotesToLoad(container);

    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("笔记 1");
    expect(container.querySelector('[aria-label="文章笔记"]')?.textContent).toContain("Open directly");
    await act(async () => root.unmount());
  });

  it("honors a reliable transcript target from the global notes page", async () => {
    hookState.value = { episode, loading: false, error: null };
    const note: ArticleNote = { id: "timed-note", articleId: baseArticle.id, source: "transcript", quote: "Verified transcript", transcriptStartMs: 12000, createdAt: 1, updatedAt: 1 };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => renderDetail(root, baseArticle, { initialOpenTarget: { tab: "transcript", note } }));
    await waitForNotesToLoad(container);

    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("逐字稿");
    expect(container.textContent).toContain("Verified transcript");
    expect((container.querySelector('input[type="range"]') as HTMLInputElement).value).toBe("12");
    await act(async () => root.unmount());
  });

  it("keeps identical excerpts distinct by position and note ID", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 100, top: 100, width: 40, height: 20, right: 140, bottom: 120, x: 100, y: 100, toJSON: () => ({}) }),
    });
    await act(async () => renderDetail(root, { ...baseArticle, audioUrl: undefined, enrichment: undefined, content: "<p>Repeat and Repeat</p>" }));
    await waitForNotesToLoad(container);

    const selectAndHighlight = async (node: Text, start: number) => {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + 6);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      await act(async () => {
        node.parentElement!.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "高亮")?.click());
    };

    const paragraph = Array.from(container.querySelectorAll("p")).find((item) => item.textContent === "Repeat and Repeat")!;
    await selectAndHighlight(paragraph.firstChild as Text, 0);
    const currentParagraph = Array.from(container.querySelectorAll("p")).find((item) => item.textContent === "Repeat and Repeat")!;
    const trailingText = Array.from(currentParagraph.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.includes("and Repeat")) as Text;
    await selectAndHighlight(trailingText, trailingText.data.lastIndexOf("Repeat"));

    const marks = container.querySelectorAll<HTMLElement>("mark[data-note-id]");
    expect(container.textContent).toContain("笔记 2");
    await expect(getArticleNotesFromDB(baseArticle.id)).resolves.toHaveLength(2);
    expect(marks).toHaveLength(2);
    expect(new Set(Array.from(marks).map((mark) => mark.dataset.noteId)).size).toBe(2);
    await act(async () => root.unmount());
  });

  it("edits and deletes a current-session highlight by its stable note ID without duplicating it", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 100, top: 100, width: 80, height: 20, right: 180, bottom: 120, x: 100, y: 100, toJSON: () => ({}) }),
    });

    await act(async () => renderDetail(root, { ...baseArticle, audioUrl: undefined, enrichment: undefined }));
    await waitForNotesToLoad(container);
    expect(Array.from(container.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent)).not.toContain("笔记 1");

    const paragraph = Array.from(container.querySelectorAll("p")).find((item) => item.textContent === "Original show notes")!;
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    await act(async () => {
      paragraph.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector('[aria-label="文本标注"]')).toBeTruthy();
    expect(container.querySelector("mark[data-selection-preview]")).toBeNull();
    expect(container.querySelector<HTMLElement>('[aria-label="文本标注"]')?.style.top).toBe("132px");
    expect(container.querySelector('[aria-label="文本标注"]')?.className).not.toContain("-translate-y-full");

    const highlight = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "高亮")!;
    await act(async () => highlight.click());
    expect(container.querySelector("mark[data-selection-preview]")).toBeNull();
    const mark = container.querySelector("mark[data-note-id]") as HTMLElement;
    expect(mark?.textContent).toBe("Original show notes");
    expect(container.textContent).toContain("笔记 1");
    await expect(getArticleNotesFromDB(baseArticle.id)).resolves.toMatchObject([{ quote: "Original show notes", source: "body" }]);

    await act(async () => mark.click());
    expect(container.querySelector('[aria-label="文本标注"]')?.textContent).toContain("编辑笔记");
    expect(container.querySelector('[aria-label="文本标注"]')?.textContent).not.toContain("高亮");
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "编辑笔记")?.click());
    const textarea = container.querySelector('textarea[aria-label="新笔记内容"]') as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(textarea, "更新后的笔记");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "保存")?.click());
    expect(container.textContent).toContain("笔记 1");
    await expect(getArticleNotesFromDB(baseArticle.id)).resolves.toMatchObject([{ note: "更新后的笔记" }]);

    await act(async () => (container.querySelector("mark[data-note-id]") as HTMLElement).click());
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "删除")?.click());
    expect(confirm).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain("笔记 1");
    expect(container.querySelector("mark[data-note-id]")).toBeNull();
    await expect(getArticleNotesFromDB(baseArticle.id)).resolves.toEqual([]);
    confirm.mockRestore();
    await act(async () => root.unmount());
  });

  it("keeps audio insight tabs visible and exposes both missing configuration shortcuts", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onOpenTranscriptionSettings = vi.fn();
    const onOpenAiSettings = vi.fn();
    const audioItem: Article = {
      ...baseArticle,
      id: "audio-unconfigured",
      enrichment: undefined,
      aiSummary: undefined,
      localPodcast: undefined,
      transcription: undefined,
    };

    await act(async () => renderDetail(root, audioItem, { onOpenTranscriptionSettings, onOpenAiSettings }));
    await waitForNotesToLoad(container);

    const tabs = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'));
    expect(tabs.map((tab) => tab.textContent)).toEqual(["正文", "AI 摘要", "逐字稿"]);

    const aiTab = tabs.find((tab) => tab.textContent === "AI 摘要");
    await act(async () => aiTab?.click());

    expect(container.textContent).toContain("尚无 AI 摘要");
    expect(container.textContent).toContain("逐字稿");
    expect(container.textContent).toContain("AI 摘要");
    const configureButtons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .filter((button) => ["配置转录服务", "配置 AI 模型"].includes(button.textContent?.trim() || ""));
    expect(configureButtons).toHaveLength(2);

    await act(async () => configureButtons[0].click());
    expect(onOpenTranscriptionSettings).toHaveBeenCalledTimes(1);
    await act(async () => configureButtons[1].click());
    expect(onOpenAiSettings).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    container.remove();
  });

  it("does not offer notes from empty AI summary or transcript states", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const audioItem: Article = {
      ...baseArticle,
      id: "audio-empty-states",
      enrichment: undefined,
      aiSummary: undefined,
      localPodcast: undefined,
      transcription: undefined,
    };

    await act(async () => renderDetail(root, audioItem, { initialDetailTab: "overview" }));
    await waitForNotesToLoad(container);

    const selectText = async (text: string) => {
      const paragraph = Array.from(container.querySelectorAll("p")).find((item) => item.textContent === text)!;
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      await act(async () => {
        paragraph.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    };

    await selectText("先配置转录服务和 AI 模型，生成时会自动创建逐字稿。");
    expect(container.querySelector('[aria-label="文本标注"]')).toBeNull();

    await act(async () => {
      Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'))
        .find((tab) => tab.textContent === "逐字稿")
        ?.click();
    });
    await selectText("配置转录服务后，即可将音频转换为可搜索的文本。");
    expect(container.querySelector('[aria-label="文本标注"]')).toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it("opens on show notes while enrichment loads, then exposes highlights in the fixed order", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => renderDetail(root, baseArticle));
    await waitForNotesToLoad(container);
    expect(container.textContent).toContain("Original show notes");
    expect(container.textContent).toContain("正在检查整理内容");

    hookState.value = { episode, loading: false, error: null };
    await act(async () => renderDetail(root, baseArticle));

    expect(container.textContent).toContain("Original show notes");
    expect(container.textContent).toContain("AI 摘要");
    expect(container.textContent).toContain("正文");
    const tabLabels = Array.from(container.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent);
    expect(tabLabels).toEqual(["正文", "AI 摘要", "逐字稿"]);

    const aiSummaryButton = Array.from(container.querySelectorAll('[role="tab"]'))
      .find((button) => button.textContent === "AI 摘要");
    await act(async () => aiSummaryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("Verified overview");
    expect(container.textContent).toContain("Verified digest");
    expect(container.textContent).not.toContain("Original show notes");
    await act(async () => root.unmount());
  });

  it("does not interrupt a user who chose show notes while a candidate was loading", async () => {
    const candidate = {
      ...baseArticle,
      enrichment: { ...baseArticle.enrichment!, status: "candidate" as const, matchedBy: "legacy" as const },
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => renderDetail(root, candidate));
    await waitForNotesToLoad(container);
    const showNotesButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "正文");
    await act(async () => showNotesButton?.click());

    hookState.value = { episode, loading: false, error: null };
    await act(async () => renderDetail(root, candidate));

    expect(container.textContent).toContain("Original show notes");
    expect(container.textContent).not.toContain("Verified overview");
    expect(container.textContent).toContain("AI 摘要");
    await act(async () => root.unmount());
  });

  it("keeps mobile navigation reachable and restores/reports reading position", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onPrevArticle = vi.fn();
    const onNextArticle = vi.fn();
    const onScrollPositionChange = vi.fn();
    const onReadingProgressChange = vi.fn();

    await act(async () => renderDetail(root, baseArticle, {
      onPrevArticle,
      onNextArticle,
      savedScrollTop: 24,
      onScrollPositionChange,
      onReadingProgressChange,
    }));
    await waitForNotesToLoad(container);

    const scrollContainer = container.querySelector(".overflow-y-auto") as HTMLDivElement;
    expect(scrollContainer.scrollTop).toBe(24);
    expect(container.querySelectorAll('[aria-label="上一篇"]').length).toBe(1);
    expect(container.querySelectorAll('[aria-label="下一篇"]').length).toBe(1);
    expect(container.querySelector('[data-reading-progress]')).toBeTruthy();

    await act(async () => {
      Object.defineProperty(scrollContainer, "scrollHeight", { configurable: true, value: 124 });
      Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 100 });
      scrollContainer.scrollTop = 12;
      scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    expect(onScrollPositionChange).toHaveBeenCalledWith(baseArticle.id, 12);
    expect(onReadingProgressChange).toHaveBeenCalledWith(baseArticle.id, 0.5);
    expect(container.querySelector<HTMLElement>('[data-reading-progress]')?.style.width).toBe("50%");
    await act(async () => root.unmount());
  });

  it("keeps the reader toolbar limited to the approved direct actions", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => renderDetail(root, baseArticle));
    await waitForNotesToLoad(container);
    expect(container.querySelectorAll('[aria-label="打开原文"]')).toHaveLength(1);
    expect(container.querySelector('[aria-label="更多操作"]')).toBeNull();
    expect(container.querySelector('[aria-label="复制原文链接"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it("keeps the AI summary tab visible without a configured model and offers setup", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onOpenAiSettings = vi.fn();
    const plainArticle: Article = {
      ...baseArticle,
      id: "plain-unconfigured",
      audioUrl: undefined,
      enrichment: undefined,
      thumbnail: undefined,
      aiSummary: undefined,
    };

    await act(async () => renderDetail(root, plainArticle, { onOpenAiSettings }));
    await waitForNotesToLoad(container);

    const tabs = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'));
    expect(tabs.map((tab) => tab.textContent)).toEqual(["正文", "AI 摘要"]);

    const aiTab = tabs.find((tab) => tab.textContent === "AI 摘要");
    await act(async () => aiTab?.click());

    expect(container.textContent).toContain("配置 AI 模型后，即可提炼内容要点。");
    const configureButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent === "配置 AI 模型");
    expect(configureButton).toBeTruthy();

    await act(async () => configureButton?.click());
    expect(onOpenAiSettings).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    container.remove();
  });

  it("switches a regular article between its body and AI summary tabs", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const plainArticle: Article = {
      ...baseArticle,
      id: "plain-article",
      audioUrl: undefined,
      enrichment: undefined,
      thumbnail: "https://example.com/cover.jpg",
      aiSummary: "已生成的摘要",
    };

    await act(async () => renderDetail(root, plainArticle));
    await waitForNotesToLoad(container);

    expect(Array.from(container.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent))
      .toEqual(["正文", "AI 摘要"]);
    expect(container.textContent).toContain("Original show notes");
    expect(container.querySelector("img")).not.toBeNull();

    const aiTab = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'))
      .find((tab) => tab.textContent === "AI 摘要");
    await act(async () => aiTab?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(container.querySelector(".bidclub-overview")?.textContent?.trim()).toBe("已生成的摘要");
    expect(container.textContent).not.toContain("Original show notes");
    expect(container.querySelector("img")).toBeNull();

    const bodyTab = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'))
      .find((tab) => tab.textContent === "正文");
    await act(async () => bodyTab?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(container.textContent).toContain("Original show notes");
    expect(container.querySelector("img")).not.toBeNull();
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps the first AI summary click when route state echoes the selected tab", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const plainArticle: Article = {
      ...baseArticle,
      id: "plain-article-route-sync",
      audioUrl: undefined,
      enrichment: undefined,
      aiSummary: "路由同步后的摘要",
    };
    let initialDetailTab: "body" | "overview" | "transcript" | undefined;
    const rerender = () => renderDetail(root, plainArticle, {
      initialDetailTab,
      onDetailTabChange: (tab) => {
        if (tab === "body" || tab === "overview" || tab === "transcript") initialDetailTab = tab;
        rerender();
      },
    });

    await act(async () => rerender());
    await waitForNotesToLoad(container);

    const aiTab = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'))
      .find((tab) => tab.textContent === "AI 摘要");
    await act(async () => aiTab?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("AI 摘要");
    expect(container.querySelector(".bidclub-overview")?.textContent?.trim()).toBe("路由同步后的摘要");
    expect(container.textContent).not.toContain("Original show notes");
    await act(async () => root.unmount());
    container.remove();
  });
});
