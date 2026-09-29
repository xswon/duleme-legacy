import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { AudioProgress, Feed } from "../types";
import { normalizeFeedOrder, STORAGE_KEY_FEED_ORDER_BY_FOLDER, type FeedOrderByFolder } from "../services/feedSorting";
import {
  getAudioProgressMapFromDB,
  migrateFeedsAndAppStateFromLocalStorageIfNeeded,
  replaceFeedsInDB,
  saveAppStateToDB,
} from "../services/dbService";

interface UseReaderPersistenceOptions {
  feeds: Feed[];
  setFeeds: Dispatch<SetStateAction<Feed[]>>;
  categories: string[];
  setCategories: Dispatch<SetStateAction<string[]>>;
  feedOrderByFolder: FeedOrderByFolder;
  setFeedOrderByFolder: Dispatch<SetStateAction<FeedOrderByFolder>>;
  playlistIds: string[];
  setPlaylistIds: Dispatch<SetStateAction<string[]>>;
  audioProgressMap: Record<string, AudioProgress>;
  setAudioProgressMap: Dispatch<SetStateAction<Record<string, AudioProgress>>>;
  showToast: (message: string) => void;
}

export function useReaderPersistence(options: UseReaderPersistenceOptions) {
  const {
    feeds, setFeeds, categories, setCategories, feedOrderByFolder, setFeedOrderByFolder,
    playlistIds, setPlaylistIds, audioProgressMap, setAudioProgressMap, showToast,
  } = options;
  const [isAppStateReady, setIsAppStateReady] = useState(false);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const hadCompletedLegacyMigration = localStorage.getItem("wreader_idb_migrated_v3") === "1";
    void migrateFeedsAndAppStateFromLocalStorageIfNeeded(feeds, { categories, feedOrderByFolder, playlistIds, audioProgressMap })
      .then(async ({ feeds: storedFeeds, state }) => {
        const storedAudioProgress = await getAudioProgressMapFromDB();
        if (cancelled) return;
        if (storedFeeds.length > 0) setFeeds(storedFeeds);
        if (state.categories) setCategories(state.categories);
        if (state.feedOrderByFolder) setFeedOrderByFolder(normalizeFeedOrder(storedFeeds.length > 0 ? storedFeeds : feeds, state.feedOrderByFolder));
        if (state.playlistIds) setPlaylistIds(state.playlistIds);
        setAudioProgressMap(storedAudioProgress);
        setIsOnboardingComplete(state.onboardingCompleted ?? (storedFeeds.length > 0 || hadCompletedLegacyMigration));
        setIsAppStateReady(true);
        ["inoreader_feeds_v2", "wreader_categories_v1", STORAGE_KEY_FEED_ORDER_BY_FOLDER, "wreader_playlist", "wreader_audio_progress"].forEach((key) => localStorage.removeItem(key));
        localStorage.setItem("wreader_idb_migrated_v3", "1");
      })
      .catch((error) => {
        console.error("Failed to migrate app state to IndexedDB:", error);
        if (!cancelled) {
          setIsAppStateReady(true);
          showToast("本地数据迁移失败，原数据已保留；请重试或导出备份。");
        }
      });
    return () => { cancelled = true; };
  // Migration intentionally uses the boot-time snapshot exactly once.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Re-running can overwrite newer IndexedDB state with legacy storage.
  }, []);

  useEffect(() => {
    if (!isAppStateReady) return;
    void replaceFeedsInDB(feeds).catch((error) => showToast(`订阅保存失败：${error instanceof Error ? error.message : "请重试"}`));
  }, [feeds, isAppStateReady, showToast]);

  useEffect(() => setFeedOrderByFolder((previous) => normalizeFeedOrder(feeds, previous)), [feeds, setFeedOrderByFolder]);

  useEffect(() => {
    if (!isAppStateReady) return;
    void saveAppStateToDB({ categories, feedOrderByFolder, playlistIds, onboardingCompleted: isOnboardingComplete })
      .catch((error) => showToast(`本地数据保存失败：${error instanceof Error ? error.message : "请重试"}`));
  }, [categories, feedOrderByFolder, isAppStateReady, isOnboardingComplete, playlistIds, showToast]);

  const completeOnboarding = useCallback(() => setIsOnboardingComplete(true), []);

  return { isAppStateReady, isOnboardingComplete, completeOnboarding };
}
