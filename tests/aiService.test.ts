import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiServiceError,
  cleanPodcastTranscriptForSummary,
  createChatCompletion,
  listAiModels,
  splitTranscriptForSummary,
  summarizeArticle,
} from "../server/services/aiService";
import { outboundTransport } from "../server/services/outboundNetwork";

const remoteConfig = {
  baseURL: "https://api.example.com/v1",
  apiKey: "sk-secret",
  model: "model-1",
};

const stubFetch = (mock: ReturnType<typeof vi.fn>) => {
  vi.spyOn(outboundTransport, "fetch").mockImplementation(mock as never);
  return mock;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OpenAI-compatible AI client", () => {
  it("removes obvious transcription filler and prompt artifacts before podcast summarization", () => {
    const transcript = [
      "[01:00] 这里是需要保留的节目观点。",
      "[01:30] 嗯，嗯，嗯，嗯，嗯。",
      "[02:00] 请用简体的文字点符号。",
      "[02:30] 另一个有效观点。",
    ].join("\n");

    expect(cleanPodcastTranscriptForSummary(transcript)).toBe([
      "[01:00] 这里是需要保留的节目观点。",
      "[02:30] 另一个有效观点。",
    ].join("\n"));
  });

  it("splits long transcripts without dropping the ending", () => {
    const transcript = `${"第一段内容。".repeat(4_000)}\nEND_MARKER`;
    const chunks = splitTranscriptForSummary(transcript, 10_000);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.join("\n")).toContain("END_MARKER");
    expect(chunks.every((chunk) => chunk.length <= 10_000)).toBe(true);
  });

  it("summarizes every chunk of a long podcast before final synthesis", async () => {
    const transcript = `${"[00:00] 第一段内容。".repeat(3_000)}\n[59:59] END_MARKER`;
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: `note-${fetchMock.mock.calls.length}` } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    stubFetch(fetchMock);

    const progress: number[] = [];
    await expect(summarizeArticle("Podcast", transcript, "Show notes", remoteConfig, "transcript", (value) => progress.push(value)))
      .resolves.toMatch(/^note-/);

    expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
    const requestBodies = fetchMock.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));
    expect(requestBodies.some((body) => JSON.stringify(body).includes("END_MARKER"))).toBe(true);
    const finalPrompt = requestBodies.at(-1).messages.at(-1).content;
    expect(finalPrompt).toContain("覆盖完整逐字稿的分段证据笔记");
    expect(finalPrompt).toContain("## 深度精华");
    expect(progress[0]).toBe(8);
    expect(progress.at(-1)).toBe(100);
    expect(progress.some((value) => value > 10 && value < 85)).toBe(true);
  });

  it("rejects plaintext HTTP for a non-loopback endpoint even with an API key", async () => {
    await expect(listAiModels({
      baseURL: "http://public-ai.example.com/v1",
      apiKey: "sk-secret",
    })).rejects.toMatchObject({
      code: "invalid_config",
      message: "Non-local AI endpoints must use HTTPS.",
    } satisfies Partial<AiServiceError>);
  });

  it("calls chat/completions and sends bearer auth for remote endpoints", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "Summary" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    stubFetch(fetchMock);

    await expect(createChatCompletion(remoteConfig, [{ role: "user", content: "hello" }]))
      .resolves.toBe("Summary");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-secret" }),
      }),
    );
  });

  it("loads a model catalog without requiring a configured model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { id: "model-b", created: 2, owned_by: "provider" },
        { id: "model-a", name: "Model A" },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    stubFetch(fetchMock);

    await expect(listAiModels({
      baseURL: "https://api.example.com/v1",
      apiKey: "sk-secret",
    })).resolves.toEqual([
      { id: "model-b", created: 2, ownedBy: "provider" },
      { id: "model-a", name: "Model A" },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer sk-secret" }),
      }),
    );
  });

  it("allows a local model catalog without an API key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      models: [{ id: "llama3.2:latest" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    stubFetch(fetchMock);

    await expect(listAiModels({
      baseURL: "http://127.0.0.1:11434/v1",
    })).resolves.toEqual([{ id: "llama3.2:latest" }]);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("keeps environment credentials out of an explicit local endpoint", async () => {
    const previous = process.env.AI_API_KEY;
    process.env.AI_API_KEY = "test-env-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "OK" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    stubFetch(fetchMock);

    try {
      await createChatCompletion(
        { baseURL: "http://127.0.0.1:11434/v1", model: "local-model" },
        [{ role: "user", content: "hello" }],
      );
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.headers).not.toHaveProperty("Authorization");
      expect(JSON.stringify(init)).not.toContain("test-env-key");
    } finally {
      if (previous === undefined) delete process.env.AI_API_KEY;
      else process.env.AI_API_KEY = previous;
    }
  });

  it("allows loopback endpoints without manufacturing an API key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "OK" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    stubFetch(fetchMock);

    await createChatCompletion(
      { baseURL: "http://127.0.0.1:11434/v1", model: "local-model" },
      [{ role: "user", content: "hello" }],
    );

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it.each([
    "http://localhost:11434/v1",
    "http://127.42.0.9:11434/v1",
    "http://[::1]:11434/v1",
  ])("allows HTTP without an API key for loopback endpoint %s", async (baseURL) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ models: [{ id: "local-model" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    stubFetch(fetchMock);

    await expect(listAiModels({ baseURL })).resolves.toEqual([{ id: "local-model" }]);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty("Authorization");
  });

  it.each([
    [401, "unauthorized"],
    [403, "unauthorized"],
    [429, "rate_limited"],
    [500, "upstream_error"],
  ] as const)("maps HTTP %s to %s", async (status, code) => {
    stubFetch(
      vi.fn().mockResolvedValue(new Response(JSON.stringify({
        error: { message: "upstream detail" },
      }), { status, headers: { "Content-Type": "application/json" } })),
    );

    await expect(createChatCompletion(remoteConfig, [{ role: "user", content: "hello" }]))
      .rejects.toMatchObject({ code });
  });

  it("distinguishes a model-shaped 404 without echoing provider secrets", async () => {
    stubFetch(
      vi.fn().mockResolvedValue(new Response(JSON.stringify({
        error: { message: "model not found; sk-secret should never be echoed" },
      }), { status: 404, headers: { "Content-Type": "application/json" } })),
    );

    try {
      await createChatCompletion(remoteConfig, [{ role: "user", content: "hello" }]);
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(AiServiceError);
      expect((error as AiServiceError).code).toBe("model_not_found");
      expect((error as Error).message).not.toContain("sk-secret");
    }
  });

  it("maps connection refused", async () => {
    const error = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    stubFetch(vi.fn().mockRejectedValue(error));

    await expect(createChatCompletion(remoteConfig, [{ role: "user", content: "hello" }]))
      .rejects.toMatchObject({ code: "connection_refused" });
  });

  it("maps aborts to timeout", async () => {
    stubFetch(vi.fn().mockImplementation((_url: string, init: RequestInit) => (
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      })
    )));

    await expect(createChatCompletion(remoteConfig, [{ role: "user", content: "hello" }], 1))
      .rejects.toMatchObject({ code: "timeout" });
  });

  it("rejects an empty compatible response", async () => {
    stubFetch(vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    await expect(createChatCompletion(remoteConfig, [{ role: "user", content: "hello" }]))
      .rejects.toMatchObject({ code: "invalid_response" });
  });
});
