import React from "react";
import { Article } from "../types";
import { resolveArticlePresentation } from "../services/articlePresentation";
import { VirtualWindow } from "./VirtualWindow";

function TimelineIcon({ type }: { type: "mail" | "headphones" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {type === "mail" ? <><path d="M4 6.5h16v11H4z" /><path d="m4.5 7 7.5 6 7.5-6" /></> : <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />}
    </svg>
  );
}

interface ArticleListProps {
  articles: Article[];
  onSelectArticle: (article: Article) => void;
  onToggleStar: (articleId: string) => void;
  onToggleRead: (articleId: string) => void;
  onSummarizeAI: (article: Article) => void;
  playlistIds?: string[];
  onTogglePlaylist?: (articleId: string) => void;
  olderArticleCount?: number;
  historyWindowDays?: number;
  historyWindowStepDays?: number;
  onShowOlder?: () => void;
  onHideOlder?: () => void;
  selectedArticleId?: string | null;
}

function HistoryWindowControl({
  label,
  position,
  onClick,
}: {
  label: string;
  position: "top" | "bottom";
  onClick: () => void;
}) {
  return (
    <div className={`wreader-timeline-history-control is-${position}`}>
      <button type="button" onClick={onClick}>
        {label}
      </button>
    </div>
  );
}

export function resolveImageUrl(src?: string): string | undefined {
  if (!src) return undefined;
  if (src.startsWith("/api/proxy-image")) return src;
  if (!src.startsWith("http")) return src;
  return `/api/proxy-image?url=${encodeURIComponent(src)}`;
}

export function formatDurationMinutes(duration?: string): string | undefined {
  if (!duration) return undefined;
  const trimmed = duration.trim();
  if (!trimmed) return undefined;

  const seconds = /^\d+(?:\.\d+)?$/.test(trimmed)
    ? Number(trimmed)
    : trimmed.split(":").reduce((total, part) => {
      const value = Number(part);
      return Number.isFinite(value) ? total * 60 + value : NaN;
    }, 0);

  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return `${Math.max(1, Math.round(seconds / 60))} 分钟`;
}

export interface ArticleThumbnailProps {
  src?: string;
  feedTitle?: string;
  title?: string;
}

// Square thumbnail with light neutral fallback cover
export const ArticleThumbnail: React.FC<ArticleThumbnailProps> = ({
  src,
  feedTitle,
  title,
}) => {
  const [imageSrc, setImageSrc] = React.useState<string | undefined>(() => resolveImageUrl(src));
  const [imgError, setImgError] = React.useState(false);
  const [retryStage, setRetryStage] = React.useState(0);

  React.useEffect(() => {
    setImageSrc(resolveImageUrl(src));
    setImgError(false);
    setRetryStage(0);
  }, [src]);

  const handleImgError = () => {
    if (!src) {
      setImgError(true);
      return;
    }

    if (retryStage === 0) {
      // Stage 1: Try stripping @small or @suffix if present
      if (src.includes("@")) {
        const cleanSrc = src.replace(/@[^/]+$/, "");
        if (cleanSrc !== src) {
          setImageSrc(resolveImageUrl(cleanSrc));
          setRetryStage(1);
          return;
        }
      }
      // Stage 1b: Try raw unproxied URL
      setImageSrc(src);
      setRetryStage(2);
      return;
    }

    if (retryStage === 1) {
      // Stage 2: Try raw unproxied URL
      setImageSrc(src);
      setRetryStage(2);
      return;
    }

    // Stage 3: All failed -> display fallback cover
    setImgError(true);
  };

  const sizeClasses = "wreader-story-thumbnail h-12 w-12 shrink-0 rounded-md";

  if (!src || imgError || !imageSrc) {
    const titleText = feedTitle || title || "RSS";
    return (
      <div
        className={`${sizeClasses} wreader-story-thumbnail-fallback relative flex shrink-0 select-none items-center justify-center overflow-hidden`}
      >
        <span>{titleText}</span>
      </div>
    );
  }

  return (
    <div className={`${sizeClasses} overflow-hidden bg-slate-100 relative transition-shadow shrink-0`}>
      <img
        src={imageSrc}
        alt=""
        referrerPolicy="no-referrer"
        className="w-full h-full object-cover"
        onError={handleImgError}
      />
    </div>
  );
};

