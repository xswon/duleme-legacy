import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({ request: vi.fn(), artifact: vi.fn() }));
vi.mock("../server/services/nextEchoService", async () => {
  class NextEchoError extends Error {
    constructor(message: string, public status = 502, public code = "nextecho_error") { super(message); }
  }
  return { NextEchoError, nextEchoRequest: service.request, readNextEchoArtifact: service.artifact };
});

import { createLocalPodcastRouter, isLoopbackAddress, requireLoopback } from "../server/routes/localPodcast";

describe("local podcast server boundary", () => {
  beforeEach(() => { service.request.mockReset(); service.artifact.mockReset(); });
  afterEach(() => vi.restoreAllMocks());

  it("accepts loopback variants and rejects LAN addresses", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("192.168.1.8")).toBe(false);
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Minimal Express request and response doubles for local-only access.
    requireLoopback({ socket: { remoteAddress: "192.168.1.8" }, get: () => "192.168.1.8:4387" } as any, { status, json } as any, vi.fn());
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: "local_only" }));
  });

  it("accepts Docker's private bridge only for a loopback-hosted page", () => {
    const previous = process.env.DOCKER;
    process.env.DOCKER = "true";
    const next = vi.fn();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Minimal Express request and response doubles for local-only access.
      requireLoopback({ socket: { remoteAddress: "192.168.65.1" }, get: () => "127.0.0.1:4387" } as any, {} as any, next);
      expect(next).toHaveBeenCalledOnce();
    } finally {
      if (previous === undefined) delete process.env.DOCKER;
      else process.env.DOCKER = previous;
    }
  });

  it("returns only NextEcho's masked settings payload", async () => {
    service.request.mockResolvedValue({ base_url: "https://api.example.com", model: "model-1", has_api_key: true, api_key_preview: "sk-•••1234" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Test inspects Express's internal untyped router stack.
    const router: any = createLocalPodcastRouter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Test inspects Express's internal untyped router stack.
    const handler = router.stack.find((layer: any) => layer.route?.path === "/settings" && layer.route.methods.get).route.stack[0].handle;
    const json = vi.fn();
    await handler({}, { json }, vi.fn());
    const payload = json.mock.calls[0][0];
    expect(payload).toMatchObject({ has_api_key: true, api_key_preview: "sk-•••1234" });
    expect(payload).not.toHaveProperty("api_key");
  });

  it("submits the audio URL and show notes as page context without an AI request", async () => {
    service.request.mockResolvedValue({ session_id: "session-1", job_id: "job-1" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Test inspects Express's internal untyped router stack.
    const router: any = createLocalPodcastRouter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Test inspects Express's internal untyped router stack.
    const handler = router.stack.find((layer: any) => layer.route?.path === "/sessions" && layer.route.methods.post).route.stack[0].handle;
    const status = vi.fn().mockReturnThis();
    await handler({ body: { audioUrl: "https://cdn.example.com/a.mp3", title: "Episode", showNotes: "Notes" } }, { status, json: vi.fn() }, vi.fn());
    expect(service.request).toHaveBeenCalledTimes(1);
    expect(service.request.mock.calls[0][0]).toBe("/api/transcription-sessions");
    expect(JSON.parse(service.request.mock.calls[0][1].body)).toMatchObject({ url: "https://cdn.example.com/a.mp3", model: "small", force: false, force_local_asr: true, page_context: { page_title: "Episode", show_notes: "Notes" } });
  });

  it("passes through an explicit forced retranscription", async () => {
    service.request.mockResolvedValue({ session_id: "session-2", job_id: "job-2" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Test inspects Express's internal untyped router stack.
    const router: any = createLocalPodcastRouter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Test inspects Express's internal untyped router stack.
    const handler = router.stack.find((layer: any) => layer.route?.path === "/sessions" && layer.route.methods.post).route.stack[0].handle;
    await handler({ body: { audioUrl: "https://cdn.example.com/a.mp3", title: "Episode", showNotes: "Notes", force: true } }, { status: vi.fn().mockReturnThis(), json: vi.fn() }, vi.fn());
    expect(JSON.parse(service.request.mock.calls[0][1].body)).toMatchObject({ model: "small", force: true });
  });
});
