import type { ActiveTab, DetailTab, FilterType } from "../types";

export type ReaderScope = "today" | "unread" | "starred" | "feed" | "folder";
export type TimelineContentFilter = "all" | "article" | "podcast";

export const DEFAULT_ROUTE_HISTORY_DAYS = 30;

export interface ReaderRoute {
  path: string;
  activeTab: ActiveTab;
  filterType: FilterType;
  selectedFeedId: string | null;
  selectedCategory: string | null;
  searchQuery: string;
  articleId: string | null;
  detailTab?: DetailTab | "notes";
  contentType: TimelineContentFilter;
  historyWindowDays: number;
}

const DETAIL_TABS = new Set<DetailTab | "notes">(["body", "overview", "digest", "transcript", "notes"]);

function cleanId(value: string | null): string | null {
  return value && value.trim() ? value : null;
}

function parseHistoryWindowDays(value: string | null): number {
  const days = Number(value);
  return Number.isInteger(days) && days >= DEFAULT_ROUTE_HISTORY_DAYS && days % DEFAULT_ROUTE_HISTORY_DAYS === 0
    ? days
    : DEFAULT_ROUTE_HISTORY_DAYS;
}

export function parseReaderRoute(location: Pick<Location, "pathname" | "search">): ReaderRoute {
  const parts = location.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  const query = new URLSearchParams(location.search);
  const articleId = cleanId(query.get("article"));
  const requestedTab = query.get("tab");
  const detailTab = requestedTab && DETAIL_TABS.has(requestedTab as DetailTab | "notes")
    ? requestedTab as DetailTab | "notes"
    : undefined;
  const base: ReaderRoute = {
    path: location.pathname,
    activeTab: "feeds",
    filterType: query.get("unread") === "1" ? "unread" : "all",
    selectedFeedId: null,
    selectedCategory: null,
    searchQuery: "",
    articleId,
    detailTab,
    contentType: query.get("type") === "article" || query.get("type") === "podcast" ? query.get("type") as TimelineContentFilter : "all",
    historyWindowDays: parseHistoryWindowDays(query.get("days")),
  };

  const [segment, id] = parts;
  if (segment === "unread") return { ...base, filterType: "unread" };
  if (segment === "starred") return { ...base, filterType: "starred" };
  if (segment === "feed" && id) return { ...base, selectedFeedId: id };
  if (segment === "folder" && id) return { ...base, selectedCategory: id };
  if (segment === "playlist") return { ...base, activeTab: "playlist" };
  if (segment === "notes") return { ...base, activeTab: "notes" };
  if (segment === "settings") return { ...base, activeTab: "settings" };
  if (segment === "search") return { ...base, activeTab: "search", searchQuery: query.get("q") || "" };
  return base;
}

type SerializableReaderRoute = Pick<ReaderRoute, "activeTab" | "filterType" | "selectedFeedId" | "selectedCategory" | "searchQuery" | "articleId" | "detailTab">
  & Partial<Pick<ReaderRoute, "contentType" | "historyWindowDays">>;

export function buildReaderUrl(route: SerializableReaderRoute): string {
  let pathname = "/today";
  if (route.activeTab === "playlist") pathname = "/playlist";
  else if (route.activeTab === "notes") pathname = "/notes";
  else if (route.activeTab === "settings") pathname = "/settings";
  else if (route.activeTab === "search") pathname = "/search";
  else if (route.selectedFeedId) pathname = `/feed/${encodeURIComponent(route.selectedFeedId)}`;
  else if (route.selectedCategory) pathname = `/folder/${encodeURIComponent(route.selectedCategory)}`;
  else if (route.filterType === "starred") pathname = "/starred";

  const query = new URLSearchParams();
  if (route.activeTab === "search" && route.searchQuery.trim()) query.set("q", route.searchQuery.trim());
  if (route.activeTab === "feeds" && route.filterType === "unread") query.set("unread", "1");
  if (route.activeTab === "feeds" && route.filterType !== "starred" && route.contentType && route.contentType !== "all") query.set("type", route.contentType);
  if (route.activeTab === "feeds" && route.filterType !== "starred" && route.historyWindowDays && route.historyWindowDays !== DEFAULT_ROUTE_HISTORY_DAYS) query.set("days", String(route.historyWindowDays));
  if (route.articleId) query.set("article", route.articleId);
  if (route.detailTab) query.set("tab", route.detailTab);
  const search = query.toString();
  return `${pathname}${search ? `?${search}` : ""}`;
}

export function routeFromState(state: Omit<ReaderRoute, "path">): ReaderRoute {
  return { path: buildReaderUrl(state), ...state };
}
