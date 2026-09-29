import { AiConfig, Article, ArticleNote, AudioProgress, Feed } from "../types";

const DB_NAME = "WReaderDB";
const DB_VERSION = 6;
const STORE_ARTICLES = "articles";
const STORE_FEEDS = "feeds";
const STORE_NOTES = "notes";
const STORE_SETTINGS = "settings";
const STORE_SECRETS = "secrets";
const STORE_AUDIO_PROGRESS = "audioProgress";
export const NOTES_CHANGED_EVENT = "wreader:notes-changed";
export const TRANSCRIPTION_SETTINGS_CHANGED_EVENT = "wreader:transcription-settings-changed";

let dbPromise: Promise<IDBDatabase> | null = null;

export interface AudioProgressRecord extends AudioProgress {
  articleId: string;
}

function isAudioProgress(value: unknown): value is AudioProgress {
  if (!value || typeof value !== "object") return false;
  const progress = value as AudioProgress;
  return Number.isFinite(progress.currentTime) && Number.isFinite(progress.duration) && Number.isFinite(progress.updatedAt);
}

function chooseNewerAudioProgress(
  existing: AudioProgressRecord | undefined,
  candidate: AudioProgressRecord,
): AudioProgressRecord {
  if (!existing || candidate.updatedAt > existing.updatedAt) return candidate;
  // A tie is deterministic and never replaces a record that was already in
  // the dedicated store. This prevents an older migration source from moving
  // a listener backwards when clocks have insufficient resolution.
  return existing;
}

function migrateLegacyAudioProgressInTransaction(tx: IDBTransaction) {
  const settingsStore = tx.objectStore(STORE_SETTINGS);
  const progressStore = tx.objectStore(STORE_AUDIO_PROGRESS);
  const appRequest = settingsStore.get("app");
  appRequest.onsuccess = () => {
    const state = appRequest.result?.value as PersistedAppState | undefined;
    const legacyProgress = state?.audioProgressMap;
    if (!legacyProgress) return;

    const entries = Object.entries(legacyProgress)
      .filter(([, progress]) => isAudioProgress(progress))
      .map(([articleId, progress]) => ({ articleId, ...progress }));
    if (entries.length === 0) {
      const { audioProgressMap: _legacy, ...withoutLegacyProgress } = state;
      settingsStore.put({ key: "app", value: withoutLegacyProgress });
      return;
    }

    let pending = entries.length;
    const finish = () => {
      pending -= 1;
      if (pending !== 0) return;
      const { audioProgressMap: _legacy, ...withoutLegacyProgress } = state;
      settingsStore.put({ key: "app", value: withoutLegacyProgress });
    };
    entries.forEach((candidate) => {
      const progressRequest = progressStore.get(candidate.articleId);
      progressRequest.onsuccess = () => {
        const existing = progressRequest.result as AudioProgressRecord | undefined;
        const selected = chooseNewerAudioProgress(existing, candidate);
        if (selected !== existing) progressStore.put(selected);
        finish();
      };
    });
  };
}

function notifyNotesChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTES_CHANGED_EVENT));
}

export function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this environment"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const tx = (event.target as IDBOpenDBRequest).transaction!;

      if (!db.objectStoreNames.contains(STORE_ARTICLES)) {
        const articleStore = db.createObjectStore(STORE_ARTICLES, { keyPath: "id" });
        articleStore.createIndex("feedId", "feedId", { unique: false });
        articleStore.createIndex("starred", "starred", { unique: false });
        articleStore.createIndex("read", "read", { unique: false });
        articleStore.createIndex("pubDate", "pubDate", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_FEEDS)) {
        db.createObjectStore(STORE_FEEDS, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORE_NOTES)) {
        const noteStore = db.createObjectStore(STORE_NOTES, { keyPath: "id" });
        noteStore.createIndex("articleId", "articleId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_SECRETS)) {
        db.createObjectStore(STORE_SECRETS, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_AUDIO_PROGRESS)) {
        db.createObjectStore(STORE_AUDIO_PROGRESS, { keyPath: "articleId" });
      }
      if ((event as IDBVersionChangeEvent).oldVersion < 6) migrateLegacyAudioProgressInTransaction(tx);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      console.error("IndexedDB open error:", request.error);
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

export interface PersistedAppState {
  categories?: string[];
  feedOrderByFolder?: Record<string, string[]>;
  playlistIds?: string[];
  audioProgressMap?: Record<string, { currentTime: number; duration: number; updatedAt: number }>;
  aiConfig?: AiConfig;
  onboardingCompleted?: boolean;
}

/** Covers maps introduced by localStorage migration or a legacy backup after v6 exists. */
async function migrateLegacyAudioProgressIfNeeded(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SETTINGS, STORE_AUDIO_PROGRESS], "readwrite");
    migrateLegacyAudioProgressInTransaction(tx);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Failed to migrate legacy audio progress"));
    tx.onabort = () => reject(tx.error || new Error("Failed to migrate legacy audio progress"));
  });
}

