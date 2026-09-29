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
