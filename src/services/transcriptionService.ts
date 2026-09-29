import type { TranscriptSegment } from "../types";
export type TranscriptionErrorCode = "invalid_credentials" | "permission_required" | "quota_exceeded" | "audio_unreachable" | "audio_unsupported" | "provider_unavailable" | "timeout" | "unknown";
export class TranscriptionApiError extends Error { constructor(public code: TranscriptionErrorCode, message: string) { super(message); } }
async function request<T>(url: string, init: RequestInit): Promise<T> { const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init.headers || {}) } }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new TranscriptionApiError(payload.code || "unknown", payload.message || "转录请求失败，请稍后重试。"); return payload as T; }
export const transcriptionApi = {
  test: (apiKey: string) => request<{ ok: true }>("/api/transcription/settings/test", { method: "POST", body: JSON.stringify({ apiKey }) }),
  submit: (input: { apiKey: string; audioUrl: string; language: string; diarization: boolean; context?: string }) => request<{ taskId: string; status: "processing" }>("/api/transcription/tasks", { method: "POST", body: JSON.stringify(input) }),
  poll: (taskId: string, apiKey: string) => request<{ status: "processing" | "completed" | "failed"; segments?: TranscriptSegment[]; code?: TranscriptionErrorCode; message?: string }>(`/api/transcription/tasks/${encodeURIComponent(taskId)}/poll`, { method: "POST", body: JSON.stringify({ apiKey }) }),
};