/** Load the compatibility map used by React without putting it back in settings. */
export async function getAudioProgressMapFromDB(): Promise<Record<string, AudioProgress>> {
  await migrateLegacyAudioProgressIfNeeded();
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_AUDIO_PROGRESS, "readonly").objectStore(STORE_AUDIO_PROGRESS).getAll();
    request.onsuccess = () => {
      const progressMap: Record<string, AudioProgress> = {};
      (request.result as AudioProgressRecord[]).forEach(({ articleId, currentTime, duration, updatedAt }) => {
        progressMap[articleId] = { currentTime, duration, updatedAt };
      });
      resolve(progressMap);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getAllAudioProgressFromDB(): Promise<AudioProgressRecord[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_AUDIO_PROGRESS, "readonly").objectStore(STORE_AUDIO_PROGRESS).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

type AudioProgressWriteState = {
  pending?: AudioProgressRecord;
  writing: boolean;
  resolvers: Array<() => void>;
  rejecters: Array<(error: Error) => void>;
};
const audioProgressWriteStates = new Map<string, AudioProgressWriteState>();
const audioProgressArticleIdRedirects = new Map<string, string>();

function resolveAudioProgressArticleId(articleId: string): string {
  let resolved = articleId;
  const seen = new Set<string>();
  while (audioProgressArticleIdRedirects.has(resolved) && !seen.has(resolved)) {
    seen.add(resolved);
    resolved = audioProgressArticleIdRedirects.get(resolved)!;
  }
  return resolved;
}

async function writeLatestAudioProgress(articleId: string, state: AudioProgressWriteState): Promise<void> {
  const candidate = state.pending;
  state.pending = undefined;
  if (!candidate) return;
  try {
    const db = await getDB();
    const targetArticleId = resolveAudioProgressArticleId(candidate.articleId);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_AUDIO_PROGRESS, "readwrite");
      const store = tx.objectStore(STORE_AUDIO_PROGRESS);
      const request = store.get(targetArticleId);
      request.onsuccess = () => {
        const capturedProgress = request.result as AudioProgressRecord | undefined;
        const finalArticleId = resolveAudioProgressArticleId(candidate.articleId);
        const finalCandidate = finalArticleId === candidate.articleId ? candidate : { ...candidate, articleId: finalArticleId };
        const writeProgress = (existing: AudioProgressRecord | undefined) => {
          let selected = chooseNewerAudioProgress(existing, finalCandidate);
          if (finalArticleId !== targetArticleId && capturedProgress) {
            selected = chooseNewerAudioProgress(selected, { ...capturedProgress, articleId: finalArticleId });
          }
          if (selected !== existing) store.put(selected);
          // The transaction may have been queued before a refresh installed
          // its redirect. Remove its captured legacy key in that same write.
          if (finalArticleId !== targetArticleId) store.delete(targetArticleId);
        };
        if (finalArticleId === targetArticleId) {
          writeProgress(capturedProgress);
          return;
        }
        const finalRequest = store.get(finalArticleId);
        finalRequest.onsuccess = () => writeProgress(finalRequest.result as AudioProgressRecord | undefined);
        finalRequest.onerror = () => tx.abort();
      };
      request.onerror = () => tx.abort();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Failed to save audio progress"));
      tx.onabort = () => reject(tx.error || new Error("Failed to save audio progress"));
    });
    if (state.pending) {
      await writeLatestAudioProgress(articleId, state);
      return;
    }
    state.resolvers.splice(0).forEach((resolve) => resolve());
    state.rejecters.length = 0;
    audioProgressWriteStates.delete(articleId);
  } catch (error) {
    const failure = error instanceof Error ? error : new Error("Failed to save audio progress");
    state.rejecters.splice(0).forEach((reject) => reject(failure));
    state.resolvers.length = 0;
    audioProgressWriteStates.delete(articleId);
  }
}

/**
 * Coalesces concurrent updates for one article. At most one IndexedDB write is
 * active per article; a newer position queued while it runs is written next.
 */
export function saveAudioProgressToDB(progress: AudioProgressRecord): Promise<void> {
  const articleId = resolveAudioProgressArticleId(progress.articleId);
  const targetProgress = articleId === progress.articleId ? progress : { ...progress, articleId };
  let state = audioProgressWriteStates.get(articleId);
  if (!state) {
    state = { writing: false, resolvers: [], rejecters: [] };
    audioProgressWriteStates.set(articleId, state);
  }
  state.pending = !state.pending || targetProgress.updatedAt >= state.pending.updatedAt ? targetProgress : state.pending;
  return new Promise((resolve, reject) => {
    state!.resolvers.push(resolve);
    state!.rejecters.push(reject);
    if (!state!.writing) {
      state!.writing = true;
      void writeLatestAudioProgress(articleId, state!);
    }
  });
}

