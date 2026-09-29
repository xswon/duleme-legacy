import { AiConfig, AiSecret } from "../types";
import { backendRequest } from "./readerBackend";
import {
  deleteSecretFromDB,
  getAppStateFromDB,
  getSecretFromDB,
  saveAppStateToDB,
  saveSecretToDB,
} from "./dbService";

const AI_SECRET_KEY = "ai";
export const AI_SETTINGS_CHANGED_EVENT = "wreader:ai-settings-changed";

export const DEFAULT_AI_CONFIG: AiConfig = {
  enabled: false,
  providerPreset: "openai",
  baseURL: "https://api.openai.com/v1",
  model: "",
};

export interface AiCapability {
  configured: boolean;
  baseURL?: string;
  model?: string;
}

export interface AiRequestConfig {
  baseURL: string;
  apiKey?: string;
  model: string;
}

function notifyChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AI_SETTINGS_CHANGED_EVENT));
  }
}

function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function isLoopbackUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export async function getAiConfig(): Promise<AiConfig> {
  const state = await getAppStateFromDB();
  return {
    ...DEFAULT_AI_CONFIG,
    ...(state?.aiConfig || {}),
  };
}

export async function saveAiConfig(config: AiConfig): Promise<void> {
  const state = (await getAppStateFromDB()) || {};
  await saveAppStateToDB({ ...state, aiConfig: config });
  notifyChanged();
}

export async function getAiSecret(): Promise<AiSecret> {
  return (await getSecretFromDB<AiSecret>(AI_SECRET_KEY)) || { apiKey: "" };
}

export async function saveAiSecret(secret: AiSecret): Promise<void> {
  if (!secret.apiKey) {
    await clearAiSecret();
    return;
  }
  await saveSecretToDB(AI_SECRET_KEY, secret);
  notifyChanged();
}

export async function clearAiSecret(): Promise<void> {
  await deleteSecretFromDB(AI_SECRET_KEY);
  notifyChanged();
}

export async function getAiRequestConfig(): Promise<AiRequestConfig | undefined> {
  const [config, secret] = await Promise.all([getAiConfig(), getAiSecret()]);
  if (!config.enabled) return undefined;
  const baseURL = config.baseURL.trim();
  const secretMatchesEndpoint = Boolean(
    secret.baseURL && normalizeEndpoint(secret.baseURL) === normalizeEndpoint(baseURL),
  );
  return {
    baseURL,
    model: config.model.trim(),
    apiKey: secretMatchesEndpoint ? secret.apiKey.trim() || undefined : undefined,
  };
}

async function getEnvironmentCapability(): Promise<AiCapability> {
  try {
    const response = await backendRequest("/api/ai/status");
    if (!response.ok) return { configured: false };
    const payload = await response.json();
    return {
      configured: payload.configured === true,
      baseURL: typeof payload.baseURL === "string" ? payload.baseURL : undefined,
      model: typeof payload.model === "string" ? payload.model : undefined,
    };
  } catch {
    return { configured: false };
  }
}

export async function getAiCapability(): Promise<AiCapability> {
  const [config, secret] = await Promise.all([getAiConfig(), getAiSecret()]);
  const baseURL = config.baseURL.trim();
  const model = config.model.trim();

  if (config.enabled) {
    const secretMatchesEndpoint = Boolean(
      secret.baseURL && normalizeEndpoint(secret.baseURL) === normalizeEndpoint(baseURL),
    );
    const hasUsableKey = secretMatchesEndpoint && Boolean(secret.apiKey.trim());
    return {
      configured: Boolean(baseURL && model && (hasUsableKey || isLoopbackUrl(baseURL))),
      baseURL: baseURL || undefined,
      model: model || undefined,
    };
  }

  return getEnvironmentCapability();
}

export async function testAiConnection(
  config: Pick<AiConfig, "baseURL" | "model">,
  apiKey: string,
): Promise<number> {
  const response = await backendRequest("/api/ai/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config: {
        baseURL: config.baseURL.trim(),
        model: config.model.trim(),
        apiKey: apiKey.trim() || undefined,
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "AI connection test failed.") as Error & { code?: string };
    error.code = payload.code;
    throw error;
  }
  return Number(payload.latencyMs) || 0;
}

export function getAiErrorMessage(error: unknown): string {
  const value = error as { code?: string; message?: string } | null;
  switch (value?.code) {
    case "unauthorized":
      return "API Key 无效，或当前账号没有模型权限。";
    case "endpoint_not_found":
      return "未找到接入点，请检查 Base URL 和路径。";
    case "model_not_found":
      return "未找到该模型，请检查模型名称。";
    case "rate_limited":
      return "请求过于频繁或当前账号额度不足。";
    case "timeout":
      return "模型响应超时，请稍后重试。";
    case "connection_refused":
      return "无法连接服务；使用本地模型时请确认服务已启动。";
    case "invalid_config":
      return "配置无效，请检查 Base URL。";
    case "invalid_request":
      return "当前模型或服务不接受该请求。";
    default:
      return value?.message || "AI 服务暂时不可用。";
  }
}
