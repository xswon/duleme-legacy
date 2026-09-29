import React, { useEffect, useMemo, useRef, useState } from "react";
import { Podcast } from "lucide-react";
import { ActiveTab, Feed, FilterType } from "../types";
import type { ReaderRoute } from "../services/router";
import type { SortMode } from "../services/feedSorting";
import { formatUnreadCount, getUnreadCountAriaLabel } from "../services/unreadCount";
import { compareNames, orderFeedsInFolder, sortFeeds, type FeedOrderByFolder } from "../services/feedSorting";

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  filterType?: FilterType;
  feeds: Feed[];
  categories: string[];
  selectedFeedId: string | null;
  setSelectedFeedId: (feedId: string | null) => void;
  selectedCategory: string | null;
  setSelectedCategory: (cat: string | null) => void;
  totalUnread: number;
  totalSaved: number;
  playlistCount: number;
  notesCount: number;
  onOpenAddFeed: () => void;
  onCreateFolder?: (name: string) => string | undefined;
  onOpenSettings?: () => void;
  feedSortMode?: SortMode;
  folderSortMode?: SortMode;
  feedOrderByFolder?: FeedOrderByFolder;
  setFeedSortMode?: (mode: SortMode) => void;
  setFolderSortMode?: (mode: SortMode) => void;
  /** @deprecated Kept for callers from the previous single-sort sidebar. */
  sortMode?: SortMode;
  setSortMode?: (mode: SortMode) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  onNavigate?: (route: Partial<ReaderRoute>) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onCollapse?: () => void;
  isCollapsed?: boolean;
}