/** Redirect queued progress writes after a successful article-ID migration. */
export function redirectAudioProgressWrites(articleIdMap: Map<string, string>): void {
  articleIdMap.forEach((targetId, sourceId) => {
    if (sourceId !== targetId) audioProgressArticleIdRedirects.set(sourceId, resolveAudioProgressArticleId(targetId));
  });
}

async function migrateAudioProgressRecordsToDB(records: AudioProgressRecord[]): Promise<void> {
  const validRecords = records.filter((record) => typeof record.articleId === "string" && isAudioProgress(record));
  if (validRecords.length === 0) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUDIO_PROGRESS, "readwrite");
    const store = tx.objectStore(STORE_AUDIO_PROGRESS);
    validRecords.forEach((candidate) => {
      const request = store.get(candidate.articleId);
      request.onsuccess = () => {
        try {
          const existing = request.result as AudioProgressRecord | undefined;
          const selected = chooseNewerAudioProgress(existing, candidate);
          if (selected !== existing) store.put(selected);
        } catch {
          tx.abort();
        }
      };
      request.onerror = () => tx.abort();
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Failed to migrate audio progress"));
    tx.onabort = () => reject(tx.error || new Error("Failed to migrate audio progress"));
  });
}

export interface TranscriptionSettings { provider: "aliyun"; apiKey: string; language: string; diarization: boolean; contextEnhancement: boolean; }
const TRANSCRIPTION_SETTINGS_KEY = "transcription";
export async function getTranscriptionSettings(): Promise<TranscriptionSettings | null> {
  const db = await getDB(); return new Promise((resolve, reject) => { const request = db.transaction(STORE_SETTINGS, "readonly").objectStore(STORE_SETTINGS).get(TRANSCRIPTION_SETTINGS_KEY); request.onsuccess = () => resolve(request.result?.value || null); request.onerror = () => reject(request.error); });
}
export async function saveTranscriptionSettings(value: TranscriptionSettings): Promise<void> {
  const db = await getDB(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE_SETTINGS, "readwrite"); tx.objectStore(STORE_SETTINGS).put({ key: TRANSCRIPTION_SETTINGS_KEY, value }); tx.oncomplete = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(TRANSCRIPTION_SETTINGS_CHANGED_EVENT)); resolve(); }; tx.onerror = () => reject(tx.error); });
}
export async function clearTranscriptionSettings(): Promise<void> {
  const db = await getDB(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE_SETTINGS, "readwrite"); tx.objectStore(STORE_SETTINGS).delete(TRANSCRIPTION_SETTINGS_KEY); tx.oncomplete = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(TRANSCRIPTION_SETTINGS_CHANGED_EVENT)); resolve(); }; tx.onerror = () => reject(tx.error); });
}

export async function getFeedsFromDB(): Promise<Feed[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_FEEDS, "readonly").objectStore(STORE_FEEDS).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function replaceFeedsInDB(feeds: Feed[]): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FEEDS, "readwrite");
    const store = tx.objectStore(STORE_FEEDS);
    store.clear();
    feeds.forEach((feed) => store.put(feed));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Failed to save subscriptions"));
  });
}

/** Delete a subscription and all of its articles as one durable operation. */
export async function deleteFeedAndArticlesFromDB(feedId: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_FEEDS, STORE_ARTICLES], "readwrite");
    const feedStore = tx.objectStore(STORE_FEEDS);
    const articleStore = tx.objectStore(STORE_ARTICLES);
    const cursorRequest = articleStore.index("feedId").openCursor(IDBKeyRange.only(feedId));
    let failure: Error | null = null;

    const abort = (error: Error) => {
      if (!failure) failure = error;
      try {
        tx.abort();
      } catch {
        // The transaction may already be aborting after a request failure.
      }
    };

    try {
      const deleteFeed = feedStore.delete(feedId);
      deleteFeed.onerror = () => abort(deleteFeed.error || new Error("Failed to delete subscription"));
    } catch (error) {
      abort(error instanceof Error ? error : new Error("Failed to delete subscription"));
    }

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      try {
        const deleteArticle = cursor.delete();
        deleteArticle.onerror = () => abort(deleteArticle.error || new Error("Failed to delete subscription articles"));
        cursor.continue();
      } catch (error) {
        abort(error instanceof Error ? error : new Error("Failed to delete subscription articles"));
      }
    };
    cursorRequest.onerror = () => abort(cursorRequest.error || new Error("Failed to read subscription articles"));
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      // onabort supplies one rejection path for every request failure.
    };
    tx.onabort = () => reject(failure || tx.error || new Error("Failed to delete subscription"));
  });
}

