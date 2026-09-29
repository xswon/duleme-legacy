import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Article, ArticleNote, DetailTab, Feed } from "./types";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { ArticleList } from "./components/ArticleList";
import { ArticleDetailModal } from "./components/ArticleDetailModal";
import { DetailSelectionEmpty } from "./components/DetailSelectionEmpty";
import { AddFeedModal } from "./components/AddFeedModal";
import { SettingsPage } from "./components/ManageFeedsModal";
import { SearchView } from "./components/SearchView";
import { PlaylistView } from "./components/PlaylistView";
import { NotesView } from "./components/NotesView";
import { KeyboardShortcutsModal } from "./components/KeyboardShortcutsModal";
import { ReaderFeedbackLayer } from "./components/ReaderFeedbackLayer";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { DEFAULT_HISTORY_WINDOW_DAYS, HISTORY_WINDOW_STEP_DAYS, canAutoMarkRead } from "./services/articleVisibility";
import { applyFeedUnreadCounts } from "./services/articleMetrics";
import { getArticleByLogicalOffset } from "./services/articleIndex";
import { createDataBackup, getAppStateFromDB, getAudioProgressMapFromDB, restoreDataBackup } from "./services/dbService";
import { useReaderNavigation } from "./hooks/useReaderNavigation";
import { useReaderToast, useRefreshFeedback } from "./hooks/useReaderFeedback";
import { useReaderLibrary } from "./hooks/useReaderLibrary";
import { useReaderDerivedState } from "./hooks/useReaderDerivedState";
import { usePlaylistAudioController } from "./hooks/usePlaylistAudioController";
import { useReaderPersistence } from "./hooks/useReaderPersistence";
import { useFeedSync } from "./hooks/useFeedSync";
import { useFeedManagement } from "./hooks/useFeedManagement";
import { useArticleNotes } from "./hooks/useArticleNotes";
import { useArticleMutations } from "./hooks/useArticleMutations";
import { useLatestRef } from "./hooks/useLatestRef";
import { useArticleGenerationTasks, type ArticleGenerationTask } from "./hooks/useArticleGenerationTasks";
import { FEATURED_CURATED_FEEDS } from "./data/defaultFeeds";

type SettingsTab = "feeds" | "folders" | "transcript" | "insight" | "data" | "shortcuts";

