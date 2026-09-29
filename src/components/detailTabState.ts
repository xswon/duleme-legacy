import type {
  Article,
  ArticlePresentation,
  DetailTab,
  DetailTabPresentation,
} from "../types";
import { resolveArticlePresentation } from "../services/articlePresentation";

const DETAIL_TAB_ORDER: DetailTab[] = ["body", "overview", "transcript"];

const DETAIL_TAB_LABELS: Record<DetailTab, string> = {
  overview: "AI 摘要",
  body: "正文",
  digest: "深度精华",
  transcript: "逐字稿",
};

/**
 * The shared presentation model predates the detail tab naming. Keep the
 * translation at this boundary so the detail view has one stable contract:
 * body/show notes first, overview/content highlights second, then digest and transcript.
 */
export function normalizeDetailPresentation(
  presentation: ArticlePresentation
): ArticlePresentation {
  const tabsByKey = new Map<DetailTab, DetailTabPresentation>();

  for (const tab of presentation.tabs) {
    const key = tab.key;
    if (!tabsByKey.has(key)) {
      tabsByKey.set(key, {
        key,
        label: DETAIL_TAB_LABELS[key],
      });
    }
  }

  const tabs = DETAIL_TAB_ORDER
    .filter((key) => tabsByKey.has(key))
    .map((key) => tabsByKey.get(key)!);

  return {
    ...presentation,
    tabs,
    defaultTab: tabs[0]?.key || "body",
  };
}

/** Detail navigation always starts from capabilities derivable from stored data. */
export function resolveArticleDefaultTab(article: Article): DetailTab {
  return normalizeDetailPresentation(resolveArticlePresentation(article)).defaultTab;
}

export function resolveDetailTab(
  current: DetailTab,
  presentation: ArticlePresentation,
  resetForArticle: boolean
): DetailTab {
  const normalized = normalizeDetailPresentation(presentation);
  if (resetForArticle) return normalized.defaultTab;
  if (current === "digest" && normalized.tabs.some((tab) => tab.key === "overview")) {
    return "overview";
  }
  return normalized.tabs.some((tab) => tab.key === current)
    ? current
    : normalized.defaultTab;
}

export { DETAIL_TAB_ORDER };
