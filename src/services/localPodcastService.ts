import type { LocalPodcastArtifacts } from "../types";
import { backendRequest } from "./readerBackend";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await backendRequest(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || "本机播客服务请求失败。");
  return payload as T;
}

export interface LocalSessionResponse {
  session_id: string;
  job_id: string;
  reused?: boolean;
}

export interface LocalSessionStatus {
  session_id: string;
  job_id: string;
  job: {
    status: "pending" | "running" | "completed" | "failed" | "stale";
    message?: string;
    error?: string;
    progress?: number;
    insight_status?: "running" | "completed" | "failed" | "not_requested";
    insight_error?: string;
    insight_message?: string;
  };
  artifacts: LocalPodcastArtifacts;
}

export const localPodcastApi = {
  start: (input: { audioUrl: string; title: string; showNotes: string; force?: boolean }) => request<LocalSessionResponse>("/api/local-podcast/sessions", { method: "POST", body: JSON.stringify(input) }),
  status: (sessionId: string) => request<LocalSessionStatus>(`/api/local-podcast/sessions/${encodeURIComponent(sessionId)}`),
  createInsight: (sessionId: string) => request(`/api/local-podcast/sessions/${encodeURIComponent(sessionId)}/insight`, { method: "POST", body: "{}" }),
  getSettings: () => request<LocalAiSettings>("/api/local-podcast/settings"),
  saveSettings: (settings: Partial<LocalAiSettings> & { api_key?: string; clear_api_key?: boolean }) => request<LocalAiSettings>("/api/local-podcast/settings", { method: "POST", body: JSON.stringify(settings) }),
  testSettings: () => request<{ ok: boolean; error?: string }>("/api/local-podcast/settings/test", { method: "POST", body: "{}" }),
  preflight: () => request<{ ok?: boolean }>("/api/local-podcast/preflight"),
};

export interface LocalAiSettings {
  provider?: string;
  base_url: string;
  model: string;
  has_api_key: boolean;
  api_key_preview: string;
}
