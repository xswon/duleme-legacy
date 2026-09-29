import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Folder,
  FolderMinus,
  Check,
  ChevronRight,
  Search,
  GripVertical,
  MoreHorizontal,
  Download,
  Upload,
  Database,
  Keyboard,
  Rss,
  AudioLines,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Feed } from "../types";
import { LocalAiSettingsPanel } from "./LocalAiSettingsModal";
import { exportOpml } from "../services/rssService";
import { feedCategory, orderFeedsInFolder, reorderItems, sortCategories, sortFeedsInFolder, type FeedOrderByFolder, SortMode } from "../services/feedSorting";
import { KEYBOARD_SHORTCUTS } from "../data/keyboardShortcuts";
import { isEnrichmentSourceEditorEnabled } from "../config/features";
import { resolveFeedEnrichmentSource, type FeedUrlChanges } from "../services/feedEnrichment";
export type { SortMode } from "../services/feedSorting";

const SortControl: React.FC<{ value: SortMode; onChange: (mode: SortMode) => void; label: string }> = ({ value, onChange, label }) => (
  <label className="flex items-center gap-1.5 text-xs text-slate-500">
    <span>{label}</span>
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as SortMode)}
      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      <option value="default">自定义拖动</option>
      <option value="alphabetical">名称 A–Z</option>
      <option value="unread">未读数量</option>
    </select>
  </label>
);

const DragHandle: React.FC<{ disabled: boolean; label: string }> = ({ disabled, label }) => (
  <span
    aria-label={label}
    title={disabled ? "当前排序模式不可拖动" : label}
    aria-disabled={disabled}
    className={`shrink-0 rounded p-1 ${disabled ? "cursor-not-allowed text-slate-200" : "cursor-grab text-slate-400 hover:bg-slate-100 hover:text-slate-600"}`}
  >
    <GripVertical className="h-4 w-4" />
  </span>
);

const SETTINGS_TABS = ["feeds", "folders", "transcript", "insight", "data", "shortcuts"] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