export default function App() {
  const navigation = useReaderNavigation();
  const {
    activeTab, setActiveTab, filterType, contentType, selectedFeedId, setSelectedFeedId,
    selectedCategory, setSelectedCategory, selectedArticleId, setSelectedArticleId,
    searchQuery, setSearchQuery, historyWindowDays, activeDetailTab,
    detailOpenIntent, setDetailOpenIntent, isSettingsOpen, setIsSettingsOpen,
    isMobileMenuOpen, setIsMobileMenuOpen, navigateToRoute,
  } = navigation;
  const { toast, showToast, showToastWithAction } = useReaderToast();
  const library = useReaderLibrary();
  const {
    feeds, setFeeds, feedsRef, articles, setArticles, articlesRef,
    categories, setCategories, feedOrderByFolder, setFeedOrderByFolder,
    feedSortMode, setFeedSortMode, folderSortMode, setFolderSortMode, isInitializing,
  } = library;
  const [timelineSortOrder, setTimelineSortOrder] = useState<"newest" | "oldest">("newest");
  const derived = useReaderDerivedState({
    articles, feeds, activeTab, filterType, contentType, selectedFeedId, selectedCategory,
    selectedArticleId, searchQuery, historyWindowDays, timelineSortOrder,
  });
  const {
    articleLookup, selectedArticle, articleMetrics, effectiveContentType, showTimelineFilters,
    deferredSearchQuery, searchResults, visibleArticles, olderArticleCount, visibleUnreadCount,
    visibleIndexById, nextArticle, previousArticle,
  } = derived;
  const playlist = usePlaylistAudioController({
    articleLookup, selectedArticleId, setSelectedArticleId, showToast, showToastWithAction,
  });
  const {
    playlistIds, setPlaylistIds, playlistIdsRef, playablePlaylistIds, playlistArticles,
    audioProgressMap, setAudioProgressMap, audioProgressMapRef, audioPlayer,
    autoPlayNextRef, sortOrder: playlistSortOrder, toggleSortOrder: togglePlaylistSort,
    togglePlaylist, removeFromPlaylist, removeMany: removeManyFromPlaylist,
    clear: clearPlaylist, reorder: reorderPlaylist, commitArticleIdMigration,
  } = playlist;
  const { isAppStateReady, isOnboardingComplete, completeOnboarding } = useReaderPersistence({
    feeds, setFeeds, categories, setCategories, feedOrderByFolder, setFeedOrderByFolder,
    playlistIds, setPlaylistIds, audioProgressMap, setAudioProgressMap, showToast,
  });
  const sync = useFeedSync({
    feeds, setFeeds, feedsRef, articles, setArticles, articlesRef,
    playlistIdsRef, audioProgressMapRef, commitArticleIdMigration, setSelectedArticleId,
    isInitializing, isAppStateReady, showToast,
  });
  const { isRefreshing, refreshState, refreshAll, retryFeed, queueRefresh, invalidateRefresh } = sync;
  const refreshFeedback = useRefreshFeedback(refreshState, isRefreshing);
  const notes = useArticleNotes({ articleLookup, showToast });
  const { setNotes: setArticleNotes, visibleNotes: visibleArticleNotes } = notes;
  const visibleArticlesRef = useLatestRef(visibleArticles);
  const visibleIndexByIdRef = useLatestRef(visibleIndexById);
  const mutations = useArticleMutations({ articlesRef, setArticles, visibleArticlesRef, showToast, showToastWithAction });
  const selectedArticleIdRef = useLatestRef(selectedArticleId);
  const activeDetailTabRef = useLatestRef(activeDetailTab);
  const openGenerationResult = useCallback((articleId: string, tab: DetailTab) => {
    navigateToRoute({ articleId, detailTab: tab });
  }, [navigateToRoute]);
  const generation = useArticleGenerationTasks({
    articles,
    articlesRef,
    patchArticle: mutations.patchArticle,
    isResultVisible: useCallback((articleId: string, tab: DetailTab) => (
      document.visibilityState === "visible"
        && selectedArticleIdRef.current === articleId
        && activeDetailTabRef.current === tab
    ), [activeDetailTabRef, selectedArticleIdRef]),
    onCompleted: useCallback((message: string, articleId: string, tab: DetailTab) => {
      showToastWithAction(message, { label: "查看", run: () => openGenerationResult(articleId, tab) });
    }, [openGenerationResult, showToastWithAction]),
  });
  const generationFeedbackTask = useMemo(() => {
    const task = generation.feedbackTask;
    if (!task || document.visibilityState !== "visible" || selectedArticleId !== task.articleId) return task;
    const visibleTab = task.kind === "pipeline" || task.stage === "summarizing" ? "overview" : "transcript";
    return activeDetailTab === visibleTab ? null : task;
  }, [activeDetailTab, generation.feedbackTask, selectedArticleId]);

  const [invalidArticleId, setInvalidArticleId] = useState<string | null>(null);
  const [isImmersive, setIsImmersive] = useState(false);
  const [isAddFeedOpen, setIsAddFeedOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>("feeds");
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const readerScrollTopBeforeSettings = useRef(0);
  const scrollPositions = useRef<Record<string, number>>({});
  const detailScrollPositions = useRef<Record<string, number>>({});
  const autoReadTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!isInitializing && selectedArticleId && !selectedArticle) setInvalidArticleId(selectedArticleId);
    else if (selectedArticle) setInvalidArticleId(null);
  }, [isInitializing, selectedArticle, selectedArticleId]);

  useEffect(() => {
    setFeeds((current) => applyFeedUnreadCounts(current, articleMetrics.recentUnreadByFeedId));
  }, [articleMetrics, setFeeds]);

  const handleToggleRead = useCallback((articleId: string) => {
    if (autoReadTimers.current[articleId]) {
      clearTimeout(autoReadTimers.current[articleId]);
      delete autoReadTimers.current[articleId];
    }
    mutations.toggleRead(articleId);
  // mutations is intentionally a stable controller object; depending on its method avoids unrelated controller changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- See the controller dependency contract above.
  }, [mutations.toggleRead]);

  const handleSelectArticle = useCallback((article: Article) => {
    const scopeKey = `${activeTab}:${selectedFeedId || "all"}:${selectedCategory || "all"}:${searchQuery}`;
    if (mainScrollRef.current) scrollPositions.current[scopeKey] = mainScrollRef.current.scrollTop;
    setDetailOpenIntent(undefined);
    navigateToRoute({ articleId: article.id, detailTab: undefined });
    if (canAutoMarkRead(article)) {
      if (autoReadTimers.current[article.id]) clearTimeout(autoReadTimers.current[article.id]);
      autoReadTimers.current[article.id] = setTimeout(() => {
        const current = articlesRef.current.find((item) => item.id === article.id);
        if (current && !current.read) handleToggleRead(article.id);
        delete autoReadTimers.current[article.id];
      }, 2000);
    }
  }, [activeTab, articlesRef, handleToggleRead, navigateToRoute, searchQuery, selectedCategory, selectedFeedId, setDetailOpenIntent]);

  const updateReadingProgress = useCallback((articleId: string, progress: number) => {
    const normalized = Math.max(0, Math.min(1, progress));
    mutations.persistPatch(articleId, { readingProgress: normalized, readingProgressUpdatedAt: Date.now() }, "阅读进度保存失败，请重试");
    const article = articlesRef.current.find((item) => item.id === articleId);
    if (normalized >= 0.4 && article && canAutoMarkRead(article)) handleToggleRead(articleId);
  // mutations is intentionally a stable controller object; depending on its method avoids unrelated controller changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- See the controller dependency contract above.
  }, [articlesRef, handleToggleRead, mutations.persistPatch]);

  const closeArticle = useCallback(() => {
    setIsImmersive(false);
    setDetailOpenIntent(undefined);
    navigateToRoute({ articleId: null, detailTab: undefined }, true);
    Object.values(autoReadTimers.current).forEach(clearTimeout);
    autoReadTimers.current = {};
    const scopeKey = `${activeTab}:${selectedFeedId || "all"}:${selectedCategory || "all"}:${searchQuery}`;
    const position = scrollPositions.current[scopeKey];
    if (position !== undefined) requestAnimationFrame(() => {
      if (mainScrollRef.current) mainScrollRef.current.scrollTop = position;
    });
  }, [activeTab, navigateToRoute, searchQuery, selectedCategory, selectedFeedId, setDetailOpenIntent]);

  const openNote = useCallback((note: ArticleNote) => {
    setIsImmersive(false);
    setDetailOpenIntent(note.source === "transcript" && note.transcriptStartMs !== undefined
      ? { tab: "transcript", note }
      : { tab: "notes" });
    navigateToRoute({ articleId: note.articleId, detailTab: note.source === "transcript" ? "transcript" : "notes" });
  }, [navigateToRoute, setDetailOpenIntent]);

  const feedManagement = useFeedManagement({
    feeds, setFeeds, feedsRef, articlesRef, setArticles, categories, setCategories, setFeedOrderByFolder,
    selectedFeedId, setSelectedFeedId, selectedCategory, setSelectedCategory,
    selectedArticle, setSelectedArticleId, isSettingsOpen, navigateToRoute,
    queueRefresh, invalidateRefresh, showToast,
  });

  const startWithFeaturedFeeds = useCallback((feedIds: string[], artworkById: Record<string, string>) => {
    const selectedIds = new Set(feedIds);
    const selectedFeeds: Feed[] = FEATURED_CURATED_FEEDS
      .filter((feed) => selectedIds.has(feed.id))
      .map((feed) => ({
        id: feed.id,
        title: feed.title,
        feedUrl: feed.feedUrl,
        siteUrl: feed.siteUrl || feed.feedUrl,
        favicon: artworkById[feed.id] || (feed.contentType === "article" ? feed.favicon : undefined),
        category: feed.category,
        description: feed.description,
        unreadCount: 0,
        bidclubFeedUrl: feed.bidclubFeedUrl,
        bidclubShowSlug: feed.bidclubShowSlug,
      }));
    if (selectedFeeds.length === 0) return;
    setFeeds(selectedFeeds);
    setCategories((current) => Array.from(new Set([
      ...current,
      ...selectedFeeds.map((feed) => feed.category || "未分类"),
    ])));
    completeOnboarding();
    queueRefresh(selectedFeeds.map((feed) => feed.id));
    navigateToRoute({ activeTab: "feeds", filterType: "all", selectedFeedId: null, selectedCategory: null, articleId: null, detailTab: undefined });
  }, [completeOnboarding, navigateToRoute, queueRefresh, setCategories, setFeeds]);

  const importOpmlFile = feedManagement.importOpmlFile;
  const importWelcomeOpml = useCallback(async (file: File) => {
    const imported = await importOpmlFile(file);
    if (imported) completeOnboarding();
    return imported;
  }, [completeOnboarding, importOpmlFile]);

  const startWithEmptyLibrary = useCallback(() => {
    completeOnboarding();
    navigateToRoute({ activeTab: "feeds", filterType: "all", selectedFeedId: null, selectedCategory: null, articleId: null, detailTab: undefined });
  }, [completeOnboarding, navigateToRoute]);

  const openSettings = useCallback((tab: SettingsTab) => {
    readerScrollTopBeforeSettings.current = mainScrollRef.current?.scrollTop || 0;
    setSettingsInitialTab(tab);
    setIsMobileMenuOpen(false);
    setIsSettingsOpen(true);
  }, [setIsMobileMenuOpen, setIsSettingsOpen]);

  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
    setIsMobileMenuOpen(false);
    requestAnimationFrame(() => {
      if (mainScrollRef.current) mainScrollRef.current.scrollTop = readerScrollTopBeforeSettings.current;
    });
  }, [setIsMobileMenuOpen, setIsSettingsOpen]);

  const exportBackup = useCallback(async () => {
    try {
      const backup = await createDataBackup();
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `wreader-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      showToast("备份已导出");
    } catch (error) {
      showToast(`备份导出失败：${error instanceof Error ? error.message : "请重试"}`);
    }
  }, [showToast]);

  const importBackup = useCallback(async (file: File) => {
    try {
      const result = await restoreDataBackup(await file.text());
      const [state, storedAudioProgress] = await Promise.all([getAppStateFromDB(), getAudioProgressMapFromDB()]);
      setFeeds(result.feeds);
      setArticles(result.articles);
      setArticleNotes(result.notes);
      if (state?.categories) setCategories(state.categories);
      if (state?.feedOrderByFolder) setFeedOrderByFolder(state.feedOrderByFolder);
      if (state?.playlistIds) setPlaylistIds(state.playlistIds);
      setAudioProgressMap(storedAudioProgress);
      showToast(`已恢复备份：${result.feeds.length} 个订阅源、${result.articles.length} 篇文章`);
    } catch (error) {
      showToast(`备份恢复失败：${error instanceof Error ? error.message : "文件无效"}`);
    }
  }, [setArticleNotes, setArticles, setAudioProgressMap, setCategories, setFeedOrderByFolder, setFeeds, setPlaylistIds, showToast]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        navigateToRoute({ activeTab: "search", selectedFeedId: null, selectedCategory: null, articleId: null });
        return;
      }
      const tag = (event.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (event.key === "j" || event.key === "J") {
        const currentArticles = visibleArticlesRef.current;
        const article = selectedArticle
          ? visibleIndexByIdRef.current.has(selectedArticle.id)
            ? getArticleByLogicalOffset(currentArticles, visibleIndexByIdRef.current, selectedArticle.id, 1) ?? currentArticles.at(-1)
            : currentArticles[0]
          : currentArticles[0];
        if (article) handleSelectArticle(article);
      } else if (event.key === "k" || event.key === "K") {
        const currentArticles = visibleArticlesRef.current;
        const article = selectedArticle
          ? getArticleByLogicalOffset(currentArticles, visibleIndexByIdRef.current, selectedArticle.id, -1) ?? currentArticles[0]
          : currentArticles[0];
        if (article) handleSelectArticle(article);
      } else if ((event.key === "s" || event.key === "S") && selectedArticle) mutations.toggleStar(selectedArticle.id);
      else if ((event.key === "m" || event.key === "M") && selectedArticle) handleToggleRead(selectedArticle.id);
      else if (event.key === "r" || event.key === "R") void refreshAll();
      else if (event.key === "a" || event.key === "A") setIsAddFeedOpen(true);
      else if (event.key === "?") setIsShortcutsOpen(true);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  // mutations is intentionally a stable controller object; depending on its method avoids unrelated controller changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- See the controller dependency contract above.
  }, [handleSelectArticle, handleToggleRead, mutations.toggleStar, navigateToRoute, refreshAll, selectedArticle, visibleArticlesRef, visibleIndexByIdRef]);

  const totalUnread = articleMetrics.totalRecentUnread;
  const totalSaved = articleMetrics.totalSaved;
  const activeTitle = useMemo(() => {
    if (activeTab === "playlist") return "播客";
    if (activeTab === "notes") return "笔记";
    if (activeTab === "saved") return "收藏文章";
    if (activeTab === "search") return "搜索";
    if (activeTab === "settings") return "设置";
    if (activeTab === "feeds" && filterType === "starred" && !selectedFeedId && !selectedCategory) return "收藏";
    if (activeTab === "feeds" && !selectedFeedId && !selectedCategory) return "时间线";
    if (selectedFeedId) return feeds.find((feed) => feed.id === selectedFeedId)?.title || "订阅文章";
    return selectedCategory ? selectedCategory.replace(/\s*\|\s*/g, " · ") : "全部订阅";
  }, [activeTab, feeds, filterType, selectedCategory, selectedFeedId]);
  const activeCountLabel = activeTab === "playlist" ? `${playlistArticles.length} 条`
    : activeTab === "notes" ? `${visibleArticleNotes.length} 条`
      : activeTab === "feeds" && filterType === "starred" && !selectedFeedId && !selectedCategory ? `${totalSaved} 条`
        : undefined;

  const isFavoritesView = activeTab === "feeds" && filterType === "starred";
  const articleListView = <ArticleList articles={visibleArticles} onSelectArticle={handleSelectArticle}
    onToggleStar={mutations.toggleStar} onToggleRead={handleToggleRead} onSummarizeAI={handleSelectArticle}
    playlistIds={playablePlaylistIds} onTogglePlaylist={togglePlaylist} olderArticleCount={isFavoritesView ? 0 : olderArticleCount}
    historyWindowDays={historyWindowDays} historyWindowStepDays={HISTORY_WINDOW_STEP_DAYS}
    onShowOlder={isFavoritesView ? undefined : () => navigateToRoute({ historyWindowDays: historyWindowDays + HISTORY_WINDOW_STEP_DAYS })}
    onHideOlder={isFavoritesView ? undefined : () => navigateToRoute({ historyWindowDays: DEFAULT_HISTORY_WINDOW_DAYS })} selectedArticleId={selectedArticleId} />;

  const masterView = activeTab === "playlist" ? <PlaylistView articles={playlistArticles} audioProgressMap={audioProgressMap}
    audioPlayer={audioPlayer} onSelectArticle={handleSelectArticle} onRemoveFromPlaylist={removeFromPlaylist}
    onClearPlaylist={clearPlaylist} onReorder={reorderPlaylist} onRemoveMany={removeManyFromPlaylist}
    isLoading={isInitializing} onNavigateFeeds={() => navigateToRoute({ activeTab: "feeds", filterType: "all", selectedFeedId: null, selectedCategory: null, articleId: null, detailTab: undefined })} />
    : activeTab === "notes" ? <NotesView notes={visibleArticleNotes} articles={articles} onOpen={openNote} onUpdate={notes.updateNote} onDelete={notes.deleteNote} />
      : activeTab === "search" ? <SearchView results={searchResults} feeds={feeds} searchQuery={searchQuery}
        resultQuery={deferredSearchQuery} setSearchQuery={(query) => { setSearchQuery(query); navigateToRoute({ activeTab: "search", searchQuery: query, articleId: selectedArticleId }, true); }}
        onSelectArticle={handleSelectArticle} onToggleStar={mutations.toggleStar} onToggleRead={handleToggleRead}
        onSummarizeAI={handleSelectArticle} selectedArticleId={selectedArticleId} /> : articleListView;

  const detailView = selectedArticle ? <ArticleDetailModal article={selectedArticle} onClose={closeArticle}
    onOpenNavigation={() => setIsMobileMenuOpen(true)} onToggleStar={mutations.toggleStar} onToggleRead={handleToggleRead}
    onNextArticle={nextArticle ? () => setSelectedArticleId(nextArticle.id) : undefined}
    onPrevArticle={previousArticle ? () => setSelectedArticleId(previousArticle.id) : undefined}
    playlistIds={playablePlaylistIds} onTogglePlaylist={togglePlaylist} savedProgress={audioProgressMap[selectedArticle.id]}
    audioPlayer={audioPlayer} autoPlay={autoPlayNextRef.current === selectedArticle.id} onAutoPlayStarted={() => { autoPlayNextRef.current = null; }}
    onArticlePatch={mutations.patchArticle} savedReadingProgress={selectedArticle.readingProgress}
    savedScrollTop={detailScrollPositions.current[selectedArticle.id]}
    onScrollPositionChange={(articleId, scrollTop) => { detailScrollPositions.current[articleId] = scrollTop; }}
    onReadingProgressChange={updateReadingProgress} initialOpenTarget={detailOpenIntent} initialDetailTab={activeDetailTab}
    onDetailTabChange={(tab) => navigateToRoute({ detailTab: tab })} isImmersive={isImmersive}
    onToggleImmersive={() => setIsImmersive((immersive) => !immersive)} onOpenAiSettings={() => openSettings("insight")}
    onOpenTranscriptionSettings={() => openSettings("transcript")} generation={generation} />
    : invalidArticleId ? <div className="flex h-full items-center justify-center px-6 text-center"><div className="max-w-sm"><h2 className="text-base font-semibold text-slate-700">这篇文章暂时不可用</h2><p className="mt-2 text-sm leading-6 text-slate-500">文章可能已被删除或所属订阅源已取消。</p><button type="button" onClick={closeArticle} className="mt-4 wreader-btn wreader-btn-primary">返回列表</button></div></div>
      : <DetailSelectionEmpty kind={activeTab === "playlist" ? "podcast" : "article"} />;

  if (isInitializing || !isAppStateReady) {
    return <div className="flex h-screen items-center justify-center text-sm text-slate-500">正在加载本地数据…</div>;
  }

  if (!isOnboardingComplete) {
    return <WelcomeScreen
      featuredFeeds={FEATURED_CURATED_FEEDS}
      onUseFeatured={startWithFeaturedFeeds}
      onImportOpml={importWelcomeOpml}
      onStartEmpty={startWithEmptyLibrary}
    />;
  }

  return <div className={`wreader-app flex h-screen w-screen overflow-hidden bg-slate-100 text-slate-900 font-sans antialiased transition-colors duration-200 ${isSidebarCollapsed ? "is-sidebar-collapsed" : ""}`}>
    <audio ref={audioPlayer.audioRef} className="hidden" onPlay={audioPlayer.handlePlay} onPause={audioPlayer.handlePause}
      onTimeUpdate={audioPlayer.handleTimeUpdate} onLoadedMetadata={audioPlayer.handleLoadedMetadata}
      onEnded={audioPlayer.handleEnded} onError={audioPlayer.handleAudioError} />
    {!isImmersive && <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} filterType={filterType}
      feeds={feeds} categories={categories} selectedFeedId={selectedFeedId} setSelectedFeedId={setSelectedFeedId}
      selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory} totalUnread={totalUnread} totalSaved={totalSaved}
      playlistCount={0} notesCount={0} onOpenAddFeed={() => setIsAddFeedOpen(true)} onCreateFolder={feedManagement.addCategory}
      onOpenSettings={() => openSettings("feeds")} feedSortMode={feedSortMode} folderSortMode={folderSortMode}
      feedOrderByFolder={feedOrderByFolder} isMobileOpen={isMobileMenuOpen} setIsMobileOpen={setIsMobileMenuOpen}
      onNavigate={navigateToRoute} onRefresh={refreshAll} isRefreshing={isRefreshing} isCollapsed={isSidebarCollapsed}
      onCollapse={isSettingsOpen ? undefined : () => { setIsSidebarCollapsed((collapsed) => !collapsed); setIsMobileMenuOpen(false); }} />}
    <div className="min-w-0 flex-1 overflow-hidden">
      {isImmersive ? <main className="h-full bg-white">{detailView}</main> : <div className="wreader-workspace-grid h-full" data-detail-open={Boolean(selectedArticle || invalidArticleId)}>
        <section className="wreader-master flex min-h-0 flex-col bg-[#fbfcfd]">
          <Header activeTab={activeTab} currentTitle={activeTitle} currentCountLabel={activeCountLabel} filterType={filterType}
            setFilterType={(nextFilter) => navigateToRoute({ activeTab: "feeds", filterType: nextFilter, articleId: null })}
            onRefresh={refreshAll} onMarkAllRead={activeTab === "playlist" ? clearPlaylist : activeTab === "notes" ? notes.clearNotes : activeTab === "feeds" && filterType === "starred" ? mutations.clearFavorites : mutations.markAllRead}
            notesEmpty={visibleArticleNotes.length === 0} playlistEmpty={playlistIds.length === 0} favoritesEmpty={totalSaved === 0}
            isRefreshing={isRefreshing} onToggleMobileMenu={() => { if (window.matchMedia("(min-width: 1280px)").matches) setIsSidebarCollapsed(false); else setIsMobileMenuOpen((open) => !open); }}
            sidebarCollapsed={isSidebarCollapsed} onNavigateSearch={() => navigateToRoute({ activeTab: "search", filterType: "all", selectedFeedId: null, selectedCategory: null, articleId: null, detailTab: undefined })}
            unreadCount={visibleUnreadCount} showTimelineFilters={showTimelineFilters} contentType={effectiveContentType}
            onContentTypeChange={(nextContentType) => navigateToRoute({ activeTab: "feeds", contentType: nextContentType, articleId: null })}
            historyWindowDays={historyWindowDays} refreshProgress={{ completed: refreshState.completed, total: refreshState.total, successful: refreshState.successful, failed: refreshState.failed.length, newArticles: refreshState.newArticles }}
            lastSyncAt={refreshState.finishedAt} timelineSortOrder={activeTab === "playlist" ? playlistSortOrder : timelineSortOrder}
            onToggleTimelineSort={activeTab === "playlist" ? togglePlaylistSort : () => setTimelineSortOrder((order) => order === "newest" ? "oldest" : "newest")} />
          <main ref={mainScrollRef} className="wreader-master-scroll min-h-0 flex-1 overflow-y-auto scrollbar-thin">{masterView}</main>
        </section>
        <section className="wreader-detail min-h-0 overflow-hidden bg-white">{detailView}</section>
      </div>}
    </div>
    {isSettingsOpen && !isImmersive && <SettingsPage feeds={feeds} categories={categories}
      onAddCategory={feedManagement.addCategory} onRenameCategory={feedManagement.renameCategory} onDeleteCategory={feedManagement.deleteCategory}
      onUpdateFeedCategory={feedManagement.updateFeedCategory} onUpdateFeedUrls={feedManagement.updateFeedUrls} onDeleteFeed={feedManagement.deleteFeed}
      feedSortMode={feedSortMode} folderSortMode={folderSortMode} onFeedSortModeChange={setFeedSortMode} onFolderSortModeChange={setFolderSortMode}
      feedOrderByFolder={feedOrderByFolder} onReorderFolderFeeds={feedManagement.reorderFolderFeeds} onReorderCategories={feedManagement.reorderCategories}
      onBack={closeSettings} onOpenAddFeed={() => setIsAddFeedOpen(true)} onExportBackup={exportBackup} onImportBackup={importBackup} initialTab={settingsInitialTab} />}
    {!isImmersive && activeTab !== "settings" && !selectedArticle && !invalidArticleId && <nav className="wreader-mobile-tabs" aria-label="移动端阅读入口">
      <button type="button" className={activeTab === "feeds" && filterType !== "starred" && !selectedFeedId && !selectedCategory ? "is-active" : ""} onClick={() => navigateToRoute({ activeTab: "feeds", filterType: "all", selectedFeedId: null, selectedCategory: null, articleId: null, detailTab: undefined })}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2" /></svg><span>时间线</span></button>
      <button type="button" className={activeTab === "search" ? "is-active" : ""} onClick={() => navigateToRoute({ activeTab: "search", filterType: "all", selectedFeedId: null, selectedCategory: null, articleId: null, detailTab: undefined })}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></svg><span>搜索</span></button>
      <button type="button" className={activeTab === "feeds" && filterType === "starred" ? "is-active" : ""} onClick={() => navigateToRoute({ activeTab: "feeds", filterType: "starred", selectedFeedId: null, selectedCategory: null, articleId: null, detailTab: undefined })}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z" /></svg><span>收藏</span></button>
      <button type="button" aria-expanded={isMobileMenuOpen} aria-controls="inoreader-sidebar" onClick={() => setIsMobileMenuOpen((open) => !open)}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg><span>更多</span></button>
    </nav>}
    <AddFeedModal isOpen={isAddFeedOpen} onClose={() => setIsAddFeedOpen(false)} existingFeeds={feeds} onAddFeed={feedManagement.addFeed} onImportOpmlFile={feedManagement.importOpmlFile} onShowToast={showToast} />
    <KeyboardShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
    <ReaderFeedbackLayer toast={toast} refreshFeedback={refreshFeedback.refreshFeedback} refreshState={refreshState}
      failureDetailsOpen={refreshFeedback.isRefreshFailureDetailsOpen} onFailureDetailsOpenChange={refreshFeedback.setIsRefreshFailureDetailsOpen}
      onDismissRefresh={() => { refreshFeedback.setRefreshFeedback(null); refreshFeedback.setIsRefreshFailureDetailsOpen(false); }}
      onRetryFailed={() => { void refreshAll(refreshState.failed.map((feed) => feed.id)); }} onRetryFeed={(feedId) => { void retryFeed(feedId); }}
      generationTask={generationFeedbackTask} generationCount={generation.processingCount}
      onViewGeneration={(task: ArticleGenerationTask) => openGenerationResult(task.articleId, task.kind === "pipeline" || task.stage === "summarizing" ? "overview" : "transcript")}
      onDismissGeneration={generation.dismissTask} />
  </div>;
}
