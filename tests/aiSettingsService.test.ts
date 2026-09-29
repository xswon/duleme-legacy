import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDB } from "../src/services/dbService";
import { listInsightModels } from "../src/services/insightSettingsService";
import {
  getAiCapability,
  getAiRequestConfig,
  saveAiConfig,
  saveAiSecret,
} from "../src/services/aiSettingsService";

async function resetDatabase() {
  await closeDB();
  const databases = await indexedDB.databases();
  await Promise.all(databases.map(({ name }) => name ? new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  }) : Promise.resolve()));
}

describe("AI settings service", () => {
  beforeEach(resetDatabase);
  afterEach(() => vi.unstubAllGlobals());

  it("does not use a saved key that belongs to a different endpoint", async () => {
    await saveAiConfig({
      enabled: true,
      providerPreset: "custom",
      baseURL: "https://one.example.com/v1",
      model: "model-1",
    });
    await saveAiSecret({
      apiKey: "key-for-other-endpoint",
      baseURL: "https://two.example.com/v1",
    });

    await expect(getAiRequestConfig()).resolves.toEqual({
      baseURL: "https://one.example.com/v1",
      model: "model-1",
      apiKey: undefined,
    });
    await expect(getAiCapability()).resolves.toMatchObject({ configured: false });
  });

  it("uses a key only when it is bound to the configured endpoint", async () => {
    await saveAiConfig({
      enabled: true,
      providerPreset: "custom",
      baseURL: "https://one.example.com/v1/",
      model: "model-1",
    });
    await saveAiSecret({
      apiKey: "matching-key",
      baseURL: "https://one.example.com/v1",
    });

    await expect(getAiRequestConfig()).resolves.toEqual({
      baseURL: "https://one.example.com/v1/",
      model: "model-1",
      apiKey: "matching-key",
    });
    await expect(getAiCapability()).resolves.toMatchObject({ configured: true });
  });

  it("reuses the endpoint-bound saved key for model discovery", async () => {
    await saveAiConfig({
      enabled: true,
      providerPreset: "openai",
      baseURL: "https://one.example.com/v1",
      model: "model-1",
    });
    await saveAiSecret({
      apiKey: "matching-key",
      baseURL: "https://one.example.com/v1",
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      models: [{ id: "model-1" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listInsightModels({
      baseURL: "https://one.example.com/v1",
    })).resolves.toEqual([{ id: "model-1" }]);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/models",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.config).toEqual({
      baseURL: "https://one.example.com/v1",
      apiKey: "matching-key",
    });
  });

  it("allows a loopback endpoint without an API key", async () => {
    await saveAiConfig({
      enabled: true,
      providerPreset: "ollama",
      baseURL: "http://127.0.0.1:11434/v1",
      model: "local-model",
    });
    await saveAiSecret({ apiKey: "", baseURL: "http://127.0.0.1:11434/v1" });

    await expect(getAiCapability()).resolves.toMatchObject({
      configured: true,
      baseURL: "http://127.0.0.1:11434/v1",
      model: "local-model",
    });
  });
});