interface SettingsPageProps {
  feeds: Feed[];
  categories: string[];
  onAddCategory: (categoryName: string) => void;
  onRenameCategory: (oldName: string, newName: string) => void;
  onDeleteCategory: (categoryName: string) => void;
  onUpdateFeedCategory: (feedId: string, newCategory: string) => void;
  onUpdateFeedUrls: (
    feedId: string,
    urls: FeedUrlChanges
  ) => void;
  onDeleteFeed: (feedId: string) => void;
  feedSortMode?: SortMode;
  folderSortMode?: SortMode;
  /** @deprecated 订阅源页不再提供排序设置，仅以该值决定列表顺序。 */
  onFeedSortModeChange?: (mode: SortMode) => void;
  onFolderSortModeChange?: (mode: SortMode) => void;
  feedOrderByFolder?: FeedOrderByFolder;
  onReorderFolderFeeds?: (category: string, feedIds: string[]) => void;
  /** @deprecated Global feed reorder is no longer used. */
  onReorderFeeds?: (feeds: Feed[]) => void;
  onReorderCategories?: (categories: string[]) => void;
  /** @deprecated Kept for callers from the previous single-sort settings page. */
  sortMode?: SortMode;
  onSortModeChange?: (mode: SortMode) => void;
  onBack: () => void;
  onOpenAddFeed: () => void;
  onExportBackup?: () => void;
  onImportBackup?: (file: File) => void;
  initialTab?: SettingsTab;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  feeds,
  categories,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onUpdateFeedCategory,
  onUpdateFeedUrls,
  onDeleteFeed,
  feedSortMode,
  folderSortMode,
  onFolderSortModeChange,
  feedOrderByFolder = {},
  onReorderFolderFeeds,
  onReorderFeeds: _onReorderFeeds,
  onReorderCategories,
  sortMode,
  onSortModeChange,
  onBack,
  onOpenAddFeed,
  onExportBackup,
  onImportBackup,
  initialTab = "feeds",
}) => {
  const settingsDialogRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const tabsRef = useRef<HTMLElement | null>(null);
  const defaultTabRef = useRef<HTMLButtonElement | null>(null);

  // 打开设置时把焦点交给默认选中的分类，键盘用户不必先绕到关闭按钮。
  useEffect(() => {
    defaultTabRef.current?.focus();
  }, []);

  useEffect(() => {
    const dialog = settingsDialogRef.current;
    if (!dialog) return undefined;
    const getFocusable = () => {
      const scope = dialog.querySelector<HTMLElement>(".wreader-feed-edit-card") || dialog;
      return Array.from(scope.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ));
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        const nestedClose = dialog.querySelector<HTMLButtonElement>('.wreader-feed-edit-card button[aria-label="关闭编辑订阅源"]');
        if (nestedClose) nestedClose.click();
        else onBack();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable: HTMLElement[] = getFocusable() as HTMLElement[];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const opener = openerRef.current;
    dialog.addEventListener("keydown", handleKeyDown);
    return () => {
      dialog.removeEventListener("keydown", handleKeyDown);
      if (opener?.isConnected) opener.focus();
    };
  }, [onBack]);

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const [isFolderComposerOpen, setIsFolderComposerOpen] = useState(false);
  const [newFolderInput, setNewFolderInput] = useState("");
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCategoryInput, setEditCategoryInput] = useState("");
  const [editingFeedId, setEditingFeedId] = useState<string | null>(null);
  const [editFeedCategoryInput, setEditFeedCategoryInput] = useState("");
  const [editFeedUrlInput, setEditFeedUrlInput] = useState("");
  const [editBidclubFeedUrlInput, setEditBidclubFeedUrlInput] = useState("");
  const [editEnrichmentAction, setEditEnrichmentAction] = useState<"disabled" | "auto" | "manual" | null>(null);
  const [feedSearchQuery, setFeedSearchQuery] = useState("");
  const [openMoreMenu, setOpenMoreMenu] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const enrichmentSourceEditorEnabled = isEnrichmentSourceEditorEnabled();
  const effectiveFeedSortMode = feedSortMode ?? sortMode ?? "default";
  const effectiveFolderSortMode = folderSortMode ?? sortMode ?? "default";

  const feedCategories = Array.from(
    new Set([...categories, ...feeds.map((feed) => feed.category || "未分类")])
  );
  const normalizedFeedSearch = feedSearchQuery.trim().toLocaleLowerCase();
  const sortedCategories = useMemo(
    () => sortCategories(feedCategories, feeds, effectiveFolderSortMode),
    [feedCategories, feeds, effectiveFolderSortMode]
  );
  const matchingFeeds = feeds.filter((feed) => {
    if (!normalizedFeedSearch) return true;
    return [feed.title, feed.category || "未分类", feed.feedUrl]
      .some((value) => value.toLocaleLowerCase().includes(normalizedFeedSearch));
  });
  const filteredFeeds = normalizedFeedSearch
    ? sortedCategories.flatMap((category) => sortFeedsInFolder(matchingFeeds, category, effectiveFeedSortMode, feedOrderByFolder))
    : [];
  const displayedFeeds = normalizedFeedSearch
    ? filteredFeeds
    : sortedCategories.flatMap((category) => sortFeedsInFolder(feeds, category, effectiveFeedSortMode, feedOrderByFolder));

  const updateFolderSortMode = (mode: SortMode) => {
    (onFolderSortModeChange || onSortModeChange)?.(mode);
  };

  const tabClassName = (tab: SettingsTab) => `wreader-settings-tab${activeTab === tab ? " is-active" : ""}`;
  const tabProps = (tab: SettingsTab) => ({
    role: "tab" as const,
    id: `settings-tab-${tab}`,
    "aria-selected": activeTab === tab,
    "aria-controls": `settings-panel-${tab}`,
    tabIndex: activeTab === tab ? 0 : -1,
    onClick: () => setActiveTab(tab),
  });
  const handleTabsKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1
      : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    const jump = event.key === "Home" ? 0 : event.key === "End" ? SETTINGS_TABS.length - 1 : null;
    if (step === 0 && jump === null) return;
    event.preventDefault();
    const currentIndex = SETTINGS_TABS.indexOf(activeTab);
    const nextIndex = jump ?? (currentIndex + step + SETTINGS_TABS.length) % SETTINGS_TABS.length;
    const nextTab = SETTINGS_TABS[nextIndex];
    setActiveTab(nextTab);
    tabsRef.current?.querySelector<HTMLButtonElement>(`#settings-tab-${nextTab}`)?.focus();
  };

  const [draggedFeedId, setDraggedFeedId] = useState<string | null>(null);
  const [dragOverFeedId, setDragOverFeedId] = useState<string | null>(null);
  const [draggedCategory, setDraggedCategory] = useState<string | null>(null);
  // 文件夹页只有“文件夹排序”一个控件，它同时决定文件夹顺序和文件夹内的订阅顺序；
  // 只有自定义顺序下才允许拖动，否则拖动结果与显示顺序不一致。
  const canDragFolderFeeds = effectiveFolderSortMode === "default";
  const canDragCategories = effectiveFolderSortMode === "default";

  const moveFeed = (targetId: string) => {
    if (!canDragFolderFeeds || !draggedFeedId || draggedFeedId === targetId) return;
    const draggedFeed = feeds.find((feed) => feed.id === draggedFeedId);
    const targetFeed = feeds.find((feed) => feed.id === targetId);
    if (!draggedFeed || !targetFeed || feedCategory(draggedFeed) !== feedCategory(targetFeed)) {
      setDraggedFeedId(null);
      setDragOverFeedId(null);
      return;
    }
    const category = feedCategory(draggedFeed);
    const folderFeeds = orderFeedsInFolder(feeds, category, feedOrderByFolder);
    const sourceIndex = folderFeeds.findIndex((feed) => feed.id === draggedFeedId);
    const targetIndex = folderFeeds.findIndex((feed) => feed.id === targetId);
    if (sourceIndex >= 0 && targetIndex >= 0) {
      onReorderFolderFeeds?.(category, reorderItems(folderFeeds, sourceIndex, targetIndex).map((feed) => feed.id));
    }
    setDraggedFeedId(null);
    setDragOverFeedId(null);
  };

  const moveCategory = (targetCategory: string) => {
    if (!canDragCategories || !draggedCategory || draggedCategory === targetCategory) return;
    const sourceIndex = categories.indexOf(draggedCategory);
    const targetIndex = categories.indexOf(targetCategory);
    if (sourceIndex >= 0 && targetIndex >= 0) onReorderCategories?.(reorderItems(categories, sourceIndex, targetIndex));
    setDraggedCategory(null);
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderInput.trim()) return;
    onAddCategory(newFolderInput.trim());
    setNewFolderInput("");
    setIsFolderComposerOpen(false);
  };

  const handleStartRename = (cat: string) => {
    setEditingCategory(cat);
    setEditCategoryInput(cat);
  };

  const toggleFolder = (category: string) => {
    setExpandedCategories((current) => current.includes(category)
      ? current.filter((item) => item !== category)
      : [...current, category]);
  };

  const handleSaveRename = (oldName: string) => {
    if (editCategoryInput.trim() && editCategoryInput !== oldName) {
      onRenameCategory(oldName, editCategoryInput.trim());
    }
    setEditingCategory(null);
  };

  const handleStartEditFeed = (feed: Feed) => {
    setEditingFeedId(feed.id);
    setEditFeedCategoryInput(feed.category || "未分类");
    setEditFeedUrlInput(feed.feedUrl);
    setEditBidclubFeedUrlInput(resolveFeedEnrichmentSource(feed).bidclubFeedUrl || "");
    setEditEnrichmentAction(feed.enrichmentDisabled === true ? "disabled" : null);
  };

  const handleCancelEditFeed = () => {
    setEditingFeedId(null);
    setEditFeedCategoryInput("");
    setEditFeedUrlInput("");
    setEditBidclubFeedUrlInput("");
    setEditEnrichmentAction(null);
  };

  const handleSaveFeedUrls = (feed: Feed) => {
    const feedUrl = editFeedUrlInput.trim();
    if (!feedUrl) return;
    const urls: FeedUrlChanges = { feedUrl };
    if (enrichmentSourceEditorEnabled && editEnrichmentAction) {
      urls.enrichmentDisabled = editEnrichmentAction === "disabled";
      if (editEnrichmentAction === "manual") urls.bidclubFeedUrl = editBidclubFeedUrlInput.trim();
    }
    onUpdateFeedUrls(feed.id, urls);
    if (editFeedCategoryInput && editFeedCategoryInput !== (feed.category || "未分类")) {
      onUpdateFeedCategory(feed.id, editFeedCategoryInput);
    }
    handleCancelEditFeed();
  };

  const editingFeed = editingFeedId ? feeds.find((feed) => feed.id === editingFeedId) || null : null;

  const renderFeedRow = (feed: Feed, category: string, options: { draggable: boolean; showDragHandle: boolean; showCategory: boolean; editable: boolean }) => {
    const isDragTarget = options.draggable && dragOverFeedId === feed.id && draggedFeedId !== feed.id;
    const draggedFeed = draggedFeedId
      ? feeds.find((candidate) => candidate.id === draggedFeedId)
      : undefined;
    const isSameFolderDrag = !!draggedFeed && feedCategory(draggedFeed) === category;
    return (
      <div
        key={feed.id}
        onDragOver={(event) => {
          if (options.draggable && isSameFolderDrag) {
            event.preventDefault();
            setDragOverFeedId(feed.id);
          }
        }}
        onDrop={() => moveFeed(feed.id)}
        className={`wreader-settings-feed-row ${draggedFeedId === feed.id ? "opacity-50" : ""} ${isDragTarget ? "ring-2 ring-blue-300" : ""}`}
      >
        <div className="wreader-settings-feed-head">
          {options.showDragHandle && (
            <span
              className="wreader-settings-drag"
              draggable={options.draggable}
              onDragStart={(event) => {
                if (!options.draggable) return;
                event.stopPropagation();
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", feed.id);
                setDraggedFeedId(feed.id);
                setDragOverFeedId(null);
              }}
              onDragEnd={() => {
                setDraggedFeedId(null);
                setDragOverFeedId(null);
              }}
            >
              <DragHandle disabled={!options.draggable} label={`拖动${feed.title}调整${category}内顺序`} />
            </span>
          )}
          {feed.favicon ? (
            <img src={feed.favicon} alt="" className="wreader-settings-feed-icon h-4 w-4 shrink-0 rounded object-contain" onError={(e) => { (e.target as HTMLElement).style.display = "none"; }} />
          ) : (
            <div className="wreader-settings-feed-icon flex h-4 w-4 shrink-0 items-center justify-center rounded bg-blue-500 text-[9px] font-bold text-white">
              {feed.title.slice(0, 2).toUpperCase()}
            </div>
          )}
          {options.editable ? (
            <button type="button" onClick={() => handleStartEditFeed(feed)} aria-label={`编辑${feed.title}`} className="wreader-settings-feed-open">
              <span className="wreader-settings-feed-copy">
                <strong>{feed.title}</strong>
                {options.showCategory && <small>{category}</small>}
              </span>
            </button>
          ) : (
            <span className="wreader-settings-feed-copy"><strong>{feed.title}</strong></span>
          )}
          {!options.editable && category !== "未分类" && (
            <div className="wreader-settings-row-actions">
              <button type="button" onClick={() => onUpdateFeedCategory(feed.id, "未分类")} title="移出文件夹" aria-label={`将${feed.title}移出文件夹`}><FolderMinus /></button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const activeDescription = activeTab === "transcript"
    ? "可选增强功能。不配置也不影响 RSS 阅读和播客播放。"
    : activeTab === "insight"
      ? "可选增强功能。不配置也不影响 RSS 阅读、收藏和笔记。"
      : activeTab === "data"
        ? "订阅和阅读数据优先保存在本机。定期导出完整备份可避免浏览器数据被清理后无法恢复。"
        : null;

  return (
    <div ref={settingsDialogRef} className="wreader-settings-modal fixed inset-0 z-[70] grid place-items-center p-6" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title">
      <button type="button" className="wreader-settings-backdrop absolute inset-0" onClick={onBack} aria-label="关闭设置" />
      <section className="wreader-settings-card relative flex w-full overflow-hidden">
        <aside className="wreader-settings-sidebar">
          <div className="wreader-settings-sidebar-title">设置</div>
          <nav
            aria-label="设置分类"
            role="tablist"
            aria-orientation="vertical"
            ref={tabsRef}
            onKeyDown={handleTabsKeyDown}
            className="wreader-settings-tabs"
          >
            <div className="wreader-settings-nav-group">
              <div className="wreader-settings-nav-group-title">内容</div>
              <button type="button" ref={defaultTabRef} {...tabProps("feeds")} className={tabClassName("feeds")}><Rss /><span>订阅源</span></button>
              <button type="button" {...tabProps("folders")} className={tabClassName("folders")}><Folder /><span>文件夹</span></button>
            </div>
            <div className="wreader-settings-nav-group">
              <div className="wreader-settings-nav-group-title">可选增强</div>
              <button type="button" {...tabProps("transcript")} className={tabClassName("transcript")}><AudioLines /><span>逐字稿</span></button>
              <button type="button" {...tabProps("insight")} className={tabClassName("insight")}><Sparkles /><span>AI 摘要</span></button>
            </div>
            <div className="wreader-settings-nav-standalone">
              <button type="button" {...tabProps("data")} className={tabClassName("data")}><Database /><span>数据与备份</span></button>
              <button type="button" {...tabProps("shortcuts")} className={tabClassName("shortcuts")}><Keyboard /><span>快捷键</span></button>
            </div>
          </nav>
        </aside>
        <div className="wreader-settings-main min-w-0">
          <header className="wreader-settings-header flex shrink-0 items-start justify-between">
            <div className="wreader-settings-heading">
              <h1 id="settings-modal-title">{{ feeds: "订阅源", folders: "文件夹", transcript: "转录", insight: "AI 摘要", data: "数据与备份", shortcuts: "快捷键" }[activeTab]}</h1>
              {activeDescription && <p>{activeDescription}</p>}
            </div>
            <button type="button" onClick={onBack} aria-label="关闭设置" className="wreader-settings-close"><X /></button>
          </header>
          <div className="wreader-settings-body scrollbar-thin">
            <div className="wreader-settings-page w-full">
              <div className="wreader-settings-content min-w-0">
          {activeTab === "feeds" && (
            <section id="settings-panel-feeds" role="tabpanel" aria-labelledby="settings-tab-feeds" className="wreader-settings-panel">
              <div className="wreader-settings-filters">
                {feeds.length > 0 ? (
                  <label className="wreader-settings-search">
                    <Search />
                    <input
                        type="search"
                        value={feedSearchQuery}
                        onChange={(event) => setFeedSearchQuery(event.target.value)}
                        aria-label="搜索订阅源"
                        placeholder="搜索订阅源"
                      />
                  </label>
                ) : <span />}
                <div className="wreader-settings-actions">
                  <button type="button" onClick={onOpenAddFeed} className="secondary">导入 OPML</button>
                  <button type="button" onClick={onOpenAddFeed}>添加订阅</button>
                </div>
              </div>

              {feeds.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  暂无订阅源，请通过“添加订阅”按钮添加 RSS 源。
                </div>
              ) : normalizedFeedSearch && filteredFeeds.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  没有匹配的订阅源。
                </div>
              ) : <div className="wreader-settings-groups" aria-label={normalizedFeedSearch ? "搜索结果" : "全部订阅源"}>{displayedFeeds.map((feed) => renderFeedRow(feed, feedCategory(feed), { draggable: false, showDragHandle: false, showCategory: true, editable: true }))}</div>}

            </section>
          )}

          {activeTab === "folders" && (
            <section id="settings-panel-folders" role="tabpanel" aria-labelledby="settings-tab-folders" className="wreader-settings-panel">
              {isFolderComposerOpen && <form onSubmit={handleCreateFolder} className="wreader-settings-folder-composer"><div className="wreader-settings-folder-dialog"><label><span>文件夹名称</span><input autoFocus type="text" value={newFolderInput} onChange={(event) => setNewFolderInput(event.target.value)} placeholder="例如：待读主题" /></label><div className="wreader-settings-folder-actions"><button type="button" onClick={() => { setIsFolderComposerOpen(false); setNewFolderInput(""); }}>取消</button><button type="submit" disabled={!newFolderInput.trim()}>创建文件夹</button></div></div></form>}
              <div className="wreader-settings-filters"><SortControl value={effectiveFolderSortMode} onChange={updateFolderSortMode} label="文件夹排序" /><div className="wreader-settings-actions"><button type="button" onClick={() => setIsFolderComposerOpen(true)}>新建文件夹</button></div></div>
              <div className="wreader-settings-groups">
                {sortedCategories.map((category) => {
                  const groupFeeds = sortFeedsInFolder(feeds, category, effectiveFolderSortMode, feedOrderByFolder);
                  const isEditing = editingCategory === category;
                  const isExpanded = expandedCategories.includes(category);
                  const feedListId = `settings-folder-feeds-${sortedCategories.indexOf(category)}`;
                  return <section key={category} aria-label={`${category}文件夹`} draggable={canDragCategories} onDragStart={() => canDragCategories && setDraggedCategory(category)} onDragOver={(event) => canDragCategories && event.preventDefault()} onDrop={() => moveCategory(category)} onDragEnd={() => setDraggedCategory(null)} className={`wreader-settings-group ${draggedCategory === category ? "opacity-50" : ""}`}>
                    <div className="wreader-settings-group-heading">
                      <span className="wreader-settings-folder-drag"><DragHandle disabled={!canDragCategories} label={`拖动${category}调整文件夹顺序`} /></span>
                      {isEditing ? (
                        <>
                          <span className="wreader-settings-folder-icon"><Folder /></span>
                          <input autoFocus value={editCategoryInput} onChange={(event) => setEditCategoryInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") handleSaveRename(category); if (event.key === "Escape") setEditingCategory(null); }} aria-label={`重命名${category}`} className="wreader-settings-folder-name-input" />
                        </>
                      ) : (
                        <button type="button" onClick={() => toggleFolder(category)} aria-expanded={isExpanded} aria-controls={isExpanded ? feedListId : undefined} className="wreader-settings-folder-toggle">
                          <ChevronRight aria-hidden="true" className={`wreader-settings-folder-chevron${isExpanded ? " is-expanded" : ""}`} />
                          <span className="wreader-settings-folder-icon"><Folder /></span>
                          <strong className="truncate">{category}</strong>
                          <small>{groupFeeds.length} 个订阅源</small>
                        </button>
                      )}
                      <div className="wreader-settings-row-actions">{isEditing ? <button type="button" onClick={() => handleSaveRename(category)} aria-label={`保存${category}`}><Check /></button> : <div className="wreader-settings-more-wrap"><button type="button" onClick={() => setOpenMoreMenu((current) => current === `folder:${category}` ? null : `folder:${category}`)} aria-label={`${category}文件夹更多操作`}><MoreHorizontal /></button>{openMoreMenu === `folder:${category}` && <div className="wreader-settings-menu"><button type="button" onClick={() => { setOpenMoreMenu(null); handleStartRename(category); }}>重命名</button><button type="button" className="danger" onClick={() => { setOpenMoreMenu(null); if (confirm(`确定要删除文件夹"${category}"吗？其中订阅源将被移至"未分类"。`)) onDeleteCategory(category); }}>删除文件夹</button></div>}</div>}</div>
                    </div>
                    {!isEditing && isExpanded && (
                      <div id={feedListId} className="wreader-settings-group-feeds">
                        {groupFeeds.length === 0
                          ? <p className="wreader-settings-group-empty">该文件夹还没有订阅源。</p>
                          : groupFeeds.map((feed) => renderFeedRow(feed, category, { draggable: canDragFolderFeeds, showDragHandle: true, showCategory: false, editable: false }))}
                      </div>
                    )}
                  </section>;
                })}
              </div>
            </section>
          )}

          {activeTab === "transcript" && <LocalAiSettingsPanel view="transcription" panelId="settings-panel-transcript" />}
          {activeTab === "insight" && <LocalAiSettingsPanel view="insight" panelId="settings-panel-insight" />}
          {activeTab === "data" && (
            <section id="settings-panel-data" role="tabpanel" aria-labelledby="settings-tab-data" className="wreader-settings-data">
              <div className="wreader-settings-data-grid">
                <button type="button" onClick={() => exportOpml(feeds)} className="wreader-settings-action-card"><Download /><strong>导出 OPML</strong><span>仅导出订阅源和文件夹，适合迁移到其他阅读器。</span></button>
                <button type="button" onClick={onOpenAddFeed} className="wreader-settings-action-card"><Upload /><strong>导入 OPML</strong><span>打开添加订阅流程，并报告新增、重复和无效数量。</span></button>
                {onExportBackup && <button type="button" onClick={onExportBackup} className="wreader-settings-action-card"><Database /><strong>导出完整备份</strong><span>包含订阅、文章、状态、笔记、播放列表和进度。</span></button>}
                {onImportBackup && <label className="wreader-settings-action-card cursor-pointer"><Upload /><strong>恢复完整备份</strong><span>恢复会替换当前本地业务数据，请先导出当前备份。</span><input type="file" accept="application/json,.json" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImportBackup(file); event.currentTarget.value = ""; }} /></label>}
              </div>
            </section>
          )}
          {activeTab === "shortcuts" && (
            <section id="settings-panel-shortcuts" role="tabpanel" aria-labelledby="settings-tab-shortcuts" className="wreader-shortcuts-page">
              <div className="wreader-shortcut-list">
                {KEYBOARD_SHORTCUTS.map((shortcut) => (
                  <div key={shortcut.id}>
                    <span>{shortcut.label}</span>
                    <span>
                      {shortcut.keys.map((key, index) => (
                        <React.Fragment key={key}>
                          {index > 0 && shortcut.joiner ? <span>{shortcut.joiner}</span> : null}
                          <kbd>{key}</kbd>
                        </React.Fragment>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {editingFeed && (
        <div
          className="wreader-feed-edit-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feed-edit-title"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              handleCancelEditFeed();
            }
          }}
        >
          <button type="button" className="wreader-feed-edit-backdrop" aria-label="关闭编辑订阅源" onClick={handleCancelEditFeed} />
          <form
            className="wreader-feed-edit-card"
            onSubmit={(event) => {
              event.preventDefault();
              handleSaveFeedUrls(editingFeed);
            }}
          >
            <header>
              <h2 id="feed-edit-title">编辑订阅源</h2>
              <button type="button" aria-label="关闭编辑订阅源" onClick={handleCancelEditFeed}><X /></button>
            </header>

            <div className="wreader-feed-edit-body">
              <div className="wreader-feed-edit-identity" aria-label={`当前订阅源：${editingFeed.title}`}>
                {editingFeed.favicon ? (
                  <img
                    src={editingFeed.favicon}
                    alt=""
                    className="wreader-feed-edit-cover"
                    onError={(event) => { (event.currentTarget as HTMLElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="wreader-feed-edit-cover is-fallback" aria-hidden="true">
                    {editingFeed.title.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <strong>{editingFeed.title}</strong>
              </div>
              <label>
                <span>所属文件夹</span>
                <select
                  autoFocus
                  value={editFeedCategoryInput}
                  onChange={(event) => setEditFeedCategoryInput(event.target.value)}
                  aria-label={`更改${editingFeed.title}所属文件夹`}
                >
                  {feedCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </label>

              <label>
                <span>RSS 链接</span>
                <input
                  type="url"
                  value={editFeedUrlInput}
                  onChange={(event) => setEditFeedUrlInput(event.target.value)}
                  placeholder="https://example.com/feed.xml"
                />
              </label>

              {enrichmentSourceEditorEnabled && <div>
                <label>
                  <span>内容增强源（高级）</span>
                  <input
                    type="url"
                    value={editEnrichmentAction === "disabled" ? "" : editBidclubFeedUrlInput}
                    onChange={(event) => {
                      setEditBidclubFeedUrlInput(event.target.value);
                      setEditEnrichmentAction(event.target.value.trim() ? "manual" : "auto");
                    }}
                    placeholder="https://bidclub.ai/feeds/example.xml"
                  />
                  <small>可选，用于补充摘要、章节和逐字稿；不会替换主 RSS 或音频来源。</small>
                </label>
                <button type="button" className="secondary" onClick={() => {
                  if (editEnrichmentAction === "disabled") {
                    setEditEnrichmentAction("auto");
                    setEditBidclubFeedUrlInput("");
                  } else {
                    setEditEnrichmentAction("disabled");
                  }
                }}>{editEnrichmentAction === "disabled" ? "恢复自动增强" : "关闭内容增强"}</button>
              </div>}
            </div>

            <footer>
              <button
                type="button"
                className="danger"
                aria-label="删除订阅源"
                onClick={() => {
                  if (confirm(`确定要删除订阅"${editingFeed.title}"吗？`)) {
                    handleCancelEditFeed();
                    onDeleteFeed(editingFeed.id);
                  }
                }}
              >
                <Trash2 />
                删除订阅源
              </button>
              <div>
                <button type="button" className="secondary" onClick={handleCancelEditFeed}>取消</button>
                <button type="submit" disabled={!editFeedUrlInput.trim()} title="保存订阅设置" aria-label="保存订阅设置">保存</button>
              </div>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
};
