import React from "react";
import { Article } from "../types";
import { Headphones, ListCheck } from "lucide-react";
import { resolveImageUrl } from "./ArticleList";
import { formatAudioTime } from "../hooks/useAudioPlayer";

export interface AudioPlayerModel {
  article: Article;
  isPlaying: boolean; currentTime: number; duration: number; playbackRate: number; audioPlayError: string | null;
  isInPlaylist: boolean; onTogglePlaylist?: (id: string) => void; togglePlay: () => void;
  onSeek: (seconds: number) => void; onRateChange: () => void; onRewind: () => void; onForward: () => void;
}

export function resolveDurationLabel(mediaDuration: number, declaredDuration?: string): string {
  if (mediaDuration > 0) return formatAudioTime(mediaDuration);
  if (!declaredDuration) return "--:--";
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(declaredDuration)) return declaredDuration;
  const seconds = Number(declaredDuration);
  return Number.isFinite(seconds) && seconds > 0 ? formatAudioTime(seconds) : "--:--";
}

export function AudioPlayerCard({ model: p }: { model: AudioPlayerModel }) {
  const { article } = p;
  const duration = resolveDurationLabel(p.duration, article.duration);
  const progress = p.duration > 0 ? Math.min(100, (p.currentTime / p.duration) * 100) : 0;
  return <section className="wreader-audio-card" aria-label="音频播放器">
    <div className="wreader-audio-cover" aria-hidden="true">
      {article.thumbnail ? <img src={resolveImageUrl(article.thumbnail)} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <Headphones />}
    </div>
    <div className="wreader-audio-body">
      <strong title={article.title}>{article.title}</strong>
      <div className="wreader-audio-progress-wrap">
        <div className="audio-progress player-track">
          <i style={{ width: `${progress}%` }} />
          <input type="range" min="0" max={p.duration || 100} value={p.currentTime} onChange={(event) => p.onSeek(Number(event.target.value))} aria-label="播放进度" />
        </div>
        <div className="player-times"><span>{formatAudioTime(p.currentTime)}</span><span>{duration}</span></div>
      </div>
    </div>
    <div className="audio-controls-compact">
      <button type="button" onClick={p.onRewind} title="后退 15 秒" aria-label="后退 15 秒" className="player-icon-btn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9c-2.52 0-4.93 1-6.74 2.74L3 8M3 3v5h5" /><path d="M9 12h6" /></svg></button>
      <button type="button" onClick={p.togglePlay} title={p.isPlaying ? "暂停" : "播放"} aria-label={p.isPlaying ? "暂停" : "播放"} className="player-toggle"><svg viewBox="0 0 24 24" aria-hidden="true">{p.isPlaying ? <><rect x="14" y="3" width="5" height="18" rx="1" /><rect x="5" y="3" width="5" height="18" rx="1" /></> : <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />}</svg></button>
      <button type="button" onClick={p.onForward} title="快进 30 秒" aria-label="快进 30 秒" className="player-icon-btn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93-1 6.74 2.74L21 8M21 3v5h-5" /><path d="M12 8v8M9 12h6" /></svg></button>
      <button type="button" onClick={p.onRateChange} title="调整播放速度" aria-label="调整播放速度" className="player-speed">{p.playbackRate}x</button>
      {p.onTogglePlaylist && <button type="button" onClick={() => p.onTogglePlaylist?.(article.id)} title={p.isInPlaylist ? "已在播放列表中（点击移除）" : "加入待播列表"} aria-label={p.isInPlaylist ? "已在播放列表中（点击移除）" : "加入待播列表"} className="player-icon-btn">{p.isInPlaylist ? <ListCheck /> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 5H3M11 12H3M16 19H3M18 9v6M21 12h-6" /></svg>}</button>}
    </div>
    {p.audioPlayError && <p className="wreader-audio-error" role="status">{p.audioPlayError}<a href={article.audioUrl} target="_blank" rel="noopener noreferrer">打开音频</a></p>}
  </section>;
}
