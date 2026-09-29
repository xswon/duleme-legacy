import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Article, AudioProgress } from "../src/types";
import { formatAudioTime, resolveAudioUrl } from "../src/hooks/useAudioPlayer";
import { useSharedAudioPlayer, type SharedAudioPlayer } from "../src/hooks/useAudioPlayer";
import {
  closeDB,
  getAudioProgressMapFromDB,
  redirectAudioProgressWrites,
  replaceArticlesForFeedsAndMigrateReferencesInDB,
  saveArticlesToDB,
  saveAudioProgressToDB,
} from "../src/services/dbService";
import { migrateAudioProgressMap } from "../src/services/rssService";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const article = (id: string): Article => ({
  id,
  feedId: "feed-1",
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
});

describe("audio player helpers", () => {
  it("formats playback time consistently", () => {
    expect(formatAudioTime(0)).toBe("0:00");
    expect(formatAudioTime(65.9)).toBe("1:05");
  });
  it("uses the proxy for supported remote audio hosts", () => {
    expect(resolveAudioUrl("http://example.com/a.mp3")).toBe("/api/proxy-audio?url=http%3A%2F%2Fexample.com%2Fa.mp3");
    expect(resolveAudioUrl("/api/proxy-audio?url=x")).toBe("/api/proxy-audio?url=x");
  });

  it("keeps one media element while switching episodes and persists its progress", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    const onProgress = vi.fn();
    const onEnded = vi.fn();
    let player: SharedAudioPlayer | undefined;
    function Harness() {
      player = useSharedAudioPlayer(onProgress, onEnded);
      return React.createElement("audio", { ref: player.audioRef, onTimeUpdate: player.handleTimeUpdate, onEnded: player.handleEnded });
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(React.createElement(Harness)));

    await act(async () => player?.playArticle("one", "/one.mp3", { currentTime: 12, duration: 120 }));
    expect(container.querySelectorAll("audio")).toHaveLength(1);
    expect(player?.articleId).toBe("one");
    expect(play).toHaveBeenCalled();

    await act(async () => player?.playArticle("two", "/two.mp3"));
    expect(container.querySelectorAll("audio")).toHaveLength(1);
    expect(player?.articleId).toBe("two");
    expect(pause).toHaveBeenCalled();

    const audio = container.querySelector("audio") as HTMLAudioElement;
    Object.defineProperty(audio, "duration", { configurable: true, value: 180 });
    audio.currentTime = 31;
    await act(async () => audio.dispatchEvent(new Event("timeupdate", { bubbles: true })));
    await act(async () => audio.dispatchEvent(new Event("ended", { bubbles: true })));
    expect(onProgress).toHaveBeenLastCalledWith("two", 31, 180);
    expect(onEnded).toHaveBeenCalledWith("two");
    act(() => root.unmount());
  });

  it("coalesces normal progress and flushes the latest position for lifecycle events", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    const onProgress = vi.fn();
    let player: SharedAudioPlayer | undefined;
    function Harness() {
      player = useSharedAudioPlayer(onProgress);
      return React.createElement("audio", {
        ref: player.audioRef,
        onTimeUpdate: player.handleTimeUpdate,
        onPause: player.handlePause,
        onEnded: player.handleEnded,
      });
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(React.createElement(Harness)));
    await act(async () => player?.loadArticle("one", "/one.mp3"));
    const audio = container.querySelector("audio") as HTMLAudioElement;
    Object.defineProperty(audio, "duration", { configurable: true, value: 180 });

    for (const currentTime of [1, 5, 10, 15]) {
      audio.currentTime = currentTime;
      await act(async () => audio.dispatchEvent(new Event("timeupdate", { bubbles: true })));
      await act(async () => vi.advanceTimersByTimeAsync(5_000));
    }
    expect(onProgress).toHaveBeenCalledTimes(0);
    audio.currentTime = 20;
    await act(async () => audio.dispatchEvent(new Event("timeupdate", { bubbles: true })));
    expect(onProgress).toHaveBeenLastCalledWith("one", 20, 180);

    audio.currentTime = 21;
    await act(async () => audio.dispatchEvent(new Event("timeupdate", { bubbles: true })));
    await act(async () => audio.dispatchEvent(new Event("pause", { bubbles: true })));
    expect(onProgress).toHaveBeenLastCalledWith("one", 21, 180);

    audio.currentTime = 30;
    await act(async () => audio.dispatchEvent(new Event("timeupdate", { bubbles: true })));
    await act(async () => player?.loadArticle("two", "/two.mp3"));
    expect(onProgress).toHaveBeenLastCalledWith("one", 30, 180);

    audio.currentTime = 7;
    await act(async () => audio.dispatchEvent(new Event("timeupdate", { bubbles: true })));
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(onProgress).toHaveBeenLastCalledWith("two", 7, 180);

    audio.currentTime = 8;
    await act(async () => audio.dispatchEvent(new Event("timeupdate", { bubbles: true })));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(onProgress).toHaveBeenLastCalledWith("two", 8, 180);

    audio.currentTime = 9;
    await act(async () => audio.dispatchEvent(new Event("timeupdate", { bubbles: true })));
    await act(async () => player?.stop());
    expect(onProgress).toHaveBeenLastCalledWith("two", 9, 180);
    act(() => root.unmount());
  });

  it("pauses audio mounted after the player lifecycle effect on unmount", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    let player: SharedAudioPlayer | undefined;
    function Harness({ renderAudio }: { renderAudio: boolean }) {
      player = useSharedAudioPlayer();
      return renderAudio ? React.createElement("audio", { ref: player.audioRef }) : null;
    }
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => root.render(React.createElement(Harness, { renderAudio: false })));
    await act(async () => root.render(React.createElement(Harness, { renderAudio: true })));
    await act(async () => player?.playArticle("late-audio", "/episode.mp3"));
    expect(play).toHaveBeenCalled();

    act(() => root.unmount());
    expect(pause).toHaveBeenCalled();
  });

  it("keeps active playback and all future progress on the canonical ID after refresh", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const load = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    let player: SharedAudioPlayer | undefined;
    let progressMap: Record<string, AudioProgress> = {};
    let setProgressMap: React.Dispatch<React.SetStateAction<Record<string, AudioProgress>>> | undefined;
    const writes: Promise<void>[] = [];
    let timestamp = 0;
    function Harness() {
      const [map, setMap] = React.useState<Record<string, AudioProgress>>({});
      progressMap = map;
      setProgressMap = setMap;
      player = useSharedAudioPlayer((articleId, currentTime, duration) => {
        const progress = { currentTime, duration, updatedAt: ++timestamp };
        writes.push(saveAudioProgressToDB({ articleId, ...progress }));
        setMap((previous) => ({ ...previous, [articleId]: progress }));
      });
      return React.createElement("audio", {
        ref: player.audioRef,
        onTimeUpdate: player.handleTimeUpdate,
        onPause: player.handlePause,
      });
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(React.createElement(Harness)));
    await act(async () => player?.playArticle("playing-old", "/episode.mp3", { currentTime: 0, duration: 600 }));
    const audio = container.querySelector("audio") as HTMLAudioElement;
    Object.defineProperty(audio, "duration", { configurable: true, value: 600 });
    await act(async () => player?.seekTo(100));
    await Promise.all(writes.splice(0));
    await saveArticlesToDB([article("playing-old")]);

    await replaceArticlesForFeedsAndMigrateReferencesInDB(
      ["feed-1"],
      [article("playing-canonical")],
      new Map([["playing-old", "playing-canonical"]]),
    );
    await act(async () => {
      redirectAudioProgressWrites(new Map([["playing-old", "playing-canonical"]]));
      setProgressMap?.((previous) => migrateAudioProgressMap(previous, new Map([["playing-old", "playing-canonical"]])));
      player?.migrateArticleId(new Map([["playing-old", "playing-canonical"]]));
    });

    expect(player?.articleId).toBe("playing-canonical");
    expect(player?.isPlaying).toBe(true);
    expect(player?.currentTime).toBe(100);
    expect(load).toHaveBeenCalledTimes(1);
    audio.currentTime = 120;
    await act(async () => audio.dispatchEvent(new Event("timeupdate", { bubbles: true })));
    await act(async () => audio.dispatchEvent(new Event("pause", { bubbles: true })));
    await Promise.all(writes.splice(0));

    await expect(getAudioProgressMapFromDB()).resolves.toEqual({
      "playing-canonical": { currentTime: 120, duration: 600, updatedAt: 2 },
    });
    expect(progressMap).toEqual({
      "playing-canonical": { currentTime: 120, duration: 600, updatedAt: 2 },
    });
    act(() => root.unmount());
  });

  it("does not re-key the active player when refresh persistence fails", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    let player: SharedAudioPlayer | undefined;
    function Harness() {
      player = useSharedAudioPlayer();
      return React.createElement("audio", { ref: player.audioRef });
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(React.createElement(Harness)));
    await act(async () => player?.playArticle("failed-old", "/episode.mp3", { currentTime: 80, duration: 600 }));
    await saveArticlesToDB([article("failed-old")]);
    const originalPut = IDBObjectStore.prototype.put;
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value: unknown) {
      if ((value as Article).id === "failed-canonical") throw new Error("simulated refresh failure");
      return originalPut.call(this, value);
    });

    await expect(replaceArticlesForFeedsAndMigrateReferencesInDB(
      ["feed-1"],
      [article("failed-canonical")],
      new Map([["failed-old", "failed-canonical"]]),
    )).rejects.toThrow("simulated refresh failure");

    expect(player?.articleId).toBe("failed-old");
    expect(player?.currentTime).toBe(80);
    put.mockRestore();
    act(() => root.unmount());
  });

  it("redirects an already queued progress write to the canonical ID", async () => {
    const pendingWrite = saveAudioProgressToDB({
      articleId: "queued-old",
      currentTime: 150,
      duration: 600,
      updatedAt: 1,
    });
    redirectAudioProgressWrites(new Map([["queued-old", "queued-canonical"]]));
    await pendingWrite;

    await expect(getAudioProgressMapFromDB()).resolves.toEqual({
      "queued-canonical": { currentTime: 150, duration: 600, updatedAt: 1 },
    });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = "";
});
