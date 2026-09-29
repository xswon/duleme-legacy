import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Article, ArticleNote } from "../src/types";
import {
  closeDB,
  createDataBackup,
  deleteFeedAndArticlesFromDB,
  deleteArticleNoteFromDB,
  deleteArticleNotesFromDB,
  deleteArticlesByFeedIdFromDB,
  getAllArticlesFromDB,
  getFeedsFromDB,
  getAllArticleNotesFromDB,
  getAudioProgressMapFromDB,
  getArticleNotesFromDB,
  getAppStateFromDB,
  getDB,
  getSecretFromDB,
  migrateArticleNoteIdsInDB,
  migrateFeedsAndAppStateFromLocalStorageIfNeeded,
  migrateFromLocalStorageIfNeeded,
  replaceArticlesForFeedsInDB,
  replaceArticlesForFeedsAndMigrateReferencesInDB,
  replaceFeedsInDB,
  redirectAudioProgressWrites,
  restoreDataBackup,
  saveAudioProgressToDB,
  saveAppStateToDB,
  saveArticlesToDB,
  saveSecretToDB,
  saveArticleNoteToDB,
  updateArticleInDB,
  updateArticlesInDB,
  updateFeedAndDeleteArticlesFromDB,
} from "../src/services/dbService";
import {
  mergeFetchedFeedArticles,
  loadStoredArticlesAsync,
  migrateAudioProgressMap,
  normalizeStoredArticle,
} from "../src/services/rssService";

const article = (id: string, feedId = "feed-1"): Article => ({
  id,
  feedId,
  feedTitle: "Feed",
  title: id,
  link: `https://example.com/${id}`,
  pubDate: new Date().toISOString(),
  snippet: "snippet",
  content: "content",
  read: false,
  starred: false,
});

beforeEach(async () => {
  await closeDB();
  const databases = await indexedDB.databases();
  await Promise.all(databases.map(({ name }) => name ? new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  }) : Promise.resolve()));
  localStorage.clear();
});

async function createVersion5Database(
  appState: Record<string, unknown>,
  existingProgress?: { articleId: string; currentTime: number; duration: number; updatedAt: number },
) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("WReaderDB", 5);
    request.onupgradeneeded = () => {
      const db = request.result;
      const settings = db.createObjectStore("settings", { keyPath: "key" });
      settings.put({ key: "app", value: appState });
      if (existingProgress) {
        const progress = db.createObjectStore("audioProgress", { keyPath: "articleId" });
        progress.put(existingProgress);
      }
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
}

