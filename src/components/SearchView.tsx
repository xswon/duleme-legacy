import React, { useEffect, useRef } from "react";
import { FileText, Search as SearchIcon, X } from "lucide-react";
import { Article, Feed } from "../types";
import { getHighlightSegments, getPreparedSearchDocument, type SearchResult } from "../services/searchService";
import { VirtualWindow } from "./VirtualWindow";

export interface SearchViewProps {
  results: SearchResult[];
  feeds: Feed[];
  searchQuery: string;
  resultQuery?: string;
  setSearchQuery: (q: string) => void;
  onSelectArticle: (article: Article) => void;
  onToggleStar: (articleId: string) => void;
  onToggleRead: (articleId: string) => void;
  onSummarizeAI: (article: Article) => void;
  onResolveThumbnail?: (articleId: string, url: string) => void;
  selectedArticleId?: string | null;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  return <>{getHighlightSegments(text, query).map((segment, index) => segment.highlighted ? (
    <mark key={`${segment.text}-${index}`}>{segment.text}</mark>
  ) : <React.Fragment key={`${segment.text}-${index}`}>{segment.text}</React.Fragment>)}</>;
}

function formatRelativeTime(pubDate: string) {
  const date = new Date(pubDate);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

export const SearchView: React.FC<SearchViewProps> = ({
  results,
  searchQuery,
  resultQuery = searchQuery,
  setSearchQuery,
  onSelectArticle,
  selectedArticleId,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <div className="wreader-tool-view wreader-search-view min-h-full">
      <header className="wreader-search-heading">
        <span>工具</span>
        <h2>搜索</h2>
        <p>在全部订阅源中查找文章。</p>
      </header>

      <label className="wreader-search-box">
        <SearchIcon aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          autoFocus
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="搜索文章、订阅源或关键词"
          aria-label="全文搜索"
          aria-keyshortcuts="Control+K Meta+K"
        />
        {searchQuery ? (
          <button type="button" onClick={() => setSearchQuery("")} title="清空搜索词" aria-label="清空搜索词"><X /></button>
        ) : <kbd>⌘K</kbd>}
      </label>

      <div className="wreader-search-results" aria-live="polite">
        {results.length > 0 ? <VirtualWindow
          count={results.length}
          estimateSize={66}
          gap={4}
          overscan={10}
          className="wreader-search-virtual-window"
          getItemKey={(index) => results[index].article.id}
          renderItem={(index) => {
          const article = results[index].article;
          const fields = getPreparedSearchDocument(article).fields;
          return (
          <button
            type="button"
            key={article.id}
            className={`wreader-search-result${selectedArticleId === article.id ? " is-selected" : ""}`}
            onClick={() => onSelectArticle(article)}
          >
            <span className="wreader-search-result-icon"><FileText /></span>
            <span className="wreader-search-result-copy">
              <strong><HighlightedText text={fields.title} query={resultQuery} /></strong>
              <small>
                <HighlightedText text={fields.source} query={resultQuery} />
                {article.author && article.author !== article.feedTitle ? <> · <HighlightedText text={fields.author} query={resultQuery} /></> : null}
              </small>
            </span>
            <time dateTime={article.pubDate}>{formatRelativeTime(article.pubDate)}</time>
          </button>
          );
        }} /> : (
          <div className="wreader-search-empty">
            <SearchIcon />
            <strong>{searchQuery.trim() ? "未找到匹配文章" : "暂无可显示文章"}</strong>
            <span>{searchQuery.trim() ? "尝试更换关键词。" : "输入关键词即可搜索全部订阅源。"}</span>
          </div>
        )}
      </div>
    </div>
  );
};
