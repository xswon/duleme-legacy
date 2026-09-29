import React, { useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Article, AudioProgress } from "../types";
import type { SharedAudioPlayer } from "../hooks/useAudioPlayer";
import { formatArticleRelativeTime, resolveImageUrl } from "./ArticleList";

interface PlaylistViewProps {
  articles: Article[];
  audioProgressMap: Record<string, AudioProgress>;
  onSelectArticle: (article: Article) => void;
  onRemoveFromPlaylist: (articleId: string) => void;
  onClearPlaylist: () => void;
  onNavigateFeeds: () => void;
  onReorder?: (orderedArticleIds: string[]) => void;
  onRemoveMany?: (articleIds: string[]) => void;
  isLoading?: boolean;
  audioPlayer?: SharedAudioPlayer;
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function formatTime(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "00:00";
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function remainingLabel(progress?: AudioProgress): string {
  if (!progress?.duration) return "尚未开始";
  const remaining = Math.max(0, progress.duration - progress.currentTime);
  return remaining <= 2 ? "已播放完" : `剩余 ${formatTime(remaining)}`;
}

function PlayerIcon({ type }: { type: "previous" | "next" | "play" | "pause" | "trash" }) {
  const paths = {
    previous: <path d="M6 5v14M18 6l-9 6 9 6Z" />,
    next: <path d="M18 5v14M6 6l9 6-9 6Z" />,
    play: <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />,
    pause: <><rect x="14" y="3" width="5" height="18" rx="1" /><rect x="5" y="3" width="5" height="18" rx="1" /></>,
    trash: <path d="M10 11v6M14 11v6M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />,
  }[type];
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths}</svg>;
}

export const PlaylistView: React.FC<PlaylistViewProps> = ({
  articles,
  audioProgressMap,
  onSelectArticle,
  onRemoveFromPlaylist,
  onReorder,
  isLoading = false,
  audioPlayer,
}) => {
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const activeId = (audioPlayer?.articleId && articles.some((article) => article.id === audioPlayer.articleId))
    ? audioPlayer.articleId
    : articles[0]?.id ?? null;
  const activeArticle = useMemo(() => articles.find((article) => article.id === activeId) ?? articles[0], [activeId, articles]);
  const isControllerActive = Boolean(activeArticle && audioPlayer?.articleId === activeArticle.id);
  const playing = isControllerActive && Boolean(audioPlayer?.isPlaying);
  const activeProgress = activeArticle ? audioProgressMap[activeArticle.id] : undefined;
  const shownDuration = isControllerActive ? audioPlayer?.duration || activeProgress?.duration || 0 : activeProgress?.duration || 0;
  const shownTime = isControllerActive ? audioPlayer?.currentTime || 0 : activeProgress?.currentTime || 0;
  const progressPercent = shownDuration > 0 ? Math.min(100, Math.max(0, (shownTime / shownDuration) * 100)) : 0;

  const togglePlayback = (article: Article) => {
    if (!article.audioUrl) return;
    audioPlayer?.toggleArticle(article.id, article.audioUrl, audioProgressMap[article.id]);
  };

  const moveActive = (offset: number) => {
    if (!activeArticle || articles.length === 0) return;
    const index = articles.findIndex((article) => article.id === activeArticle.id);
    const next = articles[(index + offset + articles.length) % articles.length];
    if (next.audioUrl) audioPlayer?.playArticle(next.id, next.audioUrl, audioProgressMap[next.id]);
  };

  const seekToTime = (next: number) => {
    if (!audioPlayer || !activeArticle?.audioUrl || !shownDuration) return;
    const bounded = Math.max(0, Math.min(shownDuration, next));
    if (isControllerActive) audioPlayer.seekTo(bounded);
    else audioPlayer.loadArticle(activeArticle.id, activeArticle.audioUrl, { currentTime: bounded, duration: shownDuration });
  };

  const seek = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!shownDuration) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const next = Math.max(0, Math.min(shownDuration, ((event.clientX - bounds.left) / bounds.width) * shownDuration));
    seekToTime(next);
  };

  const handleSeekKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!shownDuration) return;
    const next = event.key === "Home" ? 0
      : event.key === "End" ? shownDuration
        : event.key === "ArrowLeft" ? shownTime - 5
          : event.key === "ArrowRight" ? shownTime + 5
            : null;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    seekToTime(next);
  };

  if (isLoading) {
    return <div className="wreader-playlist-loading" role="status"><LoaderCircle /><strong>正在加载音频</strong><span>正在恢复你的播放进度…</span></div>;
  }

  return (
    <div className="wreader-tool-view wreader-playlist-view animate-fadeIn">
      <section className={`playlist-player ${activeArticle ? "" : "is-empty"}`} aria-label="播放控制器">
        <div className="playlist-player-main">
          <div className="playlist-player-cover">{activeArticle && resolveImageUrl(activeArticle.thumbnail) ? <img src={resolveImageUrl(activeArticle.thumbnail)} alt="" /> : <span>{activeArticle?.feedTitle || "待播清单"}</span>}</div>
          <div className="playlist-player-body">
            <div className="playlist-player-copy"><strong>{activeArticle?.title || "播放列表为空"}</strong>{activeArticle && <span>{activeArticle.feedTitle}</span>}</div>
            <div className="playlist-timeline">
              <div className="playlist-progress player-track" role="slider" aria-label="播放进度" aria-valuemin={0} aria-valuemax={Math.round(shownDuration)} aria-valuenow={Math.round(shownTime)} aria-valuetext={`${formatTime(shownTime)} / ${formatTime(shownDuration)}`} tabIndex={activeArticle ? 0 : -1} onClick={seek} onKeyDown={handleSeekKeyDown}><i style={{ width: `${progressPercent}%` }} /></div>
              <div className="playlist-times player-times"><span>{formatTime(shownTime)}</span><span>{formatTime(shownDuration)}</span></div>
            </div>
          </div>
          <div className="playlist-controls">
            <div className="playlist-primary-controls">
              <button type="button" className="player-icon-btn" onClick={() => moveActive(-1)} aria-label="上一条" title="上一条"><PlayerIcon type="previous" /></button>
              <button type="button" className="playlist-play player-toggle" disabled={!activeArticle} onClick={() => activeArticle && togglePlayback(activeArticle)} aria-label={playing ? "暂停" : "播放"} title={playing ? "暂停" : "播放"}>{playing ? <PlayerIcon type="pause" /> : <PlayerIcon type="play" />}</button>
              <button type="button" className="player-icon-btn" onClick={() => moveActive(1)} aria-label="下一条" title="下一条"><PlayerIcon type="next" /></button>
            </div>
            <button type="button" className="playlist-speed player-speed" onClick={() => audioPlayer?.cyclePlaybackRate()} aria-label="调整播放速度" title="调整播放速度">{audioPlayer?.playbackRate || 1}x</button>
          </div>
        </div>
        {isControllerActive && audioPlayer?.audioPlayError && <p className="playlist-player-error" role="status">{audioPlayer.audioPlayError}</p>}
      </section>

      <div className="playlist-list">
        {articles.length === 0 ? <div className="playlist-empty"><strong>播放列表为空</strong><span>在音频文章中选择“加入播放列表”即可添加。</span></div> : articles.map((article) => {
          const progress = audioProgressMap[article.id];
          const isActive = activeArticle?.id === article.id;
          const coverUrl = resolveImageUrl(article.thumbnail);
          return (
            <article key={article.id} draggable={Boolean(onReorder)} onDragStart={(event) => { setDraggedId(article.id); event.dataTransfer.setData("text/plain", article.id); }} onDragOver={(event) => { if (draggedId && draggedId !== article.id) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); const fromId = draggedId || event.dataTransfer.getData("text/plain"); const from = articles.findIndex((item) => item.id === fromId); const to = articles.findIndex((item) => item.id === article.id); if (onReorder && from >= 0 && to >= 0) onReorder(moveItem<Article>(articles, from, to).map((item) => item.id)); setDraggedId(null); }} onDragEnd={() => setDraggedId(null)} className={`playlist-row ${isActive ? "is-active" : ""} ${draggedId === article.id ? "is-dragging" : ""}`}>
              <button type="button" className="playlist-open" onClick={() => onSelectArticle(article)} title={`查看文章：${article.title}`}>
                <span className="playlist-thumb">{coverUrl ? <img src={coverUrl} alt="" /> : <span>{article.feedTitle.slice(0, 2)}</span>}</span>
                <span className="playlist-item-copy"><strong>{article.title} <span>｜{article.feedTitle}</span></strong><small>{remainingLabel(progress)} · {formatArticleRelativeTime(article.pubDate)}</small></span>
              </button>
              <button type="button" className="playlist-row-play" onClick={() => togglePlayback(article)} aria-label={`${isActive && playing ? "暂停" : "播放"} ${article.title}`} title={`${isActive && playing ? "暂停" : "播放"} ${article.title}`}>{isActive && playing ? <PlayerIcon type="pause" /> : <PlayerIcon type="play" />}</button>
              <button type="button" className="playlist-remove" onClick={() => onRemoveFromPlaylist(article.id)} aria-label={`从播放列表删除 ${article.title}`} title="从播放列表删除"><PlayerIcon type="trash" /></button>
            </article>
          );
        })}
      </div>
    </div>
  );
};