/** Update a subscription and clear its old article snapshot atomically. */
export async function updateFeedAndDeleteArticlesFromDB(feed: Feed): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_FEEDS, STORE_ARTICLES], "readwrite");
    const feedStore = tx.objectStore(STORE_FEEDS);
    const articleStore = tx.objectStore(STORE_ARTICLES);
    const cursorRequest = articleStore.index("feedId").openCursor(IDBKeyRange.only(feed.id));
    let failure: Error | null = null;

    const abort = (error: Error) => {
      if (!failure) failure = error;
      try {
        tx.abort();
      } catch {
        // The transaction may already be aborting after a request failure.
      }
    };

    try {
      const putFeed = feedStore.put(feed);
      putFeed.onerror = () => abort(putFeed.error || new Error("Failed to update subscription"));
    } catch (error) {
      abort(error instanceof Error ? error : new Error("Failed to update subscription"));
    }

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      try {
        const deleteArticle = cursor.delete();
        deleteArticle.onerror = () => abort(deleteArticle.error || new Error("Failed to delete outdated subscription articles"));
        cursor.continue();
      } catch (error) {
        abort(error instanceof Error ? error : new Error("Failed to delete outdated subscription articles"));
      }
    };
    cursorRequest.onerror = () => abort(cursorRequest.error || new Error("Failed to read subscription articles"));
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      // onabort supplies one rejection path for every request failure.
    };
    tx.onabort = () => reject(failure || tx.error || new Error("Failed to update subscription"));
  });
}

export async function getAppStateFromDB(): Promise<PersistedAppState | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_SETTINGS, "readonly").objectStore(STORE_SETTINGS).get("app");
    request.onsuccess = () => resolve(request.result?.value || null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveAppStateToDB(value: PersistedAppState): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SETTINGS, "readwrite");
    const store = tx.objectStore(STORE_SETTINGS);
    const request = store.get("app");
    request.onsuccess = () => {
      const existing = (request.result?.value || {}) as PersistedAppState;
      store.put({ key: "app", value: { ...existing, ...value } });
    };
    request.onerror = () => tx.abort();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Failed to save app state"));
  });
}

export async function getSecretFromDB<T>(key: string): Promise<T | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_SECRETS, "readonly").objectStore(STORE_SECRETS).get(key);
    request.onsuccess = () => resolve((request.result?.value as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSecretToDB<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SECRETS, "readwrite");
    tx.objectStore(STORE_SECRETS).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Failed to save secret"));
  });
}

export async function deleteSecretFromDB(key: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SECRETS, "readwrite");
    tx.objectStore(STORE_SECRETS).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Failed to delete secret"));
  });
}

export async function migrateFeedsAndAppStateFromLocalStorageIfNeeded(
  legacyFeeds: Feed[],
  legacyState: PersistedAppState,
): Promise<{ feeds: Feed[]; state: PersistedAppState }> {
  let storedFeeds = await getFeedsFromDB();
  let storedState = await getAppStateFromDB();
  const { audioProgressMap: legacyAudioProgressMap, ...legacySettings } = legacyState;

  // Migrate each legacy area independently. A retry can therefore finish
  // progress migration after a previous run wrote feeds but failed on settings.
  if (storedFeeds.length === 0) {
    await replaceFeedsInDB(legacyFeeds);
    storedFeeds = await getFeedsFromDB();
    if (storedFeeds.length !== legacyFeeds.length) {
      throw new Error("IndexedDB subscription migration verification failed");
    }
  }
  // Never merge old localStorage settings over an existing IndexedDB record.
  if (!storedState) {
    await saveAppStateToDB(legacySettings);
    storedState = await getAppStateFromDB();
    if (!storedState) throw new Error("IndexedDB app-state migration verification failed");
  }
  await migrateAudioProgressRecordsToDB(
    Object.entries(legacyAudioProgressMap || {})
      .filter(([, progress]) => isAudioProgress(progress))
      .map(([articleId, progress]) => ({ articleId, ...progress })),
  );
  return { feeds: storedFeeds, state: storedState };
}

interface DataBackupPayload {
  feeds: Feed[];
  articles: Article[];
  notes: ArticleNote[];
  appState: PersistedAppState | null;
  /** Optional so version-1 backups written before audioProgress existed restore unchanged. */
  audioProgress?: AudioProgressRecord[];
}

