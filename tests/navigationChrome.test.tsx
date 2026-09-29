import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Header } from "../src/components/Header";
import { Sidebar } from "../src/components/Sidebar";
import { SettingsPage } from "../src/components/ManageFeedsModal";
import type { Feed } from "../src/types";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const feed = (overrides: Partial<Feed> = {}): Feed => ({
  id: "feed-1",
  title: "科技播客",
  feedUrl: "https://example.com/feed.xml",
  siteUrl: "https://example.com",
  category: "科技",
  unreadCount: 3,
  ...overrides,
});

const sidebarProps = (overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) => ({
  activeTab: "feeds" as const,
  setActiveTab: vi.fn(),
  feeds: [feed()],
  categories: ["科技", "空文件夹"],
  selectedFeedId: null,
  setSelectedFeedId: vi.fn(),
  selectedCategory: null,
  setSelectedCategory: vi.fn(),
  totalUnread: 3,
  totalSaved: 1,
  playlistCount: 2,
  notesCount: 4,
  onOpenAddFeed: vi.fn(),
  sortMode: "default" as const,
  setSortMode: vi.fn(),
  isMobileOpen: false,
  setIsMobileOpen: vi.fn(),
  ...overrides,
});

describe("navigation chrome", () => {
  it("keeps an accessible expand action in the collapsed rail", () => {
    const onCollapse = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<Sidebar {...sidebarProps({ isCollapsed: true, onCollapse })} />));
    const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="展开侧边栏"]');
    expect(toggle).not.toBeNull();
    act(() => toggle?.click());
    expect(onCollapse).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    container.remove();
  });

  it("simplifies the sidebar while keeping the subscription tree scrollable", () => {
    const html = renderToStaticMarkup(<Sidebar {...sidebarProps()} />);

    expect(html).toContain("读了么");
    expect(html).not.toContain("收件箱");
    expect(html).toContain("我的订阅");
    expect(html).not.toContain("搜索全文");
    expect(html).toContain('aria-label="添加订阅或文件夹"');
    expect(html).toContain('class="wreader-sidebar-search wreader-icon-button');
    expect(html).toContain(">设置<");
    expect(html).toContain("科技");
    expect(html).not.toContain("空文件夹");
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain('id="subscription-tree-scroll"');
    expect(html).not.toContain(">工具<");
    expect(html.indexOf("收藏")).toBeLessThan(html.indexOf("播客"));
    expect(html.indexOf("播客")).toBeLessThan(html.indexOf("笔记"));
    expect(html.indexOf("笔记")).toBeLessThan(html.indexOf("科技"));
    expect(html.indexOf("搜索")).toBeLessThan(html.indexOf("科技"));
    expect(html.indexOf("添加")).toBeGreaterThan(html.lastIndexOf("科技"));

    const quickEntryOrder = ["时间线", "收藏", "播客", "笔记"].map((label) =>
      html.indexOf(label)
    );
    expect(quickEntryOrder).toEqual([...quickEntryOrder].sort((a, b) => a - b));
    expect(html).toContain('id="nav-tab-notes"');
    expect((html.match(/wreader-nav-primary-label/g) || []).length).toBe(5);
    expect(html).toContain('d="M12.22 2h-.44');
    expect(html).toContain('d="M12 2v2M12 20v2');
    expect(html).not.toContain(">未读<");
    expect(html).toContain('d="m12 3 2.78 5.63');
    expect(html).toContain('d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H3Z"');
  });

  it("marks every utility label for the collapsed rail", () => {
    const html = renderToStaticMarkup(<Sidebar {...sidebarProps({ isCollapsed: true })} />);

    expect(html).toContain('class="wreader-nav-label wreader-nav-primary-label truncate text-xs">播客</span>');
    expect(html).toContain('class="wreader-nav-label wreader-nav-primary-label truncate text-xs">笔记</span>');
    expect(html).toContain('class="wreader-nav-label truncate text-xs">搜索</span>');
    expect(html).toContain('class="wreader-nav-label wreader-nav-primary-label truncate text-xs">设置</span>');
  });

  it("keeps primary labels at their dedicated size when counts are zero", () => {
    const html = renderToStaticMarkup(<Sidebar {...sidebarProps({ totalUnread: 0, totalSaved: 0, feeds: [], categories: [] })} />);
    const readingNavStart = html.indexOf('aria-label="阅读入口"');
    const readingNavEnd = html.indexOf('aria-label="快捷入口"', readingNavStart);
    const readingNavHtml = html.slice(readingNavStart, readingNavEnd);

    expect(html).toContain('class="wreader-nav-label wreader-nav-primary-label truncate text-xs">时间线</span>');
    expect(html).toContain('class="wreader-nav-label wreader-nav-primary-label truncate text-xs">收藏</span>');
    expect(readingNavHtml).not.toContain("wreader-nav-count");
  });

  it("keeps search and collapse in the brand row and refresh beside subscriptions", () => {
    const html = renderToStaticMarkup(<Sidebar {...sidebarProps({ onRefresh: vi.fn(), onCollapse: vi.fn() })} />);
    expect((html.match(/aria-label="搜索"/g) || []).length).toBe(1);
    expect(html).toContain('aria-label="收起侧边栏"');
    expect(html.indexOf('aria-label="搜索"')).toBeLessThan(html.indexOf('aria-label="收起侧边栏"'));
    expect(html.indexOf('aria-label="刷新订阅源"')).toBeGreaterThan(html.indexOf("我的订阅"));
    expect(html.indexOf('aria-label="添加订阅或文件夹"')).toBeGreaterThan(html.lastIndexOf("我的订阅"));
    expect(html).toContain('class="wreader-tree-add-row"');
  });

  it("uses one selected label class for folders and feeds", () => {
    const folderHtml = renderToStaticMarkup(<Sidebar {...sidebarProps({ selectedCategory: "科技" })} />);
    const feedHtml = renderToStaticMarkup(<Sidebar {...sidebarProps({ selectedFeedId: "feed-1" })} />);
    const defaultHtml = renderToStaticMarkup(<Sidebar {...sidebarProps()} />);
    expect(folderHtml).toContain('class="wreader-nav-name truncate wreader-nav-selected-label">科技</span>');
    expect(feedHtml).toContain('class="wreader-nav-name truncate text-slate-800 wreader-nav-selected-label">科技播客</span>');
    expect(defaultHtml).toContain('class="wreader-nav-name truncate font-normal text-slate-800">');
  });

  it("opens settings as a page and closes the mobile drawer", async () => {
    const setActiveTab = vi.fn();
    const setIsMobileOpen = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Sidebar
          {...sidebarProps({
            isMobileOpen: true,
            setActiveTab,
            setIsMobileOpen,
          })}
        />
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>("#nav-manage-feeds")?.click();
    });

    expect(setActiveTab).toHaveBeenCalledWith("settings");
    expect(setIsMobileOpen).toHaveBeenCalledWith(false);

    await act(async () => root.unmount());
    container.remove();
  });

  it("creates folders through the subscription add menu and surfaces validation", async () => {
    const onCreateFolder = vi.fn((name: string) => name === "重复" ? "已有同名文件夹" : undefined);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Sidebar {...sidebarProps({ onCreateFolder })} />);
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="添加订阅或文件夹"]')?.click();
    });
    await act(async () => {
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "添加文件夹")?.click();
    });

    const input = container.querySelector<HTMLInputElement>('input[placeholder="文件夹名称"]');
    expect(input).not.toBeNull();
    const setInputValue = (value: string) => {
      if (!input) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    await act(async () => {
      if (!input) return;
      setInputValue("重复");
      input.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toContain("已有同名文件夹");

    await act(async () => {
      if (!input) return;
      setInputValue("新文件夹");
      input.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(onCreateFolder).toHaveBeenLastCalledWith("新文件夹");
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it("organizes settings as grouped pages with secondary navigation", () => {
    const html = renderToStaticMarkup(
      <SettingsPage
        feeds={[feed()]}
        categories={["科技"]}
        onAddCategory={vi.fn()}
        onRenameCategory={vi.fn()}
        onDeleteCategory={vi.fn()}
        onUpdateFeedCategory={vi.fn()}
        onUpdateFeedUrls={vi.fn()}
        onDeleteFeed={vi.fn()}
        sortMode="default"
        onSortModeChange={vi.fn()}
        onBack={vi.fn()}
        onOpenAddFeed={vi.fn()}
      />
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="关闭设置"');
    expect(html).toContain("内容");
    expect(html).toContain("可选增强");
    expect(html).toContain('id="settings-tab-transcript"');
    expect(html).toContain("逐字稿");
    expect(html).toContain("AI 摘要");
    expect(html).toContain("数据与备份");
    expect(html).toContain("快捷键");
    expect(html).toContain("AI 摘要");
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-labelledby="settings-tab-feeds"');
    expect(html).not.toContain("个订阅源及其所属文件夹");
    expect(html).toContain("搜索订阅");
    expect(html).toContain("添加订阅");
    expect(html).toContain("订阅源");
    expect(html).toContain("文件夹");
    expect(html).not.toContain("显示与排序");
    expect(html).not.toContain('aria-label="订阅排序"');
    expect(html).toContain('aria-label="编辑科技播客"');
    expect(html).toContain("科技播客");
    expect(html).not.toContain('<span>科技</span><span class="text-blue-600">3 篇未读</span>');
    expect(html).not.toContain("3 篇未读");
    expect(html).not.toContain("https://example.com/feed.xml");
  });

  it("separates data management and keyboard shortcuts", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SettingsPage
          feeds={[feed()]}
          categories={["科技"]}
          onAddCategory={vi.fn()}
          onRenameCategory={vi.fn()}
          onDeleteCategory={vi.fn()}
          onUpdateFeedCategory={vi.fn()}
          onUpdateFeedUrls={vi.fn()}
          onDeleteFeed={vi.fn()}
          sortMode="default"
          onSortModeChange={vi.fn()}
          onBack={vi.fn()}
          onOpenAddFeed={vi.fn()}
          onExportBackup={vi.fn()}
          onImportBackup={vi.fn()}
        />
      );
    });

    await act(async () => {
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "逐字稿")?.click();
    });

    expect(container.querySelector("#settings-modal-title")?.textContent).toBe("转录");
    expect(container.querySelector(".wreader-settings-heading p")?.textContent).toBe("可选增强功能。不配置也不影响 RSS 阅读和播客播放。");
    expect(Array.from(container.querySelectorAll("#settings-panel-transcript h3")).map((heading) => heading.textContent)).toEqual(["转录设置"]);

    await act(async () => {
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "AI 摘要")?.click();
    });

    expect(container.querySelector("#settings-modal-title")?.textContent).toBe("AI 摘要");
    expect(container.querySelector(".wreader-settings-heading p")?.textContent).toBe("可选增强功能。不配置也不影响 RSS 阅读、收藏和笔记。");
    expect(container.querySelector("#settings-panel-insight h3")).toBeNull();

    await act(async () => {
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("数据与备份"))?.click();
    });

    expect(container.querySelector(".wreader-settings-heading p")?.textContent).toBe("订阅和阅读数据优先保存在本机。定期导出完整备份可避免浏览器数据被清理后无法恢复。");
    expect(container.querySelector("#settings-panel-data > .wreader-settings-note")).toBeNull();
    expect(container.textContent).toContain("导出 OPML");
    expect(container.textContent).toContain("导入 OPML");
    expect(container.textContent).toContain("导出完整备份");
    expect(container.textContent).toContain("恢复完整备份");
    expect(container.querySelector(".wreader-shortcut-list")).toBeNull();

    await act(async () => {
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "快捷键")?.click();
    });

    expect(container.querySelector(".wreader-shortcut-list")).not.toBeNull();
    expect(container.textContent).toContain("切换文章");
    expect(container.textContent).toContain("退出沉浸阅读");

    await act(async () => root.unmount());
    container.remove();
  });

  it("only exposes folder selection while editing a feed", async () => {
    const onUpdateFeedCategory = vi.fn();
    const onUpdateFeedUrls = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SettingsPage
          feeds={[feed()]}
          categories={["科技", "商业"]}
          onAddCategory={vi.fn()}
          onRenameCategory={vi.fn()}
          onDeleteCategory={vi.fn()}
          onUpdateFeedCategory={onUpdateFeedCategory}
          onUpdateFeedUrls={onUpdateFeedUrls}
          onDeleteFeed={vi.fn()}
          feedSortMode="default"
          folderSortMode="default"
          onBack={vi.fn()}
          onOpenAddFeed={vi.fn()}
        />
      );
    });

    expect(container.querySelector('[aria-label="更改科技播客所属文件夹"]')).toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="编辑科技播客"]')?.click();
    });

    const folderSelect = container.querySelector<HTMLSelectElement>('[aria-label="更改科技播客所属文件夹"]');
    expect(folderSelect).not.toBeNull();
    expect(container.querySelector(".wreader-feed-edit-card header p")).toBeNull();
    expect(container.querySelector(".wreader-feed-edit-identity strong")?.textContent).toBe("科技播客");
    expect(container.querySelector(".wreader-feed-edit-cover")).not.toBeNull();
    await act(async () => {
      if (!folderSelect) return;
      folderSelect.value = "商业";
      folderSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[title="保存订阅设置"]')?.click();
    });

    expect(onUpdateFeedCategory).toHaveBeenCalledWith("feed-1", "商业");
    expect(onUpdateFeedUrls).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps primary feed rows limited to cover, name and folder", () => {
    const html = renderToStaticMarkup(
      <SettingsPage
        feeds={[feed({ unreadCount: 2, lastSyncStatus: "error" })]}
        categories={["科技"]}
        onAddCategory={vi.fn()}
        onRenameCategory={vi.fn()}
        onDeleteCategory={vi.fn()}
        onUpdateFeedCategory={vi.fn()}
        onUpdateFeedUrls={vi.fn()}
        onDeleteFeed={vi.fn()}
        feedSortMode="default"
        folderSortMode="default"
        onBack={vi.fn()}
        onOpenAddFeed={vi.fn()}
      />
    );

    expect(html).toContain("科技播客");
    expect(html).toContain("科技");
    expect(html).not.toContain("https://example.com/feed.xml");
    expect(html).not.toContain("example.com");
    expect(html).not.toContain("同步失败");
    expect(html).not.toContain("2 篇未读");
    expect(html).not.toContain("wreader-settings-feed-chevron");
  });

  it("expands a settings folder to reveal its feeds", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SettingsPage
          feeds={[feed(), feed({ id: "feed-2", title: "商业播客", category: "商业" })]}
          categories={["科技", "商业"]}
          onAddCategory={vi.fn()}
          onRenameCategory={vi.fn()}
          onDeleteCategory={vi.fn()}
          onUpdateFeedCategory={vi.fn()}
          onUpdateFeedUrls={vi.fn()}
          onDeleteFeed={vi.fn()}
          feedSortMode="default"
          folderSortMode="default"
          onBack={vi.fn()}
          onOpenAddFeed={vi.fn()}
        />
      );
    });

    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "文件夹")?.click();
    });

    const folderToggles = () => container.querySelectorAll<HTMLButtonElement>(".wreader-settings-folder-toggle");
    expect(folderToggles().length).toBe(2);
    expect(folderToggles()[0].getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("1 个订阅源");
    expect(container.textContent).not.toContain("科技播客");

    await act(async () => folderToggles()[0].click());

    expect(folderToggles()[0].getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("科技播客");
    expect(container.querySelector('[aria-label="编辑科技播客"]')).toBeNull();
    expect(container.textContent).not.toContain("example.com");
    expect(container.querySelector('[aria-label="将科技播客移出文件夹"]')).not.toBeNull();

    await act(async () => folderToggles()[0].click());

    expect(folderToggles()[0].getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("科技播客");

    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps feed deletion inside the secondary editor", async () => {
    const onDeleteFeed = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SettingsPage
          feeds={[feed()]}
          categories={["科技"]}
          onAddCategory={vi.fn()}
          onRenameCategory={vi.fn()}
          onDeleteCategory={vi.fn()}
          onUpdateFeedCategory={vi.fn()}
          onUpdateFeedUrls={vi.fn()}
          onDeleteFeed={onDeleteFeed}
          feedSortMode="default"
          folderSortMode="default"
          onBack={vi.fn()}
          onOpenAddFeed={vi.fn()}
        />
      );
    });

    expect(container.querySelector('[aria-label="删除订阅源"]')).toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="编辑科技播客"]')?.click();
    });

    expect(container.querySelector('[aria-label="删除订阅源"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="删除订阅源"]')?.click();
    });

    expect(confirm).toHaveBeenCalledOnce();
    expect(onDeleteFeed).toHaveBeenCalledWith("feed-1");
    confirm.mockRestore();
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps folder feeds read-only apart from moving them out", async () => {
    const onUpdateFeedCategory = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SettingsPage
          feeds={[feed()]}
          categories={["科技"]}
          onAddCategory={vi.fn()}
          onRenameCategory={vi.fn()}
          onDeleteCategory={vi.fn()}
          onUpdateFeedCategory={onUpdateFeedCategory}
          onUpdateFeedUrls={vi.fn()}
          onDeleteFeed={vi.fn()}
          feedSortMode="default"
          folderSortMode="default"
          onBack={vi.fn()}
          onOpenAddFeed={vi.fn()}
        />
      );
    });

    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "文件夹")?.click();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".wreader-settings-folder-toggle")?.click();
    });

    expect(container.querySelector('[aria-label="编辑科技播客"]')).toBeNull();
    expect(container.querySelector('[aria-label="删除订阅源"]')).toBeNull();
    expect(container.textContent).not.toContain("example.com");

    const moveOut = container.querySelector<HTMLButtonElement>('[aria-label="将科技播客移出文件夹"]');
    expect(moveOut).not.toBeNull();
    await act(async () => moveOut?.click());

    expect(onUpdateFeedCategory).toHaveBeenCalledWith("feed-1", "未分类");

    await act(async () => root.unmount());
    container.remove();
  });

  it("applies custom feed order within each sidebar folder", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <Sidebar
          {...sidebarProps({
            feeds: [
              feed({ id: "a-1", title: "A first", category: "A" }),
              feed({ id: "b-1", title: "B only", category: "B" }),
              feed({ id: "a-2", title: "A second", category: "A" }),
            ],
            categories: ["A", "B"],
            selectedFeedId: "a-2",
            feedSortMode: "default",
            folderSortMode: "default",
            feedOrderByFolder: { A: ["a-2", "a-1"], B: ["b-1"] },
          })}
        />
      );
    });
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="展开B"]')?.click());
    const html = container.innerHTML;

    expect(html.indexOf("A second")).toBeLessThan(html.indexOf("A first"));
    expect(html.indexOf("A first")).toBeLessThan(html.indexOf("B only"));

    act(() => root.unmount());
    container.remove();
  });

  it("opens only the selected folder by default and expands a folder when its feed is selected", async () => {
    const firstFeed = feed({ id: "feed-a", title: "A first", category: "A" });
    const secondFeed = feed({ id: "feed-b", title: "B first", category: "B" });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Sidebar {...sidebarProps({ feeds: [firstFeed, secondFeed], categories: ["A", "B"], selectedFeedId: "feed-a" })} />);
    });
    expect(container.textContent).toContain("A first");
    expect(container.textContent).not.toContain("B first");

    await act(async () => {
      root.render(<Sidebar {...sidebarProps({ feeds: [firstFeed, secondFeed], categories: ["A", "B"], selectedFeedId: "feed-b" })} />);
    });
    expect(container.textContent).toContain("B first");

    await act(async () => {
      root.render(<Sidebar {...sidebarProps({ feeds: [{ ...secondFeed, unreadCount: 9 }, firstFeed], categories: ["A", "B"], selectedFeedId: "feed-b" })} />);
    });
    expect(container.textContent).toContain("B first");

    await act(async () => root.unmount());
    container.remove();
  });

  it("closes settings from the modal close control", async () => {
    const onBack = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SettingsPage
          feeds={[feed()]}
          categories={["科技"]}
          onAddCategory={vi.fn()}
          onRenameCategory={vi.fn()}
          onDeleteCategory={vi.fn()}
          onUpdateFeedCategory={vi.fn()}
          onUpdateFeedUrls={vi.fn()}
          onDeleteFeed={vi.fn()}
          sortMode="default"
          onSortModeChange={vi.fn()}
          onBack={onBack}
          onOpenAddFeed={vi.fn()}
        />
      );
    });

    await act(async () => {
      container.querySelectorAll<HTMLButtonElement>('button[aria-label="关闭设置"]')[1]?.click();
    });
    expect(onBack).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps the list header focused on title, mark-read, sort, and refresh", () => {
    const html = renderToStaticMarkup(
      <Header
        activeTab="feeds"
        currentTitle="全部订阅"
        filterType="all"
        setFilterType={vi.fn()}
        onRefresh={vi.fn()}
        onMarkAllRead={vi.fn()}
        isRefreshing={false}
        onToggleMobileMenu={vi.fn()}
        onNavigateSearch={vi.fn()}
        unreadCount={8}
        timelineSortOrder="newest"
        onToggleTimelineSort={vi.fn()}
      />
    );

    expect(html).not.toContain('aria-label="8 篇未读"');
    expect(html).toContain("全部订阅");
    expect(html).toContain('aria-label="全部标为已读"');
    expect(html).toContain('aria-label="排序：从新至旧"');
    expect(html).toContain('aria-label="刷新订阅源"');
    expect(html).not.toContain('aria-label="搜索"');
    expect(html).not.toContain("更多操作");
  });

  it("keeps auxiliary counts out of list header titles", () => {
    const baseProps = {
      filterType: "all" as const,
      setFilterType: vi.fn(),
      onRefresh: vi.fn(),
      onMarkAllRead: vi.fn(),
      isRefreshing: false,
      onToggleMobileMenu: vi.fn(),
      onNavigateSearch: vi.fn(),
      unreadCount: 0,
    };
    const audioHtml = renderToStaticMarkup(<Header {...baseProps} activeTab="playlist" currentTitle="播客" currentCountLabel="2 条" />);
    const notesHtml = renderToStaticMarkup(<Header {...baseProps} activeTab="notes" currentTitle="笔记" currentCountLabel="4 条" />);
    const favoritesHtml = renderToStaticMarkup(<Header {...baseProps} activeTab="feeds" filterType="starred" currentTitle="收藏" currentCountLabel="7 条" />);

    for (const html of [audioHtml, notesHtml, favoritesHtml]) {
      expect(html).not.toContain('class="wreader-title-count"');
      expect(html).not.toContain(">2 条</span>");
      expect(html).not.toContain(">4 条</span>");
      expect(html).not.toContain(">7 条</span>");
    }
    expect(audioHtml).toContain("播客");
    expect(notesHtml).toContain("笔记");
    expect(favoritesHtml).toContain("收藏");
  });

  it("keeps favorite sorting beside the clear action and dispatches it", async () => {
    const onToggleTimelineSort = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(
      <Header
        activeTab="feeds"
        currentTitle="收藏"
        currentCountLabel="2 条"
        filterType="starred"
        setFilterType={vi.fn()}
        onRefresh={vi.fn()}
        onMarkAllRead={vi.fn()}
        isRefreshing={false}
        onToggleMobileMenu={vi.fn()}
        onNavigateSearch={vi.fn()}
        unreadCount={0}
        timelineSortOrder="newest"
        onToggleTimelineSort={onToggleTimelineSort}
      />
    ));
    const sortButton = container.querySelector<HTMLButtonElement>('button[aria-label="排序：从新至旧"]');
    expect(sortButton).not.toBeNull();
    await act(async () => sortButton?.click());
    expect(onToggleTimelineSort).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    container.remove();
  });

  it("reveals the list-header navigation control when the sidebar is collapsed", () => {
    const html = renderToStaticMarkup(
      <Header
        activeTab="feeds"
        currentTitle="全部订阅"
        filterType="all"
        setFilterType={vi.fn()}
        onRefresh={vi.fn()}
        onMarkAllRead={vi.fn()}
        isRefreshing={false}
        onToggleMobileMenu={vi.fn()}
        onNavigateSearch={vi.fn()}
        unreadCount={8}
        sidebarCollapsed
      />
    );

    expect(html).toContain("is-sidebar-collapsed");
    expect(html).toContain('aria-label="打开导航菜单"');
  });

  it("shows a disabled clear-all control for an empty notes page", () => {
    const html = renderToStaticMarkup(
      <Header
        activeTab="notes"
        currentTitle="笔记 0 条"
        filterType="all"
        setFilterType={vi.fn()}
        onRefresh={vi.fn()}
        onMarkAllRead={vi.fn()}
        isRefreshing={false}
        onToggleMobileMenu={vi.fn()}
        onNavigateSearch={vi.fn()}
        unreadCount={0}
        notesEmpty
      />
    );

    expect(html).toContain('aria-label="删除全部笔记"');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('aria-label="全部标为已读"');
  });

  it("uses Trash2 for notes and Eraser for audio and favorites bulk actions", () => {
    const notesHtml = renderToStaticMarkup(
      <Header
        activeTab="notes"
        currentTitle="笔记 2 条"
        filterType="all"
        setFilterType={vi.fn()}
        onRefresh={vi.fn()}
        onMarkAllRead={vi.fn()}
        isRefreshing={false}
        onToggleMobileMenu={vi.fn()}
        onNavigateSearch={vi.fn()}
        unreadCount={0}
      />
    );
    const audioHtml = renderToStaticMarkup(
      <Header
        activeTab="playlist"
        currentTitle="播客 2 条"
        filterType="all"
        setFilterType={vi.fn()}
        onRefresh={vi.fn()}
        onMarkAllRead={vi.fn()}
        isRefreshing={false}
        onToggleMobileMenu={vi.fn()}
        onNavigateSearch={vi.fn()}
        unreadCount={0}
      />
    );
    const favoritesHtml = renderToStaticMarkup(
      <Header
        activeTab="feeds"
        currentTitle="收藏"
        filterType="starred"
        setFilterType={vi.fn()}
        onRefresh={vi.fn()}
        onMarkAllRead={vi.fn()}
        isRefreshing={false}
        onToggleMobileMenu={vi.fn()}
        onNavigateSearch={vi.fn()}
        unreadCount={0}
      />
    );

    expect(notesHtml).toContain('aria-label="删除全部笔记"');
    expect(notesHtml).toContain('d="M10 11v6M14 11v6');
    expect(audioHtml).toContain('aria-label="清空播放列表"');
    expect(audioHtml).toContain('d="M21 21H8a2 2 0 0 1-1.42-.587');
    expect(audioHtml).toContain('data-tip="清空播放列表"');
    expect(audioHtml).not.toContain('title="删除全部音频"');
    expect(favoritesHtml).toContain('aria-label="清空收藏"');
    expect(favoritesHtml).not.toContain('aria-label="全部标为已读"');
  });

  it("disables the favorites clear action when there are no favorites", () => {
    const html = renderToStaticMarkup(
      <Header
        activeTab="feeds"
        currentTitle="收藏"
        filterType="starred"
        setFilterType={vi.fn()}
        onRefresh={vi.fn()}
        onMarkAllRead={vi.fn()}
        isRefreshing={false}
        onToggleMobileMenu={vi.fn()}
        onNavigateSearch={vi.fn()}
        unreadCount={0}
        favoritesEmpty
      />
    );

    expect(html).toContain('aria-label="清空收藏"');
    expect(html).toContain('disabled=""');
  });

  it("renders timeline type and unread filters and dispatches their changes", async () => {
    const setFilterType = vi.fn();
    const onContentTypeChange = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(
      <Header
        activeTab="feeds"
        currentTitle="时间线"
        filterType="all"
        setFilterType={setFilterType}
        onRefresh={vi.fn()}
        onMarkAllRead={vi.fn()}
        isRefreshing={false}
        onToggleMobileMenu={vi.fn()}
        onNavigateSearch={vi.fn()}
        unreadCount={37}
        showTimelineFilters
        contentType="all"
        onContentTypeChange={onContentTypeChange}
        historyWindowDays={30}
      />
    ));
    expect(container.textContent).not.toContain("最近 30 天");
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "播客")?.click());
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("仅看未读"))?.click());
    expect(onContentTypeChange).toHaveBeenCalledWith("podcast");
    expect(setFilterType).toHaveBeenCalledWith("unread");
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps the unread filter when navigating between feed and folder scopes", async () => {
    const onNavigate = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<Sidebar {...sidebarProps({ filterType: "unread", selectedFeedId: "feed-1", onNavigate })} />));
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("科技播客"))?.click());
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ filterType: "unread", selectedFeedId: "feed-1" }));
    await act(async () => root.unmount());
    container.remove();
  });

  it("caps large unread badges while retaining the exact accessible count", () => {
    const html = renderToStaticMarkup(
      <Sidebar {...sidebarProps({ totalUnread: 120, feeds: [feed({ unreadCount: 120 })] })} />
    );
    expect(html).toContain(">99+<");
    expect(html).toContain('aria-label="120 篇未读"');
  });

});
