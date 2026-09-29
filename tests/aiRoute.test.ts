import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  summarize: vi.fn(),
  test: vi.fn(),
  resolve: vi.fn(),
  list: vi.fn(),
}));

vi.mock("../server/services/aiService", async () => {
  class AiServiceError extends Error {
    constructor(public code: string, message: string, public status?: number) {
      super(message);
    }
  }
  return {
    AiServiceError,
    getResolvedAiConfig: service.resolve,
    listAiModels: service.list,
    summarizeArticle: service.summarize,
    testAiConnection: service.test,
  };
});

import { createAiRouter } from "../server/routes/ai";

function handler(path: string, method: "get" | "post") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Test inspects Express's internal untyped router stack.
  const router: any = createAiRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Test inspects Express's internal untyped router stack.
  return router.stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method])
    .route.stack[0].handle;
}

function response() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { json, status };
}

describe("AI routes", () => {
  beforeEach(() => {
    service.summarize.mockReset();
    service.test.mockReset();
    service.resolve.mockReset();
    service.list.mockReset();
  });

  it("reports environment capability without exposing the API key", async () => {
    service.resolve.mockReturnValue({
      baseURL: "https://api.example.com/v1",
      apiKey: "sk-secret",
      model: "model-1",
    });
    const res = response();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Minimal Express response double for this route assertion.
    await handler("/status", "get")({}, res as any);

    expect(res.json).toHaveBeenCalledWith({
      configured: true,
      baseURL: "https://api.example.com/v1",
      model: "model-1",
    });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("sk-secret");
  });

  it("loads models for pending form config without returning credentials", async () => {
    service.list.mockResolvedValue([{ id: "model-1" }, { id: "model-2" }]);
    const res = response();
    const config = { baseURL: "https://api.example.com/v1", apiKey: "sk-secret" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Minimal Express response double for this route assertion.
    await handler("/models", "post")({ body: { config } }, res as any);

    expect(service.list).toHaveBeenCalledWith(config);
    expect(res.json).toHaveBeenCalledWith({
      models: [{ id: "model-1" }, { id: "model-2" }],
    });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("sk-secret");
  });

  it("tests pending form config and returns latency", async () => {
    service.test.mockResolvedValue(undefined);
    const res = response();
    await handler("/test", "post")({
      body: { config: { baseURL: "http://127.0.0.1:11434/v1", model: "local" } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Minimal Express response double for this route assertion.
    }, res as any);

    expect(service.test).toHaveBeenCalledWith(expect.objectContaining({ model: "local" }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, latencyMs: expect.any(Number) }));
  });

  it("passes user endpoint config to article summarization", async () => {
    service.summarize.mockResolvedValue("Summary");
    const res = response();
    const config = { baseURL: "https://api.example.com/v1", apiKey: "sk-secret", model: "model-1" };
    await handler("/summarize", "post")({
      body: { title: "Title", content: "Body", snippet: "", config, source: "transcript" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Minimal Express response double for this route assertion.
    }, res as any);

    expect(service.summarize).toHaveBeenCalledWith("Title", "Body", "", config, "transcript");
    expect(res.json).toHaveBeenCalledWith({ summary: "Summary" });
  });

  it("streams summary progress before returning the result", async () => {
    service.summarize.mockImplementation(async (...args: unknown[]) => {
      const onProgress = args[5] as ((progress: number) => void) | undefined;
      onProgress?.(42);
      return "Summary";
    });
    const res = {
      status: vi.fn(),
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    };
    res.status.mockReturnValue(res);

    await handler("/summarize", "post")({
      query: { stream: "1" },
      body: { title: "Title", content: "Body", source: "article" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Minimal streaming response double.
    }, res as any);

    expect(res.write).toHaveBeenNthCalledWith(1, '{"type":"progress","progress":42}\n');
    expect(res.write).toHaveBeenNthCalledWith(2, '{"type":"result","summary":"Summary"}\n');
    expect(res.end).toHaveBeenCalledOnce();
  });
});
