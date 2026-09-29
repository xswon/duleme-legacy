import { afterEach, describe, expect, it, vi } from "vitest";
import {
  backendRequest,
  resetReaderBackend,
  setReaderBackend,
  type ReaderBackend,
} from "../src/services/readerBackend";

describe("ReaderBackend boundary", () => {
  afterEach(() => {
    resetReaderBackend();
    vi.restoreAllMocks();
  });

  it("delegates requests to the installed environment adapter", async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const request = vi.fn(async () => response);
    const backend: ReaderBackend = { request };
    setReaderBackend(backend);

    const result = await backendRequest("/api/rss/parse?url=test", {
      method: "POST",
      body: "{}",
    });

    expect(result).toBe(response);
    expect(request).toHaveBeenCalledWith("/api/rss/parse?url=test", {
      method: "POST",
      body: "{}",
    });
  });

  it("uses browser fetch by default", async () => {
    const response = new Response("ok", { status: 200 });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    await expect(backendRequest("/api/health")).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledWith("/api/health", undefined);
  });
});