export interface WReaderBackup {
  version: 1;
  createdAt: string;
  checksum: string;
  data: DataBackupPayload;
}

function checksum(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export async function createDataBackup(): Promise<WReaderBackup> {
  const [feeds, articles, notes, appState, audioProgress] = await Promise.all([
    getFeedsFromDB(),
    getAllArticlesFromDB(),
    getAllArticleNotesFromDB(),
    getAppStateFromDB(),
    getAllAudioProgressFromDB(),
  ]);
  const data = { feeds, articles, notes, appState, audioProgress };
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    checksum: checksum(JSON.stringify(data)),
    data,
  };
}

export async function restoreDataBackup(raw: string): Promise<{ feeds: Feed[]; articles: Article[]; notes: ArticleNote[] }> {
  const backup = JSON.parse(raw) as Partial<WReaderBackup>;
  if (backup.version !== 1 || !backup.data || !backup.checksum) throw new Error("备份版本不受支持");
  const serialized = JSON.stringify(backup.data);
  if (checksum(serialized) !== backup.checksum) throw new Error("备份校验失败，文件可能已损坏");
  const data = backup.data as DataBackupPayload;
  if (!Array.isArray(data.feeds) || !Array.isArray(data.articles) || !Array.isArray(data.notes) || (data.audioProgress !== undefined && !Array.isArray(data.audioProgress))) throw new Error("备份内容不完整");
  const currentAppState = await getAppStateFromDB();
  const normalizeEndpoint = (value?: string) => (value || "").trim().replace(/\/+$/, "");
  const currentEndpoint = normalizeEndpoint(currentAppState?.aiConfig?.baseURL);
  const restoredEndpoint = normalizeEndpoint(data.appState?.aiConfig?.baseURL);
  const canReuseCurrentAiSecret = Boolean(currentEndpoint && restoredEndpoint && currentEndpoint === restoredEndpoint);
  const legacyAudioProgress = Object.entries(data.appState?.audioProgressMap || {})
    .filter(([, progress]) => isAudioProgress(progress))
    .map(([articleId, progress]) => ({ articleId, ...progress }));
  const restoredAudioProgressByArticle = new Map<string, AudioProgressRecord>();
  legacyAudioProgress.forEach((progress) => restoredAudioProgressByArticle.set(progress.articleId, progress));
  (data.audioProgress || []).forEach((progress) => {
    if (typeof progress.articleId !== "string" || !isAudioProgress(progress)) return;
    const existing = restoredAudioProgressByArticle.get(progress.articleId);
    // The dedicated backup record is authoritative for equal timestamps.
    if (!existing || progress.updatedAt >= existing.updatedAt) restoredAudioProgressByArticle.set(progress.articleId, progress);
  });
  const restoredAudioProgress = Array.from(restoredAudioProgressByArticle.values());
  const { audioProgressMap: _legacyAudioProgress, ...restoredAppState } = data.appState || {};
  const db = await getDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_FEEDS, STORE_ARTICLES, STORE_NOTES, STORE_SETTINGS, STORE_SECRETS, STORE_AUDIO_PROGRESS], "readwrite");
    tx.objectStore(STORE_FEEDS).clear();
    tx.objectStore(STORE_ARTICLES).clear();
    tx.objectStore(STORE_NOTES).clear();
    tx.objectStore(STORE_SETTINGS).clear();
    tx.objectStore(STORE_AUDIO_PROGRESS).clear();
    if (!canReuseCurrentAiSecret) tx.objectStore(STORE_SECRETS).delete("ai");
    data.feeds.forEach((feed) => tx.objectStore(STORE_FEEDS).put(feed));
    data.articles.forEach((article) => tx.objectStore(STORE_ARTICLES).put(article));
    data.notes.forEach((note) => tx.objectStore(STORE_NOTES).put(note));
    restoredAudioProgress.forEach((progress) => tx.objectStore(STORE_AUDIO_PROGRESS).put(progress));
    if (data.appState) tx.objectStore(STORE_SETTINGS).put({ key: "app", value: restoredAppState });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("备份恢复失败"));
  });
  const [verifiedFeeds, verifiedArticles, verifiedNotes] = await Promise.all([
    getFeedsFromDB(), getAllArticlesFromDB(), getAllArticleNotesFromDB(),
  ]);
  if (verifiedFeeds.length !== data.feeds.length || verifiedArticles.length !== data.articles.length || verifiedNotes.length !== data.notes.length) {
    throw new Error("备份恢复校验失败");
  }
  return { feeds: verifiedFeeds, articles: verifiedArticles, notes: verifiedNotes };
}