function backupChecksum(data: unknown) {
  const value = JSON.stringify(data);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

describe("article IndexedDB persistence", () => {
  it("upgrades to v6 with a dedicated audio-progress store", async () => {
    const db = await getDB();
    expect(db.version).toBe(6);
    expect(db.objectStoreNames.contains("audioProgress")).toBe(true);
  });

  it("migrates legacy audio progress during upgrade and removes the legacy map", async () => {
    await createVersion5Database({
      audioProgressMap: { episode: { currentTime: 42, duration: 300, updatedAt: 10 } },
    });

    await expect(getAudioProgressMapFromDB()).resolves.toEqual({
      episode: { currentTime: 42, duration: 300, updatedAt: 10 },
    });
    await expect(getAppStateFromDB()).resolves.not.toHaveProperty("audioProgressMap");
  });

  it("keeps newer dedicated progress when migration encounters a conflict", async () => {
    await createVersion5Database(
      { audioProgressMap: { episode: { currentTime: 80, duration: 300, updatedAt: 10 } } },
      { articleId: "episode", currentTime: 60, duration: 300, updatedAt: 20 },
    );

    await expect(getAudioProgressMapFromDB()).resolves.toEqual({
      episode: { currentTime: 60, duration: 300, updatedAt: 20 },
    });
  });

  it("persists dedicated progress across a database reload", async () => {
    await saveAudioProgressToDB({ articleId: "episode", currentTime: 125, duration: 3600, updatedAt: 12345 });
    await closeDB();
    await expect(getAudioProgressMapFromDB()).resolves.toEqual({
      episode: { currentTime: 125, duration: 3600, updatedAt: 12345 },
    });
  });

  it("coalesces overlapping audio-progress writes without dropping the newest position", async () => {
    const originalPut = IDBObjectStore.prototype.put;
    const puts = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value: unknown) {
      return originalPut.call(this, value);
    });
    await Promise.all([1, 2, 3, 4, 5].map((currentTime) => saveAudioProgressToDB({
      articleId: "episode",
      currentTime,
      duration: 600,
      updatedAt: currentTime,
    })));

    expect(puts.mock.calls.filter(([value]) => (value as { articleId?: string }).articleId === "episode").length).toBeLessThan(5);
    await expect(getAudioProgressMapFromDB()).resolves.toEqual({
      episode: { currentTime: 5, duration: 600, updatedAt: 5 },
    });
  });

  it("re-resolves a redirect when an old-ID progress transaction was queued behind refresh", async () => {
    await saveAudioProgressToDB({ articleId: "race-old", currentTime: 100, duration: 600, updatedAt: 1 });
    const db = await getDB();
    const refreshTx = db.transaction("audioProgress", "readwrite");
    const refreshStore = refreshTx.objectStore("audioProgress");
    refreshStore.put({ articleId: "race-canonical", currentTime: 100, duration: 600, updatedAt: 1 });
    refreshStore.delete("race-old");
    const queuedWrite = saveAudioProgressToDB({ articleId: "race-old", currentTime: 200, duration: 600, updatedAt: 2 });
    const refreshComplete = new Promise<void>((resolve, reject) => {
      refreshTx.oncomplete = () => {
        redirectAudioProgressWrites(new Map([["race-old", "race-canonical"]]));
        resolve();
      };
      refreshTx.onerror = refreshTx.onabort = () => reject(refreshTx.error || new Error("refresh transaction failed"));
    });

    await Promise.all([refreshComplete, queuedWrite]);
    await expect(getAudioProgressMapFromDB()).resolves.toEqual({
      "race-canonical": { currentTime: 200, duration: 600, updatedAt: 2 },
    });
  });

  it("resumes a partial localStorage migration when feeds already exist", async () => {
    const legacyFeed = {
      id: "feed-1", title: "Feed", feedUrl: "https://example.com/feed.xml", siteUrl: "https://example.com",
      category: "legacy", unreadCount: 0,
    };
    await replaceFeedsInDB([legacyFeed]);

    await migrateFeedsAndAppStateFromLocalStorageIfNeeded([legacyFeed], {
      categories: ["legacy"],
      audioProgressMap: { episode: { currentTime: 120, duration: 600, updatedAt: 20 } },
    });

    await expect(getAudioProgressMapFromDB()).resolves.toEqual({
      episode: { currentTime: 120, duration: 600, updatedAt: 20 },
    });
  });

  it("does not overwrite current settings or newer progress while resuming migration", async () => {
    const legacyFeed = {
      id: "feed-1", title: "Feed", feedUrl: "https://example.com/feed.xml", siteUrl: "https://example.com",
      category: "current", unreadCount: 0,
    };
    await replaceFeedsInDB([legacyFeed]);
    await saveAppStateToDB({ categories: ["current"] });
    await saveAudioProgressToDB({ articleId: "episode", currentTime: 300, duration: 600, updatedAt: 30 });

    await migrateFeedsAndAppStateFromLocalStorageIfNeeded([legacyFeed], {
      categories: ["stale"],
      audioProgressMap: { episode: { currentTime: 120, duration: 600, updatedAt: 20 } },
    });

    await expect(getAppStateFromDB()).resolves.toMatchObject({ categories: ["current"] });
    await expect(getAudioProgressMapFromDB()).resolves.toEqual({
      episode: { currentTime: 300, duration: 600, updatedAt: 30 },
    });
  });
  it("removes the obsolete Taixian demo article from existing storage", async () => {
    const obsolete = article("init-taixian-1", "feed-taixian");
    const retained = article("retained");
    await saveArticlesToDB([obsolete, retained]);

    await expect(loadStoredArticlesAsync()).resolves.toEqual([
      expect.objectContaining({ id: "retained" }),
    ]);
    await expect(getAllArticlesFromDB()).resolves.toEqual([
      expect.objectContaining({ id: "retained" }),
    ]);
  });

  it("does not replace a stored publication date with a moving demo timestamp", async () => {
    const publishedAt = "2024-02-03T04:05:06.000Z";
    await saveArticlesToDB([{
      ...article("real-crossing", "feed-crossing"),
      title: "「模型能力已经够了，要卷就卷 infra」｜对谈戴冠兰：Runta 创始人",
      pubDate: publishedAt,
    }]);

    await expect(loadStoredArticlesAsync()).resolves.toEqual([
      expect.objectContaining({ id: "real-crossing", pubDate: publishedAt }),
    ]);
  });

  it("normalizes legacy BidClub fields into the canonical enrichment reference", () => {
    const legacy = {
      ...article("legacy-bidclub"),
      bidclubUrl: "https://bidclub.ai/e/episode-42",
      bidclubSlug: "episode-42",
    } as Article;

    const normalized = normalizeStoredArticle(legacy);

    expect(normalized.enrichment).toEqual({
      provider: "bidclub",
      episodeId: "episode-42",
      episodeUrl: "https://bidclub.ai/e/episode-42",
      status: "candidate",
      matchedBy: "legacy",
    });
    expect(normalized).not.toHaveProperty("bidclubUrl");
    expect(normalized).not.toHaveProperty("bidclubSlug");
  });

  it("downgrades pre-API available references but preserves API-verified ones", () => {
    const legacyAvailable = normalizeStoredArticle({
      ...article("legacy-available"),
      enrichment: {
        provider: "bidclub",
        episodeId: "episode-42",
        status: "available",
        matchedBy: "source-url",
      },
    });
    const apiAvailable = normalizeStoredArticle({
      ...article("api-available"),
      enrichment: {
        provider: "bidclub",
        episodeId: "episode-43",
        status: "available",
        matchedBy: "api",
      },
    });

    expect(legacyAvailable.enrichment).toMatchObject({ status: "candidate", matchedBy: "source-url" });
    expect(apiAvailable.enrichment).toMatchObject({ status: "available", matchedBy: "api" });
  });

  it("keeps read, starred and AI summary state when an RSS id changes", () => {
    const old = { ...article("old"), read: true, starred: true, aiSummary: "keep" };
    const fresh = { ...article("new"), title: old.title, pubDate: old.pubDate };
    const result = mergeFetchedFeedArticles([old], [fresh], new Set(["feed-1"]));
    expect(result.articles[0]).toMatchObject({ id: "new", read: true, starred: true, aiSummary: "keep" });
  });

  it("collapses duplicate legacy and canonical copies during refresh", () => {
    const canonical = { ...article("canonical"), title: "Same episode", starred: true };
    const legacy = { ...article("legacy"), title: "Same episode", starred: true };
    const fresh = { ...article("canonical"), title: "Same episode" };

    const result = mergeFetchedFeedArticles(
      [canonical, legacy],
      [fresh],
      new Set(["feed-1"])
    );

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]).toMatchObject({ id: "canonical", starred: true });
    expect(result.articleIdMap.get("legacy")).toBe("canonical");
  });

  it("does not migrate state or enrichment between different same-day episodes", () => {
    const pubDate = "2026-08-18T08:00:00.000Z";
    const old = {
      ...article("old"),
      title: "Episode Alpha",
      pubDate,
      read: true,
      enrichment: {
        provider: "bidclub" as const,
        episodeId: "alpha",
        status: "available" as const,
        matchedBy: "source-url" as const,
      },
    };
    const fresh = { ...article("new"), title: "Episode Beta", pubDate };

    const result = mergeFetchedFeedArticles([old], [fresh], new Set(["feed-1"]));

    expect(result.articles[0]).toMatchObject({ id: "new", read: false });
    expect(result.articles[0]).not.toHaveProperty("enrichment");
  });

  it("moves saved audio progress when a refreshed episode id changes", () => {
    const progress = { currentTime: 125, duration: 3600, updatedAt: 12345 };
    const result = migrateAudioProgressMap(
      { old: progress },
      new Map([["old", "new"]])
    );

    expect(result).toEqual({ new: progress });
  });

  it("preserves article state patches", async () => {
    await saveArticlesToDB([article("a")]);
    await updateArticleInDB("a", { read: true, starred: true, aiSummary: "summary" });
    await expect(getAllArticlesFromDB()).resolves.toMatchObject([
      { id: "a", read: true, starred: true, aiSummary: "summary" },
    ]);
  });

  it("updates a batch of article states in one transaction", async () => {
    await saveArticlesToDB([article("a"), article("b"), article("untouched")]);

    await updateArticlesInDB(["a", "b", "a"], { read: true });

    await expect(getAllArticlesFromDB()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "a", read: true }),
      expect.objectContaining({ id: "b", read: true }),
      expect.objectContaining({ id: "untouched", read: false }),
    ]));
  });

  it("rolls back every article when an atomic batch contains an invalid id", async () => {
    await saveArticlesToDB([article("a"), article("b")]);

    await expect(updateArticlesInDB(["a", "missing", "b"], { read: true }))
      .rejects.toThrow("Article not found: missing");

    await expect(getAllArticlesFromDB()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "a", read: false }),
      expect.objectContaining({ id: "b", read: false }),
    ]));
  });

  it("persists, updates and deletes article notes independently", async () => {
    const note: ArticleNote = {
      id: "note-1",
      articleId: "a",
      source: "transcript",
      quote: "A useful excerpt",
      transcriptStartMs: 125000,
      createdAt: 1,
      updatedAt: 1,
    };
    await saveArticleNoteToDB(note);
    await saveArticleNoteToDB({ ...note, note: "Remember this", updatedAt: 2 });

    await expect(getArticleNotesFromDB("a")).resolves.toEqual([
      { ...note, note: "Remember this", updatedAt: 2 },
    ]);
    await expect(getArticleNotesFromDB("other")).resolves.toEqual([]);

    await deleteArticleNoteFromDB(note.id);
    await expect(getArticleNotesFromDB("a")).resolves.toEqual([]);
  });

  it("deletes multiple article notes in one transaction", async () => {
    const base: ArticleNote = { id: "bulk-a", articleId: "a", source: "body", quote: "A", createdAt: 1, updatedAt: 1 };
    await saveArticleNoteToDB(base);
    await saveArticleNoteToDB({ ...base, id: "bulk-b", quote: "B" });
    await deleteArticleNotesFromDB(["bulk-a", "bulk-b"]);
    await expect(getAllArticleNotesFromDB()).resolves.toEqual([]);
  });

  it("repoints notes without changing their IDs when an article ID migrates", async () => {
    const oldNote: ArticleNote = {
      id: "stable-note-id",
      articleId: "legacy-article",
      source: "body",
      quote: "Keep this excerpt",
      createdAt: 1,
      updatedAt: 1,
    };
    const untouchedNote: ArticleNote = {
      ...oldNote,
      id: "other-note",
      articleId: "other-article",
    };
    await saveArticleNoteToDB(oldNote);
    await saveArticleNoteToDB(untouchedNote);

    await migrateArticleNoteIdsInDB(new Map([["legacy-article", "canonical-article"]]));

    await expect(getArticleNotesFromDB("legacy-article")).resolves.toEqual([]);
    await expect(getArticleNotesFromDB("canonical-article")).resolves.toMatchObject([
      { id: "stable-note-id", articleId: "canonical-article", quote: "Keep this excerpt" },
    ]);
    await expect(getArticleNotesFromDB("other-article")).resolves.toMatchObject([
      { id: "other-note", articleId: "other-article" },
    ]);
  });

  it("returns all notes by most recently updated first", async () => {
    const base: ArticleNote = { id: "older", articleId: "a", source: "body", quote: "Older", createdAt: 1, updatedAt: 2 };
    await saveArticleNoteToDB(base);
    await saveArticleNoteToDB({ ...base, id: "newer", quote: "Newer", updatedAt: 5 });

    await expect(getAllArticleNotesFromDB()).resolves.toMatchObject([
      { id: "newer" },
      { id: "older" },
    ]);
  });

  it("deletes a feed without allowing deleted articles to reappear", async () => {
    await saveArticlesToDB([article("a"), article("b", "feed-2")]);
    await deleteArticlesByFeedIdFromDB("feed-1");
    await expect(getAllArticlesFromDB()).resolves.toMatchObject([{ id: "b", feedId: "feed-2" }]);
  });

  it("deletes a feed and its articles in one transaction", async () => {
    await replaceFeedsInDB([{ id: "feed-1", title: "Feed", feedUrl: "https://example.com/feed", siteUrl: "https://example.com", category: "未分类", unreadCount: 1 }]);
    await saveArticlesToDB([article("a")]);

    await deleteFeedAndArticlesFromDB("feed-1");

    await expect(getFeedsFromDB()).resolves.toEqual([]);
    await expect(getAllArticlesFromDB()).resolves.toEqual([]);
  });

  it("rejects and rolls back feed deletion when its transaction aborts", async () => {
    const feed = { id: "feed-1", title: "Feed", feedUrl: "https://example.com/feed", siteUrl: "https://example.com", category: "未分类", unreadCount: 1 };
    const storedArticle = article("a");
    await replaceFeedsInDB([feed]);
    await saveArticlesToDB([storedArticle]);
    const originalDelete = IDBObjectStore.prototype.delete;
    const remove = vi.spyOn(IDBObjectStore.prototype, "delete").mockImplementation(function (this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
      if (this.name === "feeds") throw new Error("simulated transaction abort");
      return originalDelete.call(this, key);
    });

    try {
      await expect(deleteFeedAndArticlesFromDB("feed-1")).rejects.toThrow("simulated transaction abort");
      await expect(getFeedsFromDB()).resolves.toEqual([feed]);
      await expect(getAllArticlesFromDB()).resolves.toEqual([storedArticle]);
    } finally {
      remove.mockRestore();
    }
  });

  it("updates a feed and removes its old articles in one transaction", async () => {
    const original = { id: "feed-1", title: "Old", feedUrl: "https://example.com/old", siteUrl: "https://example.com", category: "未分类", unreadCount: 1 };
    const updated = { ...original, title: "Updated", feedUrl: "https://example.com/new" };
    await replaceFeedsInDB([original]);
    await saveArticlesToDB([article("old-article")]);

    await updateFeedAndDeleteArticlesFromDB(updated);

    await expect(getFeedsFromDB()).resolves.toEqual([updated]);
    await expect(getAllArticlesFromDB()).resolves.toEqual([]);
  });

  it("rolls back a feed URL update when its transaction aborts", async () => {
    const original = { id: "feed-1", title: "Old", feedUrl: "https://example.com/old", siteUrl: "https://example.com", category: "未分类", unreadCount: 1 };
    const updated = { ...original, feedUrl: "https://example.com/new" };
    const storedArticle = article("old-article");
    await replaceFeedsInDB([original]);
    await saveArticlesToDB([storedArticle]);
    const originalPut = IDBObjectStore.prototype.put;
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value: unknown) {
      if (this.name === "feeds") throw new Error("simulated feed update abort");
      return originalPut.call(this, value);
    });

    try {
      await expect(updateFeedAndDeleteArticlesFromDB(updated)).rejects.toThrow("simulated feed update abort");
      await expect(getFeedsFromDB()).resolves.toEqual([original]);
      await expect(getAllArticlesFromDB()).resolves.toEqual([storedArticle]);
    } finally {
      put.mockRestore();
    }
  });

  it("atomically replaces refreshed feed records so migrated ids cannot reappear", async () => {
    await saveArticlesToDB([
      { ...article("legacy"), starred: true },
      article("unchanged", "feed-2"),
    ]);

    await replaceArticlesForFeedsInDB(
      ["feed-1"],
      [{ ...article("canonical"), starred: true }]
    );

    const stored = await getAllArticlesFromDB();
    expect(stored.map((item) => item.id).sort()).toEqual(["canonical", "unchanged"]);
    expect(stored.find((item) => item.id === "canonical")).toMatchObject({ starred: true });
  });

  it("rejects a refresh replacement failure without changing the stored snapshot", async () => {
    const legacy = { ...article("legacy"), read: true };
    await saveArticlesToDB([legacy]);
    const originalPut = IDBObjectStore.prototype.put;
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value: unknown) {
      if ((value as Article).id === "canonical") throw new Error("simulated refresh persistence failure");
      return originalPut.call(this, value);
    });

    await expect(replaceArticlesForFeedsAndMigrateReferencesInDB(
      ["feed-1"],
      [{ ...article("canonical"), read: true }],
      new Map([["legacy", "canonical"]]),
      { playlistIds: ["canonical"] }
    )).rejects.toThrow("simulated refresh persistence failure");

    await expect(getAllArticlesFromDB()).resolves.toEqual([legacy]);
    put.mockRestore();
  });

  it("keeps refresh replacement behavior unchanged after a successful transaction", async () => {
    await saveArticlesToDB([{ ...article("legacy"), starred: true }]);
    await replaceArticlesForFeedsAndMigrateReferencesInDB(
      ["feed-1"],
      [{ ...article("canonical"), starred: true }],
      new Map([["legacy", "canonical"]]),
      { playlistIds: ["canonical"] }
    );

    await expect(getAllArticlesFromDB()).resolves.toEqual([
      expect.objectContaining({ id: "canonical", starred: true }),
    ]);
    await expect(createDataBackup()).resolves.toMatchObject({
      data: { appState: { playlistIds: ["canonical"] }, audioProgress: [] },
    });
  });

  it("migrates multiple old audio-progress records to one canonical article by newest updatedAt", async () => {
    await saveArticlesToDB([article("old-a"), article("old-b"), article("old-c")]);
    await Promise.all([
      saveAudioProgressToDB({ articleId: "old-a", currentTime: 100, duration: 600, updatedAt: 100 }),
      saveAudioProgressToDB({ articleId: "old-b", currentTime: 200, duration: 600, updatedAt: 200 }),
      saveAudioProgressToDB({ articleId: "old-c", currentTime: 150, duration: 600, updatedAt: 150 }),
    ]);

    await replaceArticlesForFeedsAndMigrateReferencesInDB(
      ["feed-1"],
      [article("canonical")],
      new Map([["old-a", "canonical"], ["old-b", "canonical"], ["old-c", "canonical"]]),
    );

    await expect(getAudioProgressMapFromDB()).resolves.toEqual({
      canonical: { currentTime: 200, duration: 600, updatedAt: 200 },
    });
  });

  it("keeps a newer canonical audio-progress record during article-id migration", async () => {
    await saveArticlesToDB([article("old")]);
    await Promise.all([
      saveAudioProgressToDB({ articleId: "old", currentTime: 200, duration: 600, updatedAt: 200 }),
      saveAudioProgressToDB({ articleId: "canonical", currentTime: 300, duration: 600, updatedAt: 300 }),
    ]);

    await replaceArticlesForFeedsAndMigrateReferencesInDB(
      ["feed-1"],
      [article("canonical")],
      new Map([["old", "canonical"]]),
    );

    await expect(getAudioProgressMapFromDB()).resolves.toEqual({
      canonical: { currentTime: 300, duration: 600, updatedAt: 300 },
    });
  });

  it("rolls back article and audio-progress migration together when writing canonical progress fails", async () => {
    const old = article("old");
    await saveArticlesToDB([old]);
    await saveAudioProgressToDB({ articleId: "old", currentTime: 200, duration: 600, updatedAt: 200 });
    const originalPut = IDBObjectStore.prototype.put;
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value: unknown) {
      if ((value as { articleId?: string }).articleId === "canonical") throw new Error("simulated progress migration failure");
      return originalPut.call(this, value);
    });

    await expect(replaceArticlesForFeedsAndMigrateReferencesInDB(
      ["feed-1"],
      [article("canonical")],
      new Map([["old", "canonical"]]),
    )).rejects.toThrow("simulated progress migration failure");

    await expect(getAllArticlesFromDB()).resolves.toEqual([old]);
    await expect(getAudioProgressMapFromDB()).resolves.toEqual({
      old: { currentTime: 200, duration: 600, updatedAt: 200 },
    });
    put.mockRestore();
  });

  it("keeps legacy data when the IndexedDB migration write fails", async () => {
    const legacy = JSON.stringify([article("legacy")]);
    localStorage.setItem("inoreader_articles_v2", legacy);
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new Error("simulated write failure");
    });

    await expect(migrateFromLocalStorageIfNeeded()).rejects.toThrow("simulated write failure");
    expect(localStorage.getItem("inoreader_articles_v2")).toBe(legacy);
    expect(localStorage.getItem("inoreader_articles_v2_migrated")).toBeNull();

    put.mockRestore();
  });

  it("preserves AI config when unrelated app state is saved", async () => {
    await saveAppStateToDB({
      aiConfig: {
        enabled: true,
        providerPreset: "custom",
        baseURL: "https://api.example.com/v1",
        model: "model-1",
      },
    });
    await saveAppStateToDB({ categories: ["未分类"], playlistIds: ["a"] });

    const backup = await createDataBackup();
    expect(backup.data.appState).toMatchObject({
      categories: ["未分类"],
      playlistIds: ["a"],
      aiConfig: {
        enabled: true,
        baseURL: "https://api.example.com/v1",
        model: "model-1",
      },
    });
  });

  it("excludes AI secrets from backups and preserves them across same-endpoint restore", async () => {
    await saveAppStateToDB({
      aiConfig: {
        enabled: true,
        providerPreset: "custom",
        baseURL: "https://api.example.com/v1",
        model: "model-1",
      },
    });
    await saveSecretToDB("ai", {
      apiKey: "super-secret-key",
      baseURL: "https://api.example.com/v1",
    });

    const backup = await createDataBackup();
    expect(JSON.stringify(backup)).toContain("https://api.example.com/v1");
    expect(JSON.stringify(backup)).not.toContain("super-secret-key");

    await restoreDataBackup(JSON.stringify(backup));
    await expect(getSecretFromDB("ai")).resolves.toEqual({
      apiKey: "super-secret-key",
      baseURL: "https://api.example.com/v1",
    });
  });

  it("clears a saved API key when a backup switches to a different AI endpoint", async () => {
    await saveAppStateToDB({
      aiConfig: {
        enabled: true,
        providerPreset: "custom",
        baseURL: "https://old.example.com/v1",
        model: "old-model",
      },
    });
    await saveSecretToDB("ai", {
      apiKey: "old-secret",
      baseURL: "https://old.example.com/v1",
    });

    const cleanBackup = await createDataBackup();
    const changed = {
      ...cleanBackup,
      data: {
        ...cleanBackup.data,
        appState: {
          ...(cleanBackup.data.appState || {}),
          aiConfig: {
            enabled: true,
            providerPreset: "custom",
            baseURL: "https://new.example.com/v1",
            model: "new-model",
          },
        },
      },
    };
    const payload = JSON.stringify(changed.data);
    let hash = 2166136261;
    for (let index = 0; index < payload.length; index += 1) {
      hash ^= payload.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    changed.checksum = (hash >>> 0).toString(16).padStart(8, "0");

    await restoreDataBackup(JSON.stringify(changed));
    await expect(getSecretFromDB("ai")).resolves.toBeNull();
  });

  it("exports and restores a checksummed business-data backup", async () => {
    await replaceFeedsInDB([{
      id: "feed-1", title: "Feed", feedUrl: "https://example.com/feed.xml", siteUrl: "https://example.com",
      category: "未分类", unreadCount: 1,
    }]);
    await saveArticlesToDB([article("backup-article")]);
    await saveAppStateToDB({ playlistIds: ["backup-article"], categories: ["未分类"] });
    const backup = await createDataBackup();
    expect(backup.version).toBe(1);
    expect(backup.checksum).toMatch(/^[0-9a-f]{8}$/);

    await replaceFeedsInDB([]);
    await restoreDataBackup(JSON.stringify(backup));
    await expect(getAllArticlesFromDB()).resolves.toMatchObject([{ id: "backup-article" }]);
    await expect(getFeedsFromDB()).resolves.toMatchObject([{ id: "feed-1" }]);
    await expect(restoreDataBackup(JSON.stringify({ ...backup, checksum: "bad" }))).rejects.toThrow("校验");
  });

  it("includes dedicated audio progress in version-1 backups and restores it", async () => {
    await saveAudioProgressToDB({ articleId: "backup-episode", currentTime: 88, duration: 600, updatedAt: 9 });
    const backup = await createDataBackup();
    expect(backup.version).toBe(1);
    expect(backup.data.audioProgress).toEqual([
      { articleId: "backup-episode", currentTime: 88, duration: 600, updatedAt: 9 },
    ]);

    await restoreDataBackup(JSON.stringify(backup));
    await expect(getAudioProgressMapFromDB()).resolves.toEqual({
      "backup-episode": { currentTime: 88, duration: 600, updatedAt: 9 },
    });
  });

  it("restores legacy version-1 backups that keep progress in appState", async () => {
    const data = {
      feeds: [],
      articles: [],
      notes: [],
      appState: {
        playlistIds: ["legacy-episode"],
        audioProgressMap: { "legacy-episode": { currentTime: 33, duration: 600, updatedAt: 4 } },
      },
    };
    const legacyBackup = {
      version: 1 as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      checksum: backupChecksum(data),
      data,
    };

    await restoreDataBackup(JSON.stringify(legacyBackup));
    await expect(getAudioProgressMapFromDB()).resolves.toEqual({
      "legacy-episode": { currentTime: 33, duration: 600, updatedAt: 4 },
    });
    await expect(getAppStateFromDB()).resolves.not.toHaveProperty("audioProgressMap");
  });
});