const PrototypeIcon = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">{children}</svg>
);

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  filterType: filterTypeForSidebar = "all",
  feeds,
  categories,
  selectedFeedId,
  setSelectedFeedId,
  selectedCategory,
  setSelectedCategory,
  totalUnread,
  totalSaved,
  playlistCount,
  notesCount,
  onOpenAddFeed,
  onCreateFolder,
  onOpenSettings,
  feedSortMode,
  folderSortMode,
  feedOrderByFolder = {},
  sortMode,
  isMobileOpen,
  setIsMobileOpen,
  onNavigate,
  onRefresh,
  isRefreshing = false,
  onCollapse,
  isCollapsed = false,
}) => {
  const effectiveFeedSortMode = feedSortMode ?? sortMode ?? "default";
  const effectiveFolderSortMode = folderSortMode ?? sortMode ?? "default";

  // Keep expansion state local to the sidebar. The initial tree is intentionally
  // compact: only the folder containing the current selection is open. Once the
  // user starts toggling folders, refreshes must not reset those choices.
  const { allCategoryNames, feedsByCategory, categoryUnreadCounts, selectedFeedCategory } = useMemo(() => {
    const grouped: Record<string, Feed[]> = {};
    const unreadCounts = new Map<string, number>();
    let selectedCategoryForFeed: string | null = null;
    feeds.forEach((feed) => {
      const category = feed.category || "未分类";
      (grouped[category] ||= []).push(feed);
      unreadCounts.set(category, (unreadCounts.get(category) || 0) + feed.unreadCount);
      if (feed.id === selectedFeedId) selectedCategoryForFeed = category;
    });
    const names = Array.from(new Set([...categories, ...Object.keys(grouped)]))
      .filter((category) => grouped[category]?.length > 0);
    return {
      allCategoryNames: names,
      feedsByCategory: grouped,
      categoryUnreadCounts: unreadCounts,
      selectedFeedCategory: selectedCategoryForFeed,
    };
  }, [categories, feeds, selectedFeedId]);
  const selectedExpansionCategory = selectedCategory || selectedFeedCategory;
  const categoryKey = [...allCategoryNames].sort().join("\u0000");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(allCategoryNames.map((category) => [category, category === selectedExpansionCategory]))
  );
  const expansionInitializedRef = useRef(allCategoryNames.length > 0);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);

  const closeFolderDialog = () => {
    setIsFolderDialogOpen(false);
    setFolderName("");
    setFolderError(null);
  };

  const submitFolder = (event: React.FormEvent) => {
    event.preventDefault();
    const error = onCreateFolder?.(folderName);
    if (error) {
      setFolderError(error);
      return;
    }
    closeFolderDialog();
  };

  useEffect(() => {
    if (!isMobileOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isMobileOpen, setIsMobileOpen]);

  useEffect(() => {
    if (allCategoryNames.length === 0) return;
    if (!expansionInitializedRef.current) {
      expansionInitializedRef.current = true;
      setExpandedCategories(Object.fromEntries(allCategoryNames.map((category) => [category, category === selectedExpansionCategory])));
      return;
    }
    setExpandedCategories((prev) => {
      const next = { ...prev };
      allCategoryNames.forEach((category) => {
        if (next[category] === undefined) next[category] = false;
      });
      return next;
    });
    // categoryKey tracks folder additions/removals without treating every feed
    // refresh as a reason to recreate the user's expansion choices.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- categoryKey is the intentional structural dependency; feeds refresh independently.
  }, [categoryKey]);

  useEffect(() => {
    if (!selectedExpansionCategory) return;
    setExpandedCategories((prev) => {
      if (prev[selectedExpansionCategory]) return prev;
      return { ...prev, [selectedExpansionCategory]: true };
    });
  }, [selectedExpansionCategory]);

  const sortedCategories = useMemo(() => {
    if (effectiveFolderSortMode === "default") return [...allCategoryNames];
    return [...allCategoryNames].sort((a, b) => {
      if (effectiveFolderSortMode === "unread") {
        const difference = (categoryUnreadCounts.get(b) || 0) - (categoryUnreadCounts.get(a) || 0);
        if (difference !== 0) return difference;
      }
      return compareNames(a, b);
    });
  }, [allCategoryNames, categoryUnreadCounts, effectiveFolderSortMode]);

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const displayCategoryName = (category: string) => category.replace(/\s*\|\s*/g, " · ");

  const handleSelectCategory = (category: string) => {
    if (onNavigate) {
      onNavigate({ activeTab: "feeds", filterType: filterTypeForSidebar === "starred" ? "all" : filterTypeForSidebar, selectedFeedId: null, selectedCategory: category, articleId: null });
      return;
    }
    setActiveTab("feeds");
    setSelectedCategory(category);
    setSelectedFeedId(null);
    setIsMobileOpen(false);
  };

  const handleSelectFeed = (feedId: string) => {
    if (onNavigate) {
      onNavigate({ activeTab: "feeds", filterType: filterTypeForSidebar === "starred" ? "all" : filterTypeForSidebar, selectedFeedId: feedId, selectedCategory: null, articleId: null });
      return;
    }
    setActiveTab("feeds");
    setSelectedFeedId(feedId);
    setSelectedCategory(null);
    setIsMobileOpen(false);
  };

  const selectUtilityTab = (tab: ActiveTab) => {
    if (onNavigate) {
      onNavigate({ activeTab: tab === "saved" ? "feeds" : tab, filterType: tab === "saved" ? "starred" : "all", selectedFeedId: null, selectedCategory: null, articleId: null });
      return;
    }
    setActiveTab(tab);
    setSelectedFeedId(null);
    setSelectedCategory(null);
    setIsMobileOpen(false);
  };

  const handleSelectScope = (scope: "today" | "starred") => {
    if (onNavigate) {
      onNavigate({
        activeTab: "feeds",
        filterType: scope === "today" ? "all" : scope,
        selectedFeedId: null,
        selectedCategory: null,
        articleId: null,
      });
      return;
    }
    setActiveTab("feeds");
    setSelectedFeedId(null);
    setSelectedCategory(null);
    setIsMobileOpen(false);
  };

  const renderFeedAvatar = (feed: Feed) => {
    const title = (feed.title || "RSS").trim();
    const label = /少数派(?!播客)/.test(title) ? "36" : title.slice(0, /^[\x00-\x7F]/.test(title) ? 2 : 1).toUpperCase();
    const palette = ["#39a7c8", "#8d68bb", "#e19643", "#63a478", "#5f8eca"];
    const colorIndex = Array.from(feed.id || title).reduce((sum, character) => sum + character.charCodeAt(0), 0) % palette.length;
    return (
      <span className="wreader-feed-avatar" style={{ backgroundColor: palette[colorIndex] }} aria-hidden="true">
        {label}
      </span>
    );
  };

  const itemClass = (selected: boolean) =>
    `wreader-nav-item flex w-full items-center text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
      selected
        ? "bg-slate-200/80 font-bold text-blue-700"
        : "text-slate-800 hover:bg-slate-200/50"
    }`;

  return (
    <>
      {isMobileOpen && (
        <div
          aria-hidden="true"
          className="wreader-sidebar-backdrop fixed inset-0 z-40 bg-black/35 backdrop-blur-xs transition-opacity"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside
        id="inoreader-sidebar"
        aria-label="主导航"
        className={`wreader-sidebar fixed inset-y-0 left-0 z-50 flex max-h-screen w-64 transform flex-col border-r border-slate-200 bg-slate-50 text-slate-800 transition-transform duration-200 ease-in-out ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="wreader-brand flex h-[58px] shrink-0 items-center">
          <h1 className="wreader-brand-name truncate">读了么</h1>
          {!isCollapsed && <button type="button" onClick={() => selectUtilityTab("search")} className={`wreader-sidebar-search wreader-icon-button ${activeTab === "search" ? "is-selected" : ""}`} title="搜索" aria-label="搜索"><PrototypeIcon><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></PrototypeIcon></button>}
          {onCollapse && <button type="button" onClick={onCollapse} className="wreader-sidebar-collapse wreader-icon-button" title={isCollapsed ? "展开侧边栏" : "收起侧边栏"} aria-label={isCollapsed ? "展开侧边栏" : "收起侧边栏"}><PrototypeIcon><path d="M4 4h16v16H4z" /><path d="M9 4v16" /></PrototypeIcon></button>}
        </div>

        <nav className="wreader-sidebar-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="wreader-nav-section-label">阅读</div>
          <section aria-label="阅读入口" className="wreader-reading-nav shrink-0 space-y-0.5">
            {([[
              "today", "时间线", totalUnread,
            ], [
              "starred", "收藏", totalSaved,
            ]] as Array<["today" | "starred", string, number]>).map(([scope, label, count]) => (
              <button
                key={scope}
                type="button"
                aria-label={label}
                onClick={() => handleSelectScope(scope)}
                className={itemClass(
                  (scope === "today" && activeTab === "feeds" && filterTypeForSidebar !== "starred" && !selectedFeedId && !selectedCategory) ||
                  (scope === "starred" && activeTab === "feeds" && filterTypeForSidebar === "starred")
                )}
              >
                <span className="wreader-nav-leading" aria-hidden="true">
                  {scope === "today" ? <PrototypeIcon><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></PrototypeIcon> : <PrototypeIcon><path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z" /></PrototypeIcon>}
                </span>
                <span className="wreader-nav-label wreader-nav-primary-label truncate text-xs">{label}</span>
                {count > 0 && <span className="wreader-nav-count ml-auto text-xs tabular-nums text-slate-500" aria-label={getUnreadCountAriaLabel(count)} title={getUnreadCountAriaLabel(count)}>{formatUnreadCount(count)}</span>}
              </button>
            ))}
          </section>
          <section aria-label="快捷入口" className="wreader-primary-tools shrink-0 space-y-0.5">
            <button id="nav-tab-playlist" aria-label="播客" onClick={() => selectUtilityTab("playlist")} className={itemClass(activeTab === "playlist")}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="wreader-nav-leading"><Podcast aria-hidden="true" /></span>
                <span className="wreader-nav-label wreader-nav-primary-label truncate text-xs">播客</span>
              </div>
              {playlistCount > 0 && <span className="wreader-nav-count ml-auto shrink-0 text-right text-xs tabular-nums text-slate-500">{playlistCount}</span>}
            </button>
            <button id="nav-tab-notes" aria-label="笔记" onClick={() => selectUtilityTab("notes")} className={itemClass(activeTab === "notes")}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="wreader-nav-leading"><PrototypeIcon><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" /><path d="M7 11h10M7 15h6M7 7h8" /></PrototypeIcon></span>
                <span className="wreader-nav-label wreader-nav-primary-label truncate text-xs">笔记</span>
              </div>
              {notesCount > 0 && <span className="wreader-nav-count ml-auto shrink-0 text-right text-xs tabular-nums text-slate-500">{notesCount}</span>}
            </button>
            {isCollapsed && <button id="nav-tab-search" aria-label="搜索" onClick={() => selectUtilityTab("search")} className={itemClass(activeTab === "search")}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="wreader-nav-leading"><PrototypeIcon><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></PrototypeIcon></span>
                <span className="wreader-nav-label truncate text-xs">搜索</span>
              </div>
            </button>}
          </section>
          <section
            aria-label="订阅树"
            className="wreader-subscription-section"
          >
            <div className="wreader-nav-section-label wreader-subscription-heading relative flex shrink-0 items-center">
              <span>我的订阅</span>
              {onRefresh && <button type="button" onClick={onRefresh} disabled={isRefreshing} className="wreader-sidebar-refresh wreader-icon-button" title={isRefreshing ? "正在刷新" : "刷新订阅源"} aria-label={isRefreshing ? "正在刷新" : "刷新订阅源"}><PrototypeIcon><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5" /></PrototypeIcon></button>}
            </div>
            <div
              id="subscription-tree-scroll"
              className="wreader-subscription-tree space-y-0.5"
            >
              {sortedCategories.map((category) => {
                const rawFeeds = feedsByCategory[category] || [];
                const sortedFeeds = effectiveFeedSortMode === "default"
                  ? orderFeedsInFolder(rawFeeds, category, feedOrderByFolder)
                  : sortFeeds(rawFeeds, effectiveFeedSortMode);
                const isExpanded = expandedCategories[category] ?? false;
                const categoryUnread = categoryUnreadCounts.get(category) || 0;
                const isSelectedCategory =
                  activeTab === "feeds" && selectedCategory === category;

                return (
                  <div key={category} className="space-y-0.5">
                    <div
                      className={`wreader-folder-row flex w-full items-center rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                        isSelectedCategory
                          ? "bg-slate-200/80 font-bold text-blue-700"
                          : "text-slate-800 hover:bg-slate-200/50"
                      }`}
                    >
                      <button
                        type="button"
                        aria-label={`${isExpanded ? "收起" : "展开"}${category}`}
                        aria-expanded={isExpanded}
                        onClick={() => toggleCategory(category)}
                        className="wreader-folder-toggle mr-0.5 shrink-0 rounded p-1 text-slate-500 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H3Z" />
                          <path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (isExpanded) {
                            toggleCategory(category);
                          } else {
                            handleSelectCategory(category);
                          }
                        }}
                        className="flex min-w-0 flex-1 items-center pr-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <span className={`wreader-nav-name truncate ${isSelectedCategory ? "wreader-nav-selected-label" : "font-normal text-slate-800"}`}>
                          {displayCategoryName(category)}
                        </span>
                      </button>
                      {categoryUnread > 0 && (
                        <span className="wreader-nav-count ml-auto shrink-0 text-right text-xs tabular-nums text-slate-500" aria-label={getUnreadCountAriaLabel(categoryUnread)} title={getUnreadCountAriaLabel(categoryUnread)}>
                          {formatUnreadCount(categoryUnread)}
                        </span>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="space-y-0.5">
                        {sortedFeeds.map((feed) => {
                          const isFeedSelected =
                            activeTab === "feeds" && selectedFeedId === feed.id;
                          return (
                            <button
                              type="button"
                              key={feed.id}
                              onClick={() => handleSelectFeed(feed.id)}
                              className={`wreader-feed-row flex w-full items-center rounded-lg py-1.5 pr-2.5 pl-6 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                isFeedSelected
                                  ? "bg-slate-200/90 font-bold text-blue-700"
                                  : "text-slate-800 hover:bg-slate-200/50"
                              }`}
                            >
                              <span className="flex min-w-0 items-center gap-2 pr-2">
                                {renderFeedAvatar(feed)}
                                <span className={`wreader-nav-name truncate text-slate-800 ${isFeedSelected ? "wreader-nav-selected-label" : ""}`}>
                                  {feed.title}
                                </span>
                              </span>
                              {feed.unreadCount > 0 && (
                                <span className="wreader-nav-count ml-auto shrink-0 text-right text-xs tabular-nums text-slate-500" aria-label={getUnreadCountAriaLabel(feed.unreadCount)} title={getUnreadCountAriaLabel(feed.unreadCount)}>
                                  {formatUnreadCount(feed.unreadCount)}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {feeds.length === 0 && (
                <p className="px-2.5 py-3 text-xs leading-5 text-slate-400">
                  暂无订阅源
                </p>
              )}
              <div className="wreader-tree-add-row">
                <button type="button" onClick={() => setIsAddMenuOpen((open) => !open)} className="wreader-subscription-add wreader-tree-add" aria-label="添加订阅或文件夹" aria-expanded={isAddMenuOpen}><PrototypeIcon><path d="M12 5v14M5 12h14" /></PrototypeIcon><span>添加</span></button>
                {isAddMenuOpen && (
                  <div className="wreader-subscription-add-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => { setIsAddMenuOpen(false); onOpenAddFeed(); setIsMobileOpen(false); }}>添加订阅源</button>
                    <button type="button" role="menuitem" onClick={() => { setIsAddMenuOpen(false); setIsFolderDialogOpen(true); }}>添加文件夹</button>
                  </div>
                )}
              </div>
            </div>
          </section>

        </nav>

        <div className="wreader-sidebar-footer">
          <section aria-label="侧栏操作">
            <button
              id="nav-manage-feeds"
              aria-label="设置"
              onClick={() => {
                if (onOpenSettings) {
                  onOpenSettings();
                } else {
                  selectUtilityTab("settings");
                }
                setIsMobileOpen(false);
              }}
              className={itemClass(activeTab === "settings")}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="wreader-nav-leading wreader-footer-settings-icon"><PrototypeIcon><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.74v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" /><circle cx="12" cy="12" r="3" /></PrototypeIcon></span>
                <span className="wreader-nav-label wreader-nav-primary-label truncate text-xs">设置</span>
              </div>
            </button>
          </section>
        </div>
      </aside>
      {isFolderDialogOpen && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/25 p-4" role="presentation" onMouseDown={closeFolderDialog}>
          <form role="dialog" aria-modal="true" aria-labelledby="folder-dialog-title" className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onSubmit={submitFolder} onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="folder-dialog-title" className="text-sm font-semibold text-slate-900">添加文件夹</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">用于整理订阅源，创建后会立即出现在侧栏。</p>
            <input autoFocus value={folderName} onChange={(event) => { setFolderName(event.target.value); setFolderError(null); }} className="mt-4 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="文件夹名称" aria-invalid={Boolean(folderError)} />
            {folderError && <p className="mt-2 text-xs text-rose-600" role="alert">{folderError}</p>}
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={closeFolderDialog} className="wreader-btn wreader-btn-sm wreader-btn-secondary">取消</button><button type="submit" className="wreader-btn wreader-btn-sm wreader-btn-primary">创建</button></div>
          </form>
        </div>
      )}
    </>
  );
};
