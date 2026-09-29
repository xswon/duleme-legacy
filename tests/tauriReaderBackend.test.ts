import { afterEach, describe, expect, it, vi } from "vitest";
import { backendRequest, resetReaderBackend, setReaderBackend } from "../src/services/readerBackend";
import { createTauriReaderBackend } from "../src/services/tauriReaderBackend";

describe("Tauri ReaderBackend", () => {
  afterEach(() => {
    resetReaderBackend();
    vi.restoreAllMocks();
  });

  it("routes RSS parsing through the Rust command", async () => {
    const payload = {
      title: "Example",
      description: "",
      link: "https://example.com",
      feedUrl: "https://example.com/feed.xml",
      favicon: "",
      itemCount: 0,
      items: [],
    };
    const invoke = vi.fn(async () => payload);
    setReaderBackend(createTauriReaderBackend(invoke));

    const response = await backendRequest(
      "/api/rss/parse?url=https%3A%2F%2Fexample.com%2Ffeed.xml",
    );

    expect(response.ok).toBe(true);
    await expect(response.json()).resolves.toEqual(payload);
    expect(invoke).toHaveBeenCalledWith("fetch_rss", {
      url: "https://example.com/feed.xml",
    });
  });

  it("routes BidClub detail through Rust and preserves the existing response shape", async () => {
    const invoke = vi.fn(async () => ({
      title: "Episode",
      dek: "Deck",
      lang: "zh",
      tldr_md: "Short summary",
      digest_md: "### Chapter One\n\nDeep summary",
      transcript_md: "Host\n\nHello world",
      source_url: "https://example.com/episode",
      duration_min: 42,
      shows: { name: "Show", hosts: "Host" },
      chips: ["AI"],
    }));
    setReaderBackend(createTauriReaderBackend(invoke));

    const response = await backendRequest("/api/bidclub/episode?url=episode-a");
    expect(response.ok).toBe(true);
    const payload = await response.json();

    expect(invoke).toHaveBeenCalledWith("fetch_bidclub_episode", { reference: "episode-a" });
    expect(payload.title).toBe("Episode");
    expect(payload.tldrHtml).toContain("<p>Short summary</p>");
    expect(payload.digestHtml).toContain('id="chapter-1"');
    expect(payload.transcriptHtml).toContain("<strong>Host</strong>");
    expect(payload.chapters).toEqual([{ id: "chapter-1", title: "Chapter One" }]);
  });

  it("does not fall back to arbitrary browser networking on desktop", async () => {
    const invoke = vi.fn();
    setReaderBackend(createTauriReaderBackend(invoke));

    const response = await backendRequest("/api/transcription/settings/test", {
      method: "POST",
      body: "{}",
    });

    expect(response.status).toBe(501);
    expect(invoke).not.toHaveBeenCalled();
  });
});