/** Return one article's excerpts in their creation order. */
export async function getArticleNotesFromDB(articleId: string): Promise<ArticleNote[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, "readonly");
    const request = tx.objectStore(STORE_NOTES).index("articleId").getAll(articleId);
    request.onsuccess = () => resolve((request.result || []).sort((a, b) => a.createdAt - b.createdAt));
    request.onerror = () => reject(request.error);
  });
}

export async function getAllArticleNotesFromDB(): Promise<ArticleNote[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NOTES, "readonly").objectStore(STORE_NOTES).getAll();
    request.onsuccess = () => resolve((request.result || []).sort((a, b) => b.updatedAt - a.updatedAt));
    request.onerror = () => reject(request.error);
  });
}

/** Create or replace a persisted excerpt/note. */
export async function saveArticleNoteToDB(note: ArticleNote): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, "readwrite");
    tx.objectStore(STORE_NOTES).put(note);
    tx.oncomplete = () => { notifyNotesChanged(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteArticleNoteFromDB(noteId: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, "readwrite");
    tx.objectStore(STORE_NOTES).delete(noteId);
    tx.oncomplete = () => { notifyNotesChanged(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

/** Delete a set of article notes atomically. */
export async function deleteArticleNotesFromDB(noteIds: string[]): Promise<void> {
  if (noteIds.length === 0) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, "readwrite");
    const store = tx.objectStore(STORE_NOTES);
    noteIds.forEach((noteId) => store.delete(noteId));
    tx.oncomplete = () => { notifyNotesChanged(); resolve(); };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Failed to delete notes"));
  });
}

/** Repoint persisted notes when a refreshed feed gives an article a new canonical ID. */
export async function migrateArticleNoteIdsInDB(articleIdMap: Map<string, string>): Promise<void> {
  if (articleIdMap.size === 0) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, "readwrite");
    const store = tx.objectStore(STORE_NOTES);
    const request = store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const note = cursor.value as ArticleNote;
      const articleId = articleIdMap.get(note.articleId);
      if (articleId && articleId !== note.articleId) {
        cursor.update({ ...note, articleId });
      }
      cursor.continue();
    };
    request.onerror = () => tx.abort();
    tx.oncomplete = () => { notifyNotesChanged(); resolve(); };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Failed to migrate article note references"));
  });
}

/** Close the cached connection, primarily for explicit app/test lifecycle cleanup. */
export async function closeDB(): Promise<void> {
  const pending = dbPromise;
  dbPromise = null;
  if (!pending) return;
  const db = await pending;
  db.close();
}

/** Get all stored articles from IndexedDB */
export async function getAllArticlesFromDB(): Promise<Article[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ARTICLES, "readonly");
      const store = tx.objectStore(STORE_ARTICLES);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
}

/** Save or update multiple articles in IndexedDB */
export async function saveArticlesToDB(articles: Article[]): Promise<void> {
  if (!articles || articles.length === 0) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ARTICLES, "readwrite");
      const store = tx.objectStore(STORE_ARTICLES);

      articles.forEach((article) => {
        store.put(article);
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Failed to save articles"));
    });
}

/** Remove specific obsolete article records without affecting other feed data. */
export async function deleteArticlesByIdsFromDB(articleIds: Iterable<string>): Promise<void> {
  const ids = Array.from(new Set(articleIds));
  if (ids.length === 0) return;

  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ARTICLES, "readwrite");
    const store = tx.objectStore(STORE_ARTICLES);
    ids.forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Failed to delete obsolete articles"));
  });
}

/**
 * Replace the persisted snapshot for successfully refreshed feeds.
 *
 * A refresh can migrate an episode to a new canonical ID. Plain `put` calls
 * leave the old key behind, so the legacy copy reappears on the next reload and
 * can open without its enrichment reference. Deleting and writing in the same
 * transaction keeps the refreshed feed snapshot consistent.
 */
export async function replaceArticlesForFeedsInDB(
  feedIds: Iterable<string>,
  articles: Article[]
): Promise<void> {
  const ids = Array.from(new Set(feedIds));
  if (ids.length === 0) return;

  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ARTICLES, "readwrite");
    const store = tx.objectStore(STORE_ARTICLES);
    const index = store.index("feedId");
    const keysToDelete: IDBValidKey[] = [];
    let pendingKeyRequests = ids.length;

    const writeReplacement = () => {
      try {
        keysToDelete.forEach((key) => store.delete(key));
        articles.forEach((article) => store.put(article));
      } catch {
        tx.abort();
      }
    };

    ids.forEach((feedId) => {
      const request = index.getAllKeys(IDBKeyRange.only(feedId));
      request.onsuccess = () => {
        keysToDelete.push(...request.result);
        pendingKeyRequests -= 1;
        if (pendingKeyRequests === 0) writeReplacement();
      };
      request.onerror = () => tx.abort();
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Failed to replace refreshed articles"));
  });
}

