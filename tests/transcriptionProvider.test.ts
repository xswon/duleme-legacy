import { describe, expect, it, vi, afterEach } from "vitest";
import { AliyunTranscriptionProvider, TranscriptionError, validatePublicAudioUrl } from "../server/services/transcriptionProvider";
import { outboundTransport } from "../server/services/outboundNetwork";
describe("cloud transcription provider", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it("rejects local and private audio targets", async () => {
    await expect(validatePublicAudioUrl("http://127.0.0.1/a.mp3")).rejects.toMatchObject({ code: "audio_unreachable" });
    await expect(validatePublicAudioUrl("file:///tmp/a.mp3")).rejects.toMatchObject({ code: "audio_unreachable" });
  });
  it("submits the official async filetrans request with speaker separation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: { task_id: "task-1" } }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.spyOn(outboundTransport, "fetch").mockImplementation(fetchMock as never);
    const provider = new AliyunTranscriptionProvider();
    // Public IP avoids DNS in this focused adapter test.
    await expect(provider.submit({ apiKey: "sk-test", audioUrl: "https://8.8.8.8/audio.mp3", diarization: true, language: "zh" })).resolves.toEqual({ taskId: "task-1" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Test inspects the vendor-specific request body emitted by the provider adapter.
    const init = fetchMock.mock.calls[0][1] as any; const body = JSON.parse(init.body);
    expect(init.headers).toMatchObject({ "X-DashScope-Async": "enable" }); expect(body).toMatchObject({ model: "qwen-audio-3.0-asr-flash-filetrans", input: { file_urls: ["https://8.8.8.8/audio.mp3"] }, parameters: { diarization_enabled: true, language_hints: ["zh"] } });
  });
  it("normalizes completed sentences and speaker ids", async () => {
    vi.spyOn(outboundTransport, "fetch").mockImplementation(vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ output: { task_status: "SUCCEEDED", results: [{ subtask_status: "SUCCEEDED", transcription_url: "https://result.example.com/a.json" }] } }), { headers: { "Content-Type": "application/json" } })).mockResolvedValueOnce(new Response(JSON.stringify({ transcripts: [{ sentences: [{ begin_time: 10, end_time: 30, text: "你好", speaker_id: 0 }] }] }), { headers: { "Content-Type": "application/json" } })) as never);
    await expect(new AliyunTranscriptionProvider().poll({ apiKey: "sk", taskId: "task" })).resolves.toEqual({ status: "completed", segments: [{ startMs: 10, endMs: 30, text: "你好", speaker: "说话人 1" }] });
  });
  it("maps authentication errors safely", async () => { vi.spyOn(outboundTransport, "fetch").mockImplementation(vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "bad key" }), { status: 401, headers: { "Content-Type": "application/json" } })) as never); await expect(new AliyunTranscriptionProvider().testConnection("sk-bad")).rejects.toMatchObject({ code: "invalid_credentials" } satisfies Partial<TranscriptionError>); });
});
