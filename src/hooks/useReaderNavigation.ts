import { useCallback, useEffect, useRef, useState } from "react";
import type { ActiveTab, ArticleNote, DetailTab, FilterType } from "../types";
import { buildReaderUrl, parseReaderRoute, routeFromState, type ReaderRoute, type TimelineContentFilter } from "../services/router";

export type DetailOpenIntent =
  | { tab: "notes" }
  | { tab: "transcript"; note: ArticleNote }
  | undefined;

function readInitialRoute() {
  return parseReaderRoute(typeof window === "undefined" ? { pathname: "/today", search: "" } : window.location);
}

export function useReaderNavigation() {
  const initialRouteRef = useRef<ReaderRoute | null>(null);
  if (!initialRouteRef.current) initialRouteRef.current = readInitialRoute();
  const initialRoute = initialRouteRef.current;

  const [activeTab, setActiveTab] = useState<ActiveTab>(initialRoute.activeTab === "settings" ? "feeds" : initialRoute.activeTab);
  const [filterType, setFilterType] = useState<FilterType>(initialRoute.filterType);
  const [contentType, setContentType] = useState<TimelineContentFilter>(initialRoute.contentType);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(initialRoute.selectedFeedId);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(initialRoute.selectedCategory);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(initialRoute.articleId);
  const [searchQuery, setSearchQuery] = useState(initialRoute.searchQuery);
  const [historyWindowDays, setHistoryWindowDays] = useState(initialRoute.historyWindowDays);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab | "notes" | undefined>(initialRoute.detailTab);
  const [detailOpenIntent, setDetailOpenIntent] = useState<DetailOpenIntent>(
    initialRoute.detailTab === "notes" ? { tab: "notes" } : undefined,
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(initialRoute.activeTab === "settings");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const routeReady = useRef(false);
  const lastPushedUrl = useRef<string | null>(null);

  const currentRoute = useCallback((overrides: Partial<ReaderRoute> = {}): ReaderRoute => routeFromState({
    activeTab,
    filterType,
    selectedFeedId,
    selectedCategory,
    searchQuery,
    articleId: selectedArticleId,
    contentType,
    historyWindowDays,
    detailTab: Object.prototype.hasOwnProperty.call(overrides, "detailTab") ? overrides.detailTab : activeDetailTab,
    ...overrides,
  }), [activeTab, activeDetailTab, contentType, filterType, historyWindowDays, searchQuery, selectedArticleId, selectedCategory, selectedFeedId]);

  const navigateToRoute = useCallback((next: Partial<ReaderRoute>, replace = false) => {
    const route = currentRoute(next);
    const url = buildReaderUrl(route);
    if (typeof window !== "undefined" && window.location.pathname + window.location.search !== url) {
      if (replace) window.history.replaceState({}, "", url);
      else window.history.pushState({}, "", url);
      lastPushedUrl.current = url;
    }
    setActiveTab(route.activeTab);
    setFilterType(route.filterType);
    setContentType(route.contentType);
    setHistoryWindowDays(route.historyWindowDays);
    setSelectedFeedId(route.selectedFeedId);
    setSelectedCategory(route.selectedCategory);
    setSearchQuery(route.searchQuery);
    setSelectedArticleId(route.articleId);
    setActiveDetailTab(route.detailTab);
    setDetailOpenIntent(route.detailTab === "notes" ? { tab: "notes" } : undefined);
    setIsMobileMenuOpen(false);
  }, [currentRoute]);

  useEffect(() => {
    if (routeReady.current) return;
    routeReady.current = true;
    const handlePopState = () => {
      const route = parseReaderRoute(window.location);
      setIsSettingsOpen(route.activeTab === "settings");
      setActiveTab(route.activeTab === "settings" ? "feeds" : route.activeTab);
      setFilterType(route.filterType);
      setContentType(route.contentType);
      setHistoryWindowDays(route.historyWindowDays);
      setSelectedFeedId(route.selectedFeedId);
      setSelectedCategory(route.selectedCategory);
      setSearchQuery(route.searchQuery);
      setSelectedArticleId(route.articleId);
      setActiveDetailTab(route.detailTab);
      setDetailOpenIntent(route.detailTab === "notes" ? { tab: "notes" } : undefined);
      setIsMobileMenuOpen(false);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!routeReady.current || typeof window === "undefined") return;
    const url = buildReaderUrl(currentRoute());
    if (window.location.pathname + window.location.search !== url && lastPushedUrl.current !== url) {
      window.history.replaceState({}, "", url);
    }
    lastPushedUrl.current = null;
  }, [currentRoute]);

  useEffect(() => {
    if (activeTab !== "feeds") setFilterType("all");
    if (activeTab !== "search" && searchQuery) setSearchQuery("");
  }, [activeTab, searchQuery]);

  return {
    activeTab, setActiveTab,
    filterType, setFilterType,
    contentType, setContentType,
    selectedFeedId, setSelectedFeedId,
    selectedCategory, setSelectedCategory,
    selectedArticleId, setSelectedArticleId,
    searchQuery, setSearchQuery,
    historyWindowDays, setHistoryWindowDays,
    activeDetailTab, setActiveDetailTab,
    detailOpenIntent, setDetailOpenIntent,
    isSettingsOpen, setIsSettingsOpen,
    isMobileMenuOpen, setIsMobileMenuOpen,
    navigateToRoute,
  };
}