/**
 * Persist a refreshed article snapshot and its dependent local references in
 * one transaction. A failed refresh therefore leaves both the old article
 * keys and note/app-state backrefs untouched.
 */
export async function replaceArticlesForFeedsAndMigrateReferencesInDB(
  feedIds: Iterable<string>,
  articles: Article[],
  articleIdMap: Map<string, string>,
  appStatePatch?: Pick<PersistedAppState, "playlistIds">
): Promise<void> {
  const ids = Array.from(new Set(feedIds));
  if (ids.length === 0) return;

  const db = await getDB();
  return new Promise((resolve, reject) => {
    const stores = appStatePatch
      ? [STORE_ARTICLES, STORE_NOTES, STORE_SETTINGS, STORE_AUDIO_PROGRESS]
      : [STORE_ARTICLES, STORE_NOTES, STORE_AUDIO_PROGRESS];
    const tx = db.transaction(stores, "readwrite");
    const articleStore = tx.objectStore(STORE_ARTICLES);
    const noteStore = tx.objectStore(STORE_NOTES);
    const audioProgressStore = tx.objectStore(STORE_AUDIO_PROGRESS);
    const index = articleStore.index("feedId");
    const keysToDelete: IDBValidKey[] = [];
    let pendingKeyRequests = ids.length;
    let failure: Error | null = null;

    const abort = (error: Error) => {
      if (!failure) failure = error;
      try {
        tx.abort();
      } catch {
        // A request failure can already have started the abort sequence.
      }
    };

    const updateNotesAndAppState = () => {
      if (articleIdMap.size > 0) {
        const cursorRequest = noteStore.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const note = cursor.value as ArticleNote;
          const articleId = articleIdMap.get(note.articleId);
          if (articleId && articleId !== note.articleId) {
            const updateRequest = cursor.update({ ...note, articleId });
            updateRequest.onerror = () => abort(updateRequest.error || new Error("Failed to migrate article note references"));
          }
          cursor.continue();
        };
        cursorRequest.onerror = () => abort(cursorRequest.error || new Error("Failed to read article notes"));

        const progressRequest = audioProgressStore.getAll();
        progressRequest.onsuccess = () => {
          const migrationByTarget = new Map<string, { candidate: AudioProgressRecord; sourceIds: string[] }>();
          (progressRequest.result as AudioProgressRecord[])
            .slice()
            .sort((left, right) => left.articleId.localeCompare(right.articleId))
            .forEach((oldProgress) => {
              const targetId = articleIdMap.get(oldProgress.articleId);
              if (!targetId || targetId === oldProgress.articleId) return;
              const existing = migrationByTarget.get(targetId);
              const candidate = { ...oldProgress, articleId: targetId };
              if (!existing) {
                migrationByTarget.set(targetId, { candidate, sourceIds: [oldProgress.articleId] });
                return;
              }
              existing.sourceIds.push(oldProgress.articleId);
              if (candidate.updatedAt > existing.candidate.updatedAt) existing.candidate = candidate;
            });

          migrationByTarget.forEach(({ candidate, sourceIds }, targetId) => {
            const existingRequest = audioProgressStore.get(targetId);
            existingRequest.onsuccess = () => {
              try {
                const existing = existingRequest.result as AudioProgressRecord | undefined;
                const selected = chooseNewerAudioProgress(existing, candidate);
                if (selected !== existing) {
                  const putRequest = audioProgressStore.put(selected);
                  putRequest.onerror = () => abort(putRequest.error || new Error("Failed to migrate audio progress references"));
                }
                sourceIds.forEach((sourceId) => {
                  const deleteRequest = audioProgressStore.delete(sourceId);
                  deleteRequest.onerror = () => abort(deleteRequest.error || new Error("Failed to remove migrated audio progress"));
                });
              } catch (error) {
                abort(error instanceof Error ? error : new Error("Failed to migrate audio progress references"));
              }
            };
            existingRequest.onerror = () => abort(existingRequest.error || new Error("Failed to migrate audio progress references"));
          });
        };
        progressRequest.onerror = () => abort(progressRequest.error || new Error("Failed to read audio progress references"));
      }

      if (appStatePatch) {
        const settingsStore = tx.objectStore(STORE_SETTINGS);
        const appRequest = settingsStore.get("app");
        appRequest.onsuccess = () => {
          const putRequest = settingsStore.put({
            key: "app",
            value: { ...(appRequest.result?.value || {}), ...appStatePatch },
          });
          putRequest.onerror = () => abort(putRequest.error || new Error("Failed to migrate article references in app state"));
        };
        appRequest.onerror = () => abort(appRequest.error || new Error("Failed to read app state"));
      }
    };

    const writeReplacement = () => {
      try {
        keysToDelete.forEach((key) => {
          const request = articleStore.delete(key);
          request.onerror = () => abort(request.error || new Error("Failed to remove refreshed article"));
        });
        articles.forEach((article) => {
          const request = articleStore.put(article);
          request.onerror = () => abort(request.error || new Error("Failed to save refreshed article"));
        });
        updateNotesAndAppState();
      } catch (error) {
        abort(error instanceof Error ? error : new Error("Failed to replace refreshed articles"));
      }
    };

    ids.forEach((feedId) => {
      const request = index.getAllKeys(IDBKeyRange.only(feedId));
      request.onsuccess = () => {
        keysToDelete.push(...request.result);
        pendingKeyRequests -= 1;
        if (pendingKeyRequests === 0) writeReplacement();
      };
      request.onerror = () => abort(request.error || new Error("Failed to read refreshed article keys"));
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      // An erroring readwrite transaction always reaches onabort.
    };
    tx.onabort = () => reject(failure || tx.error || new Error("Failed to replace refreshed articles"));
  });
}

