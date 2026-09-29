import { assertSafePublicHttpUrl, fetchPublicHttp } from "./outboundNetwork";

export type TranscriptionErrorCode = "invalid_credentials" | "permission_required" | "quota_exceeded" | "audio_unreachable" | "audio_unsupported" | "provider_unavailable" | "timeout" | "unknown";
export class TranscriptionError extends Error {
  constructor(public code: TranscriptionErrorCode, message?: string, public status = 502) { super(message || transcriptionErrorMessage(code)); }
}
export const transcriptionErrorMessage = (code: TranscriptionErrorCode) => ({
  invalid_credentials: "API Key 无效或已失效，请重新填写。", permission_required: "该 API Key 没有调用转录服务的权限。", quota_exceeded: "转录额度不足或已超出限额。", audio_unreachable: "阿里云无法访问该公网音频地址。", audio_unsupported: "音频格式、大小或时长不受支持。", provider_unavailable: "阿里云百炼暂时不可用，请稍后重试。", timeout: "转录请求超时，请稍后重试。", unknown: "转录失败，请稍后重试。",
}[code]);

export async function validatePublicAudioUrl(value: string) {
  try { await assertSafePublicHttpUrl(value); } catch { throw new TranscriptionError("audio_unreachable", "音频地址不可访问或指向私有网络。", 400); }
}

export interface TranscriptSegment { startMs: number; endMs: number; text: string; speaker?: string; }
export interface TranscriptionProvider { testConnection(apiKey: string): Promise<void>; submit(input: { apiKey: string; audioUrl: string; language?: string; diarization?: boolean; context?: string }): Promise<{ taskId: string }>; poll(input: { apiKey: string; taskId: string }): Promise<{ status: "processing" | "completed" | "failed"; segments?: TranscriptSegment[]; error?: TranscriptionError }>; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Provider error JSON has no stable typed schema.
function mapError(status: number, body: any): TranscriptionError {
  const source = `${body?.code || ""} ${body?.message || body?.error || ""}`.toLowerCase();
  const code: TranscriptionErrorCode = status === 401 ? "invalid_credentials" : status === 403 ? "permission_required" : status === 429 || /quota|balance|limit/.test(source) ? "quota_exceeded" : /file.*(download|not.?found)|url.*(access|download)/.test(source) ? "audio_unreachable" : /format|duration|size|unsupported/.test(source) ? "audio_unsupported" : status >= 500 ? "provider_unavailable" : "unknown";
  return new TranscriptionError(code, undefined, status >= 400 && status < 500 ? status : 502);
}
async function call(url: string, apiKey: string, init?: RequestInit) {
  let response: Response; try { response = await fetchPublicHttp(url, { ...init, headers: { Authorization: `Bearer ${apiKey}`, ...(init?.headers || {}) }, signal: AbortSignal.timeout(30_000) }); } catch (error) { if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) throw new TranscriptionError("timeout"); throw new TranscriptionError("provider_unavailable"); }
  const payload = await response.json().catch(() => ({})); if (!response.ok) throw mapError(response.status, payload); return payload;
}
export class AliyunTranscriptionProvider implements TranscriptionProvider {
  private base = "https://dashscope.aliyuncs.com/api/v1";
  async testConnection(apiKey: string) { if (!apiKey.trim()) throw new TranscriptionError("invalid_credentials", "请先填写 API Key。", 400); try { await call(`${this.base}/tasks/__wreader_connection_test__`, apiKey); } catch (error) { if (error instanceof TranscriptionError && error.code === "unknown" && error.status === 404) return; throw error; } }
  async submit(input: { apiKey: string; audioUrl: string; language?: string; diarization?: boolean; context?: string }) {
    await validatePublicAudioUrl(input.audioUrl);
    const parameters: Record<string, unknown> = { channel_id: [0], diarization_enabled: input.diarization !== false };
    if (input.language && input.language !== "auto") parameters.language_hints = [input.language];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Provider request body accepts vendor-defined parameters.
    const context = input.context?.trim().slice(0, 400); const body: any = { model: "qwen-audio-3.0-asr-flash-filetrans", input: { file_urls: [input.audioUrl] }, parameters };
    if (context) body.input.context = [{ role: "user", content: [{ type: "input_text", text: context }] }];
    const payload = await call(`${this.base}/services/audio/asr/transcription`, input.apiKey, { method: "POST", headers: { "Content-Type": "application/json", "X-DashScope-Async": "enable" }, body: JSON.stringify(body) });
    const taskId = payload?.output?.task_id; if (!taskId) throw new TranscriptionError("unknown"); return { taskId };
  }
  async poll(input: { apiKey: string; taskId: string }) {
    const payload = await call(`${this.base}/tasks/${encodeURIComponent(input.taskId)}`, input.apiKey); const output = payload?.output || {}; const status = String(output.task_status || "").toUpperCase();
    if (status === "PENDING" || status === "RUNNING") return { status: "processing" as const };
    const result = output.results?.[0]; if (status !== "SUCCEEDED" || result?.subtask_status === "FAILED" || !result?.transcription_url) return { status: "failed" as const, error: mapError(400, result || output) };
    const raw = await fetchPublicHttp(result.transcription_url, { signal: AbortSignal.timeout(30_000) }).then(async (r) => r.ok ? r.json() : Promise.reject(new TranscriptionError("provider_unavailable"))).catch((error) => { throw error instanceof TranscriptionError ? error : new TranscriptionError("provider_unavailable"); });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Provider transcript JSON is mapped into the typed local segment model here.
    const segments: TranscriptSegment[] = (raw?.transcripts || []).flatMap((transcript: any) => (transcript?.sentences || []).map((sentence: any) => ({ startMs: Number(sentence.begin_time || 0), endMs: Number(sentence.end_time || 0), text: String(sentence.text || "").trim(), ...(sentence.speaker_id === undefined ? {} : { speaker: `说话人 ${Number(sentence.speaker_id) + 1}` }) })).filter((s: TranscriptSegment) => s.text));
    return { status: "completed" as const, segments };
  }
}
export const transcriptionProvider: TranscriptionProvider = new AliyunTranscriptionProvider();
