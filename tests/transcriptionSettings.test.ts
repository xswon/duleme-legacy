import { afterEach, describe, expect, it } from "vitest";
import { clearTranscriptionSettings, getDB, getTranscriptionSettings, saveTranscriptionSettings } from "../src/services/dbService";
describe("cloud transcription settings storage", () => {
  afterEach(async () => { await clearTranscriptionSettings(); });
  it("loads, replaces and clears the browser-only key independently from app settings", async () => {
    await getDB();
    await saveTranscriptionSettings({ provider: "aliyun", apiKey: "sk-first", language: "auto", diarization: true, contextEnhancement: true });
    await expect(getTranscriptionSettings()).resolves.toMatchObject({ apiKey: "sk-first", diarization: true });
    await saveTranscriptionSettings({ provider: "aliyun", apiKey: "sk-replaced", language: "zh", diarization: false, contextEnhancement: false });
    await expect(getTranscriptionSettings()).resolves.toMatchObject({ apiKey: "sk-replaced", language: "zh" });
    await clearTranscriptionSettings(); await expect(getTranscriptionSettings()).resolves.toBeNull();
  });
});
