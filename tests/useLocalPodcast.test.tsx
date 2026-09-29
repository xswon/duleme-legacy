import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Article } from "../src/types";

const api = vi.hoisted(() => ({ start: vi.fn(), status: vi.fn(), createInsight: vi.fn() }));
vi.mock("../src/services/localPodcastService", () => ({ localPodcastApi: api }));
import { useLocalPodcast } from "../src/hooks/useLocalPodcast";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const baseArticle: Article = { id: "a", feedId: "f", feedTitle: "Feed", title: "Episode", link: "https://example.com", content: "Notes", snippet: "Notes", pubDate: "2026-09-01", read: false, starred: false, audioUrl: "https://cdn.example.com/a.mp3" };

describe("useLocalPodcast", () => {
  beforeEach(() => { api.start.mockReset(); api.status.mockReset(); api.createInsight.mockReset(); });

  it("deduplicates rapid transcription starts", async () => {
    api.start.mockResolvedValue({ session_id: "s1", job_id: "j1" });
    let start: (() => Promise<{ started: boolean; error?: string }>) | undefined;
    function Harness() {
      const [article, setArticle] = useState(baseArticle);
      const local = useLocalPodcast(article, (_id, patch) => setArticle((current) => ({ ...current, ...patch })));
      start = local.startTranscription;
      return null;
    }
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Harness />));
    await act(async () => { await Promise.all([start!(), start!()]); });
    expect(api.start).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it("forces a new session when regenerating a completed local transcript", async () => {
    api.start.mockResolvedValue({ session_id: "s2", job_id: "j2", reused: false });
    let regenerate: (() => Promise<{ started: boolean; error?: string }>) | undefined;
    function Harness() {
      const [article, setArticle] = useState({ ...baseArticle, localPodcast: { sessionId: "s1", jobId: "j1", sourceAudioUrl: baseArticle.audioUrl!, transcriptionStatus: "completed" as const, insightStatus: "not_started" as const, updatedAt: "before" } });
      const local = useLocalPodcast(article, (_id, patch) => setArticle((current) => ({ ...current, ...patch }) as typeof current));
      regenerate = local.regenerateTranscription;
      return null;
    }
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Harness />));
    await act(async () => { await regenerate!(); });
    expect(api.start).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
    await act(async () => root.unmount());
  });

  it("restores a persisted session and records completed state", async () => {
    api.status.mockResolvedValue({ session_id: "s1", job_id: "j1", job: { status: "completed", insight_status: "not_requested", progress: 100 }, artifacts: { transcript: [{ startMs: 0, text: "Recovered" }] } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Test records provider patch payloads without constraining their evolving shape.
    const patches: any[] = [];
    function Harness() { useLocalPodcast({ ...baseArticle, localPodcast: { sessionId: "s1", jobId: "j1", sourceAudioUrl: baseArticle.audioUrl!, transcriptionStatus: "processing", insightStatus: "not_started", updatedAt: "before" } }, (_id, patch) => patches.push(patch)); return null; }
    const root = createRoot(document.createElement("div"));
    await act(async () => { root.render(<Harness />); await Promise.resolve(); });
    expect(api.status).toHaveBeenCalledWith("s1");
    expect(patches.some((patch) => patch.localPodcast?.transcriptionStatus === "completed")).toBe(true);
    await act(async () => root.unmount());
  });

  it("keeps a completed session reference after a transient fetch failure and retries recovery without retranscribing", async () => {
    api.status.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Test records provider patch payloads without constraining their evolving shape.
    const patches: any[] = [];
    let retry: (() => Promise<void>) | undefined;
    function Harness() {
      const local = useLocalPodcast({ ...baseArticle, localPodcast: { sessionId: "s1", jobId: "j1", sourceAudioUrl: baseArticle.audioUrl!, transcriptionStatus: "completed", insightStatus: "not_started", updatedAt: "before" } }, (_id, patch) => patches.push(patch));
      retry = local.retryTranscription;
      return null;
    }
    const root = createRoot(document.createElement("div"));
    await act(async () => { root.render(<Harness />); await Promise.resolve(); });
    expect(patches.some((patch) => patch.localPodcast?.transcriptionStatus === "failed")).toBe(false);

    api.status.mockResolvedValueOnce({ session_id: "s1", job_id: "j1", job: { status: "completed", insight_status: "not_requested", progress: 100 }, artifacts: { transcript: [{ startMs: 0, text: "Recovered" }] } });
    await act(async () => { await retry!(); });
    expect(api.start).not.toHaveBeenCalled();
    expect(patches.some((patch) => patch.localPodcast?.transcriptionStatus === "completed")).toBe(true);
    await act(async () => root.unmount());
  });

  it("deduplicates the single insight request", async () => {
    api.status.mockResolvedValue({ session_id: "s1", job_id: "j1", job: { status: "completed", insight_status: "not_requested" }, artifacts: { transcript: [] } });
    api.createInsight.mockResolvedValue({ ok: true });
    let createInsight: (() => Promise<void>) | undefined;
    function Harness() {
      const [article, setArticle] = useState({ ...baseArticle, localPodcast: { sessionId: "s1", jobId: "j1", sourceAudioUrl: baseArticle.audioUrl!, transcriptionStatus: "completed" as const, insightStatus: "not_started" as const, updatedAt: "before" } });
      const local = useLocalPodcast(article, (_id, patch) => setArticle((current) => ({ ...current, ...patch }) as typeof current));
      createInsight = local.createInsight;
      return null;
    }
    const root = createRoot(document.createElement("div"));
    await act(async () => { root.render(<Harness />); await Promise.resolve(); });
    await act(async () => { await Promise.all([createInsight!(), createInsight!()]); });
    expect(api.createInsight).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
});