/** Incrementally update a single article's properties (e.g. read / starred) */
export async function updateArticleInDB(articleId: string, updates: Partial<Article>): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ARTICLES, "readwrite");
      const store = tx.objectStore(STORE_ARTICLES);
      const getReq = store.get(articleId);
      let failure: Error | null = null;

      const abort = (error: Error) => {
        if (!failure) failure = error;
        try {
          tx.abort();
        } catch {
          // The transaction may already be aborting after a request error.
        }
      };

      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (!existing) {
          abort(new Error(`Article not found: ${articleId}`));
          return;
        }
        const request = store.put({ ...existing, ...updates });
        request.onerror = () => abort(request.error || new Error(`Failed to update article: ${articleId}`));
      };
      getReq.onerror = () => abort(getReq.error || new Error(`Failed to read article: ${articleId}`));

      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        // onabort provides a single rejection path for request failures.
      };
      tx.onabort = () => reject(failure || tx.error || new Error(`Failed to update article: ${articleId}`));
    });
}

/**
 * Update multiple articles as one atomic operation. If any requested article is
 * missing, or any request fails, the whole transaction is aborted so callers
 * never observe a partially-applied batch.
 */
export async function updateArticlesInDB(
  articleIds: Iterable<string>,
  updates: Partial<Article>
): Promise<void> {
  const ids = Array.from(new Set(articleIds));
  if (ids.length === 0) return;

  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ARTICLES, "readwrite");
    const store = tx.objectStore(STORE_ARTICLES);
    let failure: Error | null = null;

    const abort = (error: Error) => {
      if (!failure) failure = error;
      try {
        tx.abort();
      } catch {
        // The transaction may already be aborting because of a request error.
      }
    };

    ids.forEach((articleId) => {
      const request = store.get(articleId);
      request.onsuccess = () => {
        if (failure) return;
        const existing = request.result as Article | undefined;
        if (!existing) {
          abort(new Error(`Article not found: ${articleId}`));
          return;
        }

        const putRequest = store.put({ ...existing, ...updates, id: existing.id });
        putRequest.onerror = () => abort(putRequest.error || new Error(`Failed to update article: ${articleId}`));
      };
      request.onerror = () => abort(request.error || new Error(`Failed to read article: ${articleId}`));
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      // onabort is the authoritative rejection path for aborted transactions.
    };
    tx.onabort = () => reject(failure || tx.error || new Error("Failed to update articles"));
  });
}

/** Delete all articles belonging to a specific feedId */
export async function deleteArticlesByFeedIdFromDB(feedId: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ARTICLES, "readwrite");
      const store = tx.objectStore(STORE_ARTICLES);
      const index = store.index("feedId");
      const request = index.openCursor(IDBKeyRange.only(feedId));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error(`Failed to delete articles for feed: ${feedId}`));
    });
}

/** Smooth one-time migration: Import data from legacy LocalStorage into IndexedDB */
export async function migrateFromLocalStorageIfNeeded(): Promise<Article[]> {
  const legacyKey = "inoreader_articles_v2";
  const raw = localStorage.getItem(legacyKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`Migrating ${parsed.length} legacy articles from LocalStorage to IndexedDB...`);
        const articles = parsed as Article[];
        await saveArticlesToDB(articles);
        const stored = await getAllArticlesFromDB();
        if (stored.length < articles.length || !articles.every((article) => stored.some((item) => item.id === article.id))) {
          throw new Error("IndexedDB migration verification failed");
        }
        localStorage.setItem("inoreader_articles_v2_migrated", "1");
        localStorage.removeItem(legacyKey);
        return articles;
      }
    }
  return [];
}