export function formatArticleRelativeTime(pubDate: string) {
  const date = new Date(pubDate);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60_000));
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} 天前`;
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export const ArticleList: React.FC<ArticleListProps> = ({
  articles,
  onSelectArticle,
  onToggleStar: _onToggleStar,
  onToggleRead: _onToggleRead,
  onSummarizeAI: _onSummarizeAI,
  playlistIds: _playlistIds = [],
  onTogglePlaylist: _onTogglePlaylist,
  olderArticleCount = 0,
  historyWindowDays = 30,
  historyWindowStepDays = 30,
  onShowOlder,
  onHideOlder,
  selectedArticleId,
}) => {
  const hasOlderArticles = olderArticleCount > 0;
  const isExpandedHistory = historyWindowDays > 30;
  const nextWindowDays = historyWindowDays + historyWindowStepDays;

  if (articles.length === 0) {
    return (
      <div className="wreader-timeline-empty flex flex-col items-center justify-center py-20 px-4 text-center text-slate-500">
        <div className="wreader-timeline-empty-icon">
          <TimelineIcon type="mail" />
        </div>
        {hasOlderArticles ? (
          <>
            <h3 className="text-lg font-semibold text-slate-800 mb-1">
              最近 30 天没有内容，还有 {olderArticleCount} 篇更早内容
            </h3>
            {onShowOlder && (
              <button
                type="button"
                onClick={onShowOlder}
                className="mt-3 wreader-btn wreader-btn-ghost"
              >
                查看最近 {nextWindowDays} 天
              </button>
            )}
          </>
        ) : (
          <>
            <h3 className="text-lg font-semibold text-slate-800 mb-1">未找到相关文章</h3>
            <p className="text-sm text-slate-500 max-w-sm">
              暂无符合条件的订阅文章。尝试点击右上角刷新图标，或切换筛选条件与订阅源。
            </p>
          </>
        )}
      </div>
    );
  }

  // MAGAZINE VIEW (单一视图)
  return (
    <div className="wreader-article-list px-2 py-2">
      {isExpandedHistory && onHideOlder && (
        <HistoryWindowControl
          label="收起至最近 30 天"
          position="top"
          onClick={onHideOlder}
        />
      )}
      <VirtualWindow
        count={articles.length}
        estimateSize={88}
        overscan={10}
        className="wreader-article-virtual-window"
        getItemKey={(index) => articles[index].id}
        renderItem={(index) => {
        const article = articles[index];
        const timeAgoStr = formatArticleRelativeTime(article.pubDate);
        const presentation = resolveArticlePresentation(article);
        const audioDurationLabel = presentation.capabilities.hasAudio
          ? formatDurationMinutes(article.duration)
          : undefined;

        return (
          <article
            data-article-id={article.id}
            onClick={() => onSelectArticle(article)}
            className={`wreader-story-row group flex cursor-pointer flex-row gap-2 rounded-lg p-2 transition-colors hover:bg-slate-100/70 ${
              selectedArticleId === article.id ? "is-selected bg-blue-50" : ""
            } ${
              article.read ? "is-read" : "bg-transparent"
            }`}
          >
            {/* Left Square Thumbnail */}
            <ArticleThumbnail
              src={article.thumbnail}
              feedTitle={article.feedTitle}
              title={article.title}
            />

            {/* Right Content */}
            <div className="flex min-w-0 flex-1 flex-col justify-between">
              <div>
                <div className="wreader-story-source-meta">{!article.read && <span className="wreader-unread-dot" aria-label="未读" />}<span>{article.feedTitle}</span></div>
                {/* Title */}
                <h2 className="line-clamp-2 text-[14px] font-bold leading-[1.3] text-slate-900">
                  <span>{article.title}</span>
                </h2>

                {/* Snippet */}
                <p className="mt-1 line-clamp-2 text-[12px] leading-[1.35] text-slate-500">
                  {article.snippet}
                </p>
              </div>

              <div className="wreader-story-time mt-1 flex min-h-4 items-center justify-between text-[11px] text-slate-400">
                {audioDurationLabel ? <span className="story-audio-meta"><TimelineIcon type="headphones" />{audioDurationLabel}</span> : <span />}
                <time>{timeAgoStr}</time>
              </div>
            </div>
          </article>
        );
      }} />
      {hasOlderArticles && onShowOlder && (
        <HistoryWindowControl
          label="继续加载 30 天"
          position="bottom"
          onClick={onShowOlder}
        />
      )}
    </div>
  );
};
