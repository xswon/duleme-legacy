import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDB, getAppStateFromDB } from "../src/services/dbService";
import { useReaderPersistence } from "../src/hooks/useReaderPersistence";
import type { AudioProgress, Feed } from "../src/types";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let latestComplete: (() => void) | undefined;
let latestState = { ready: false, complete: false };

function Harness() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [feedOrderByFolder, setFeedOrderByFolder] = useState<Record<string, string[]>>({});
  const [playlistIds, setPlaylistIds] = useState<string[]>([]);
  const [audioProgressMap, setAudioProgressMap] = useState<Record<string, AudioProgress>>({});
  const persistence = useReaderPersistence({
    feeds,
    setFeeds,
    categories,
    setCategories,
    feedOrderByFolder,
    setFeedOrderByFolder,
    playlistIds,
    setPlaylistIds,
    audioProgressMap,
    setAudioProgressMap,
    showToast: () => {},
  });
  latestComplete = persistence.completeOnboarding;
  latestState = {
    ready: persistence.isAppStateReady,
    complete: persistence.isOnboardingComplete,
  };
  return <div data-ready={String(persistence.isAppStateReady)} data-complete={String(persistence.isOnboardingComplete)} />;
}

async function waitFor(predicate: () => boolean | Promise<boolean>) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await predicate()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  throw new Error("Timed out waiting for onboarding persistence");
}

async function resetStorage() {
  await closeDB();
  const databases = await indexedDB.databases();
  await Promise.all(databases.map(({ name }) => name ? new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  }) : Promise.resolve()));
  localStorage.clear();
  latestComplete = undefined;
  latestState = { ready: false, complete: false };
}

beforeEach(resetStorage);

afterEach(() => {
  document.body.innerHTML = "";
});

describe("first-run onboarding persistence", () => {
  it("shows onboarding for a new empty profile and remembers completion", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => root.render(<Harness />));
    await waitFor(() => latestState.ready);
    expect(latestState.complete).toBe(false);

    await act(async () => latestComplete?.());
    await waitFor(() => latestState.complete);
    await waitFor(async () => (await getAppStateFromDB())?.onboardingCompleted === true);

    expect((await getAppStateFromDB())?.onboardingCompleted).toBe(true);
    await act(async () => root.unmount());
  });
});
