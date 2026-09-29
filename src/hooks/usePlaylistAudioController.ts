import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { ArticleLookup } from "../services/articleIndex";
import { derivePlayablePlaylist } from "../services/articleIndex";
import { redirectAudioProgressWrites, saveAudioProgressToDB } from "../services/dbService";
import type { AudioProgress } from "../types";
import { useSharedAudioPlayer, type SharedAudioPlayer } from "./useAudioPlayer";
import { useLatestRef } from "./useLatestRef";

interface UsePlaylistAudioControllerOptions {
  articleLookup: ArticleLookup;
  selectedArticleId: string | null;
  setSelectedArticleId: Dispatch<SetStateAction<string | null>>;
  showToast: (message: string) => void;
  showToastWithAction: (message: string, action: { label: string; run: () => void }) => void;
}

function readLegacyPlaylist(): string[] {
  try {
    const stored = localStorage.getItem("wreader_playlist");
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function readLegacyAudioProgress(): Record<string, AudioProgress> {
  try {
    const stored = localStorage.getItem("wreader_audio_progress");
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function usePlaylistAudioController({
  articleLookup,
  selectedArticleId,
  setSelectedArticleId,
  showToast,
  showToastWithAction,
}: UsePlaylistAudioControllerOptions) {
  const [playlistIds, setPlaylistIds] = useState<string[]>(readLegacyPlaylist);
  const [audioProgressMap, setAudioProgressMap] = useState<Record<string, AudioProgress>>(readLegacyAudioProgress);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const playlistIdsRef = useLatestRef(playlistIds);
  const audioProgressMapRef = useLatestRef(audioProgressMap);
  const playlistUndoRef = useRef<string[] | null>(null);
  const playlistUndoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoPlayNextRef = useRef<string | null>(null);
  const audioPlayerRef = useRef<SharedAudioPlayer | null>(null);

  const playablePlaylist = useMemo(
    () => derivePlayablePlaylist(playlistIds, articleLookup),
    [articleLookup, playlistIds],
  );
  const playablePlaylistIds = playablePlaylist.ids;

  const updateAudioProgress = useCallback((articleId: string, currentTime: number, duration: number) => {
    const existing = audioProgressMapRef.current[articleId];
    if (existing && Math.abs(existing.currentTime - currentTime) < 1 && existing.duration === duration) return;
    const progress = { currentTime, duration, updatedAt: Math.max(Date.now(), (existing?.updatedAt || 0) + 1) };
    const nextProgressMap = { ...audioProgressMapRef.current, [articleId]: progress };
    audioProgressMapRef.current = nextProgressMap;
    setAudioProgressMap(nextProgressMap);
    void saveAudioProgressToDB({ articleId, ...progress })
      .catch((error) => showToast(`播放进度保存失败：${error instanceof Error ? error.message : "请重试"}`));
  }, [audioProgressMapRef, showToast]);

  const handleAudioEnded = useCallback((articleId: string) => {
    const currentIndex = playablePlaylistIds.indexOf(articleId);
    const nextId = currentIndex >= 0 ? playablePlaylistIds[currentIndex + 1] : undefined;
    if (!nextId) {
      showToast("本集播放完毕，已到播放列表末尾");
      return;
    }
    if (!articleLookup.byId.has(nextId)) return;
    autoPlayNextRef.current = nextId;
    setSelectedArticleId(nextId);
  }, [articleLookup, playablePlaylistIds, setSelectedArticleId, showToast]);

  const audioPlayer = useSharedAudioPlayer(updateAudioProgress, handleAudioEnded);
  audioPlayerRef.current = audioPlayer;

  const selectAfterRemoval = useCallback((articleId: string, removedIds = new Set([articleId])) => {
    if (audioPlayerRef.current?.articleId !== articleId && selectedArticleId !== articleId) return;
    const currentIndex = playablePlaylistIds.indexOf(articleId);
    const nextId = removedIds.size === 1 && currentIndex >= 0
      ? playablePlaylistIds[currentIndex + 1] ?? playablePlaylistIds[currentIndex - 1]
      : playablePlaylistIds.find((id) => !removedIds.has(id));
    const nextArticle = nextId ? articleLookup.byId.get(nextId) : undefined;
    if (audioPlayerRef.current?.articleId === articleId) {
      audioPlayerRef.current.stop();
      if (nextArticle?.audioUrl) audioPlayerRef.current.loadArticle(nextArticle.id, nextArticle.audioUrl, audioProgressMapRef.current[nextArticle.id]);
    }
    autoPlayNextRef.current = null;
    setSelectedArticleId(nextId || null);
  }, [articleLookup, audioProgressMapRef, playablePlaylistIds, selectedArticleId, setSelectedArticleId]);

  const togglePlaylist = useCallback((articleId: string) => {
    const removing = playlistIds.includes(articleId);
    setPlaylistIds((current) => removing ? current.filter((id) => id !== articleId) : [...current, articleId]);
    showToast(removing ? "已从播放列表中移除" : "已加入音频播放列表");
    if (removing) selectAfterRemoval(articleId);
  }, [playlistIds, selectAfterRemoval, showToast]);

  const removeFromPlaylist = useCallback((articleId: string) => {
    setPlaylistIds((current) => current.filter((id) => id !== articleId));
    selectAfterRemoval(articleId);
    showToast("已从播放列表中移除");
  }, [selectAfterRemoval, showToast]);

  const undoClear = useCallback(() => {
    if (!playlistUndoRef.current) return;
    setPlaylistIds(playlistUndoRef.current);
    playlistUndoRef.current = null;
    if (playlistUndoTimer.current) clearTimeout(playlistUndoTimer.current);
    showToast("已恢复播放列表");
  }, [showToast]);

  const removeMany = useCallback((articleIds: string[]) => {
    if (articleIds.length === 0) return;
    const ids = new Set(articleIds);
    playlistUndoRef.current = playlistIds;
    if (playlistUndoTimer.current) clearTimeout(playlistUndoTimer.current);
    setPlaylistIds((current) => current.filter((id) => !ids.has(id)));
    const currentAudioId = audioPlayerRef.current?.articleId;
    if (currentAudioId && ids.has(currentAudioId)) selectAfterRemoval(currentAudioId, ids);
    showToastWithAction(`已从播放列表移除 ${articleIds.length} 集`, { label: "撤销", run: undoClear });
    playlistUndoTimer.current = setTimeout(() => { playlistUndoRef.current = null; }, 5000);
  }, [playlistIds, selectAfterRemoval, showToastWithAction, undoClear]);

  const clear = useCallback(() => {
    if (playlistIds.length === 0) return;
    playlistUndoRef.current = playlistIds;
    if (playlistUndoTimer.current) clearTimeout(playlistUndoTimer.current);
    setPlaylistIds([]);
    if (audioPlayerRef.current?.articleId && playlistIds.includes(audioPlayerRef.current.articleId)) {
      audioPlayerRef.current.stop();
      setSelectedArticleId(null);
    }
    showToastWithAction(`已清空播放列表（${playlistIds.length} 集）`, { label: "撤销", run: undoClear });
    playlistUndoTimer.current = setTimeout(() => { playlistUndoRef.current = null; }, 5000);
  }, [playlistIds, setSelectedArticleId, showToastWithAction, undoClear]);

  const reorder = useCallback((nextIds: string[]) => {
    setPlaylistIds((current) => {
      const allowed = new Set(current);
      const reordered = nextIds.filter((id) => allowed.has(id));
      const missing = current.filter((id) => !reordered.includes(id));
      return [...reordered, ...missing];
    });
  }, []);

  const toggleSortOrder = useCallback(() => {
    setPlaylistIds((ids) => [...ids].reverse());
    setSortOrder((order) => order === "newest" ? "oldest" : "newest");
  }, []);

  const commitArticleIdMigration = useCallback((
    articleIdMap: Map<string, string>,
    nextPlaylistIds: string[],
    nextAudioProgressMap: Record<string, AudioProgress>,
  ) => {
    redirectAudioProgressWrites(articleIdMap);
    audioPlayerRef.current?.migrateArticleId(articleIdMap);
    playlistIdsRef.current = nextPlaylistIds;
    setPlaylistIds(nextPlaylistIds);
    audioProgressMapRef.current = nextAudioProgressMap;
    setAudioProgressMap(nextAudioProgressMap);
  }, [audioProgressMapRef, playlistIdsRef]);

  useEffect(() => () => {
    if (playlistUndoTimer.current) clearTimeout(playlistUndoTimer.current);
  }, []);

  return {
    playlistIds,
    setPlaylistIds,
    playlistIdsRef,
    playablePlaylistIds,
    playlistArticles: playablePlaylist.articles,
    audioProgressMap,
    setAudioProgressMap,
    audioProgressMapRef,
    audioPlayer,
    audioPlayerRef,
    autoPlayNextRef,
    sortOrder,
    toggleSortOrder,
    togglePlaylist,
    removeFromPlaylist,
    removeMany,
    clear,
    reorder,
    commitArticleIdMigration,
  };
}
