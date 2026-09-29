import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export function resolveAudioUrl(src?: string): string | undefined {
  if (!src) return undefined;
  if (src.startsWith("/api/proxy-audio")) return src;
  if (src.startsWith("http://") || src.includes("xyzcdn.net") || src.includes("xiaoyuzhoufm.com") || src.includes("ximalaya.com")) {
    return `/api/proxy-audio?url=${encodeURIComponent(src)}`;
  }
  return src;
}

export function formatAudioTime(sec: number) {
  if (isNaN(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2];
const NORMAL_PROGRESS_PERSIST_INTERVAL_MS = 20_000;

export interface SharedAudioPlayer {
  audioRef: RefObject<HTMLAudioElement | null>;
  articleId: string | null;
  audioSrc?: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  audioPlayError: string | null;
  loadArticle: (articleId: string, audioUrl: string, savedProgress?: { currentTime: number; duration: number }) => void;
  playArticle: (articleId: string, audioUrl: string, savedProgress?: { currentTime: number; duration: number }) => void;
  toggleArticle: (articleId: string, audioUrl: string, savedProgress?: { currentTime: number; duration: number }) => void;
  stop: () => void;
  seekTo: (seconds: number) => void;
  cyclePlaybackRate: () => void;
  rewind: () => void;
  forward: () => void;
  handleAudioError: () => void;
  handlePlay: () => void;
  handlePause: () => void;
  handleLoadedMetadata: () => void;
  handleTimeUpdate: () => void;
  handleEnded: () => void;
  migrateArticleId: (articleIdMap: Map<string, string>) => void;
}

/**
 * Owns the application's only media element. Every player surface is a
 * controller for this hook instead of mounting its own <audio> element.
 */
export function useSharedAudioPlayer(
  onUpdateAudioProgress?: (id: string, currentTime: number, duration: number) => void,
  onEnded?: (id: string) => void,
): SharedAudioPlayer {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingAutoplayRef = useRef(false);
  const restoreTimeRef = useRef(0);
  const activeArticleIdRef = useRef<string | null>(null);
  const loadedAudioRef = useRef<{ articleId: string | null; src?: string }>({ articleId: null });
  const progressRef = useRef<{ articleId: string | null; currentTime: number; duration: number }>({ articleId: null, currentTime: 0, duration: 0 });
  const lastPersistedRef = useRef<{ articleId: string | null; currentTime: number }>({ articleId: null, currentTime: 0 });
  const lastProgressPersistedAtRef = useRef(0);
  const progressCallbackRef = useRef(onUpdateAudioProgress);
  const [articleId, setArticleId] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | undefined>();
  const [audioSrc, setAudioSrc] = useState<string | undefined>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [audioPlayError, setAudioPlayError] = useState<string | null>(null);
  progressCallbackRef.current = onUpdateAudioProgress;

  const flushProgress = useCallback((force = false) => {
    const progress = progressRef.current;
    if (!progress.articleId || progress.duration <= 0) return;
    const previous = lastPersistedRef.current;
    const delta = Math.abs(progress.currentTime - previous.currentTime);
    if (previous.articleId === progress.articleId && delta < 0.01) return;
    if (!force && previous.articleId === progress.articleId && Date.now() - lastProgressPersistedAtRef.current < NORMAL_PROGRESS_PERSIST_INTERVAL_MS) return;
    progressCallbackRef.current?.(progress.articleId, progress.currentTime, progress.duration);
    lastPersistedRef.current = { articleId: progress.articleId, currentTime: progress.currentTime };
    lastProgressPersistedAtRef.current = Date.now();
  }, []);

  const pauseCurrentAudio = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const startPlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    setAudioPlayError(null);
    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      if (originalUrl && /^https?:\/\//i.test(originalUrl) && !audioSrc?.includes("/api/proxy-audio")) {
        const proxy = `/api/proxy-audio?url=${encodeURIComponent(originalUrl)}`;
        setAudioSrc(proxy);
        audio.src = proxy;
        audio.load();
        try {
          await audio.play();
          setIsPlaying(true);
          return;
        } catch { /* show the common error below */ }
      }
      setIsPlaying(false);
      setAudioPlayError("音频文件播放遇到阻碍，可尝试在新标签页打开。");
    }
  }, [audioSrc, originalUrl]);

  const activateArticle = useCallback((
    nextArticleId: string,
    nextAudioUrl: string,
    savedProgress: { currentTime: number; duration: number } | undefined,
    autoplay: boolean,
  ) => {
    const audio = audioRef.current;
    if (activeArticleIdRef.current === nextArticleId) {
      if (autoplay && !isPlaying) void startPlayback();
      return;
    }
    flushProgress(true);
    audio?.pause();
    setIsPlaying(false);
    setAudioPlayError(null);
    activeArticleIdRef.current = nextArticleId;
    setArticleId(nextArticleId);
    setOriginalUrl(nextAudioUrl);
    setAudioSrc(resolveAudioUrl(nextAudioUrl));
    restoreTimeRef.current = savedProgress?.currentTime || 0;
    setCurrentTime(savedProgress?.currentTime || 0);
    setDuration(savedProgress?.duration || 0);
    progressRef.current = { articleId: nextArticleId, currentTime: savedProgress?.currentTime || 0, duration: savedProgress?.duration || 0 };
    lastPersistedRef.current = { articleId: nextArticleId, currentTime: savedProgress?.currentTime || 0 };
    lastProgressPersistedAtRef.current = Date.now();
    pendingAutoplayRef.current = autoplay;
  }, [flushProgress, isPlaying, startPlayback]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !articleId || !audioSrc) return;
    if (loadedAudioRef.current.articleId === articleId && loadedAudioRef.current.src === audioSrc) return;
    loadedAudioRef.current = { articleId, src: audioSrc };
    audio.src = audioSrc;
    audio.load();
    if (restoreTimeRef.current > 0) {
      try {
        audio.currentTime = restoreTimeRef.current;
      } catch {
        // Some engines only accept a restored position after metadata arrives.
      }
    }
    if (pendingAutoplayRef.current) {
      pendingAutoplayRef.current = false;
      void startPlayback();
    }
  }, [articleId, audioSrc, startPlayback]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);
  useEffect(() => {
    const flushWhenHidden = () => flushProgress(true);
    const flushOnVisibilityChange = () => { if (document.visibilityState === "hidden") flushProgress(true); };
    window.addEventListener("pagehide", flushWhenHidden);
    document.addEventListener("visibilitychange", flushOnVisibilityChange);
    return () => {
      flushProgress(true);
      pauseCurrentAudio();
      window.removeEventListener("pagehide", flushWhenHidden);
      document.removeEventListener("visibilitychange", flushOnVisibilityChange);
    };
  }, [flushProgress, pauseCurrentAudio]);

  const playArticle = useCallback((id: string, url: string, progress?: { currentTime: number; duration: number }) => {
    activateArticle(id, url, progress, true);
  }, [activateArticle]);
  const loadArticle = useCallback((id: string, url: string, progress?: { currentTime: number; duration: number }) => {
    activateArticle(id, url, progress, false);
  }, [activateArticle]);
  const toggleArticle = useCallback((id: string, url: string, progress?: { currentTime: number; duration: number }) => {
    if (activeArticleIdRef.current !== id) {
      activateArticle(id, url, progress, true);
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      void startPlayback();
    }
  }, [activateArticle, isPlaying, startPlayback]);
  const stop = useCallback(() => {
    flushProgress(true);
    audioRef.current?.pause();
    if (audioRef.current) {
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }
    pendingAutoplayRef.current = false;
    restoreTimeRef.current = 0;
    activeArticleIdRef.current = null;
    loadedAudioRef.current = { articleId: null };
    progressRef.current = { articleId: null, currentTime: 0, duration: 0 };
    lastPersistedRef.current = { articleId: null, currentTime: 0 };
    lastProgressPersistedAtRef.current = 0;
    setArticleId(null);
    setOriginalUrl(undefined);
    setAudioSrc(undefined);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAudioPlayError(null);
  }, [flushProgress]);
  const migrateArticleId = useCallback((articleIdMap: Map<string, string>) => {
    const currentArticleId = activeArticleIdRef.current;
    if (!currentArticleId) return;
    const nextArticleId = articleIdMap.get(currentArticleId);
    if (!nextArticleId || nextArticleId === currentArticleId) return;
    activeArticleIdRef.current = nextArticleId;
    progressRef.current = { ...progressRef.current, articleId: nextArticleId };
    lastPersistedRef.current = { articleId: nextArticleId, currentTime: lastPersistedRef.current.currentTime };
    if (loadedAudioRef.current.articleId === currentArticleId) {
      loadedAudioRef.current = { ...loadedAudioRef.current, articleId: nextArticleId };
    }
    setArticleId(nextArticleId);
  }, []);
  const seekTo = useCallback((seconds: number) => {
    const value = Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, seconds));
    setCurrentTime(value);
    if (audioRef.current) audioRef.current.currentTime = value;
    progressRef.current = { articleId: activeArticleIdRef.current, currentTime: value, duration };
    flushProgress(true);
  }, [duration, flushProgress]);
  const cyclePlaybackRate = useCallback(() => {
    setPlaybackRate((rate) => PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(rate) + 1) % PLAYBACK_RATES.length]);
  }, []);
  const rewind = useCallback(() => seekTo(currentTime - 30), [currentTime, seekTo]);
  const forward = useCallback(() => seekTo(currentTime + 30), [currentTime, seekTo]);
  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
    setDuration(nextDuration);
    progressRef.current = { ...progressRef.current, duration: nextDuration };
    if (restoreTimeRef.current > 0) {
      audio.currentTime = Math.min(restoreTimeRef.current, nextDuration || restoreTimeRef.current);
      setCurrentTime(audio.currentTime);
    }
  }, []);
  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    const currentArticleId = activeArticleIdRef.current;
    if (!audio || !currentArticleId) return;
    const nextDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
    setCurrentTime(audio.currentTime);
    setDuration(nextDuration);
    progressRef.current = { articleId: currentArticleId, currentTime: audio.currentTime, duration: nextDuration };
    flushProgress(false);
  }, [flushProgress]);
  const handleEnded = useCallback(() => {
    flushProgress(true);
    setIsPlaying(false);
    const currentArticleId = activeArticleIdRef.current;
    if (currentArticleId) onEnded?.(currentArticleId);
  }, [flushProgress, onEnded]);
  const handleAudioError = useCallback(() => {
    if (originalUrl && /^https?:\/\//i.test(originalUrl) && !audioSrc?.includes("/api/proxy-audio")) {
      setAudioSrc(`/api/proxy-audio?url=${encodeURIComponent(originalUrl)}`);
    } else {
      setIsPlaying(false);
      setAudioPlayError("音频源暂时无法载入，建议在浏览器原网页中打开。");
    }
  }, [audioSrc, originalUrl]);
  const handlePlay = useCallback(() => setIsPlaying(true), []);
  const handlePause = useCallback(() => { setIsPlaying(false); flushProgress(true); }, [flushProgress]);

  return {
    audioRef, articleId, audioSrc, isPlaying, currentTime, duration, playbackRate, audioPlayError,
    loadArticle, playArticle, toggleArticle, stop, seekTo, cyclePlaybackRate, rewind, forward,
    handleAudioError, handlePlay, handlePause, handleLoadedMetadata, handleTimeUpdate, handleEnded, migrateArticleId,
  };
}
