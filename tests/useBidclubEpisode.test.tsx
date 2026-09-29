import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BidclubEpisode } from "../src/types";

const fetchBidclubEpisodeMock = vi.hoisted(() => vi.fn());
vi.mock("../src/services/rssService", () => ({
  fetchBidclubEpisode: fetchBidclubEpisodeMock,
}));

import { useBidclubEpisode } from "../src/hooks/useBidclubEpisode";
import { setCachedBidclubEpisode } from "../src/services/bidclubEpisodeCache";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const episode = (title: string, overrides: Partial<BidclubEpisode> = {}): BidclubEpisode => ({
  title,
  dek: "",
  dekAlt: "",
  lang: "",
  langAlt: "",
  tldrHtml: "",
  digestHtml: "",
  transcriptHtml: "",
  tldrAltHtml: "",
  digestAltHtml: "",
  chapters: [],
  chaptersAlt: [],
  ...overrides,
});

afterEach(() => {
  fetchBidclubEpisodeMock.mockReset();
  localStorage.clear();
  vi.useRealTimers();
});

describe("useBidclubEpisode", () => {
  it("never exposes the previous episode under a new reference", async () => {
    const pending = new Map<string, (value: BidclubEpisode) => void>();
    fetchBidclubEpisodeMock.mockImplementation(
      (reference: string) => new Promise<BidclubEpisode>((resolve) => pending.set(reference, resolve))
    );

    const observations: Array<{ reference?: string; title?: string; loading: boolean }> = [];
    function Harness({ reference }: { reference?: string }) {
      const result = useBidclubEpisode(reference);
      observations.push({ reference, title: result.episode?.title, loading: result.loading });
      return null;
    }

    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<Harness reference="episode-a" />));
    await act(async () => pending.get("episode-a")?.(episode("Episode A")));

    observations.length = 0;
    await act(async () => root.render(<Harness reference="episode-b" />));

    expect(observations.some((item) => item.reference === "episode-b" && item.title === "Episode A")).toBe(false);
    expect(observations.at(-1)).toMatchObject({ reference: "episode-b", title: undefined, loading: true });

    await act(async () => root.unmount());
  });

  it("ignores an old request that completes after switching episodes", async () => {
    const pending = new Map<string, (value: BidclubEpisode) => void>();
    fetchBidclubEpisodeMock.mockImplementation(
      (reference: string) => new Promise<BidclubEpisode>((resolve) => pending.set(reference, resolve))
    );

    const observations: Array<{ reference?: string; title?: string; loading: boolean }> = [];
    function Harness({ reference }: { reference?: string }) {
      const result = useBidclubEpisode(reference);
      observations.push({ reference, title: result.episode?.title, loading: result.loading });
      return null;
    }

    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<Harness reference="episode-a" />));
    await act(async () => root.render(<Harness reference="episode-b" />));
    await act(async () => pending.get("episode-a")?.(episode("Late Episode A")));

    expect(observations.some((item) => item.reference === "episode-b" && item.title === "Late Episode A")).toBe(false);
    expect(observations.at(-1)).toMatchObject({ reference: "episode-b", title: undefined, loading: true });

    await act(async () => pending.get("episode-b")?.(episode("Episode B")));
    expect(observations.at(-1)).toMatchObject({ reference: "episode-b", title: "Episode B", loading: false });

    await act(async () => root.unmount());
  });

  it("uses a cached enriched episode without refetching", async () => {
    setCachedBidclubEpisode("episode-a", episode("Cached Episode", { tldrHtml: "<p>Cached summary</p>" }));

    const observations: Array<{ title?: string; loading: boolean }> = [];
    function Harness() {
      const result = useBidclubEpisode("episode-a");
      observations.push({ title: result.episode?.title, loading: result.loading });
      return null;
    }

    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<Harness />));

    expect(fetchBidclubEpisodeMock).not.toHaveBeenCalled();
    expect(observations.at(-1)).toMatchObject({ title: "Cached Episode", loading: false });

    await act(async () => root.unmount());
  });

  it("does not let an empty cached episode suppress a fresh detail check", async () => {
    setCachedBidclubEpisode("episode-a", episode("Empty Episode"));

    const pending = new Map<string, (value: BidclubEpisode) => void>();
    fetchBidclubEpisodeMock.mockImplementation(
      (reference: string) => new Promise<BidclubEpisode>((resolve) => pending.set(reference, resolve))
    );

    const observations: Array<{ title?: string; loading: boolean }> = [];
    function Harness() {
      const result = useBidclubEpisode("episode-a");
      observations.push({ title: result.episode?.title, loading: result.loading });
      return null;
    }

    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<Harness />));

    expect(fetchBidclubEpisodeMock).toHaveBeenCalledWith("episode-a");
    expect(observations.at(-1)).toMatchObject({ title: undefined, loading: true });

    await act(async () => pending.get("episode-a")?.(episode("Fresh Episode")));
    expect(observations.at(-1)).toMatchObject({ title: "Fresh Episode", loading: false });

    await act(async () => root.unmount());
  });

  it("retries a failed detail request with the canonical episode id", async () => {
    fetchBidclubEpisodeMock
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(episode("Recovered", { tldrHtml: "<p>Summary</p>" }));

    let latest: ReturnType<typeof useBidclubEpisode> | undefined;
    function Harness() {
      latest = useBidclubEpisode("https://bidclub.ai/e/episode-a");
      return null;
    }

    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<Harness />));
    expect(latest?.error).toBe("temporary failure");

    await act(async () => latest?.retry());

    expect(fetchBidclubEpisodeMock).toHaveBeenLastCalledWith("episode-a");
    expect(latest?.episode?.title).toBe("Recovered");
    await act(async () => root.unmount());
  });
});
