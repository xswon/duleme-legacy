import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fetchDockerHostHttp, fetchLoopbackHttp } from "./outboundNetwork";

export function isAllowedNextEchoUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:") return false;
    if (["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) return true;
    return process.env.DOCKER === "true" && parsed.hostname === "host.docker.internal";
  } catch {
    return false;
  }
}

function configuredBaseUrl(): string {
  const value = process.env.NEXTECHO_URL || "http://127.0.0.1:8765";
  const parsed = new URL(value);
  if (!isAllowedNextEchoUrl(value)) {
    throw new Error("NEXTECHO_URL 必须是本机 HTTP 地址。");
  }
  return parsed.origin;
}

function fetchNextEcho(rawUrl: string, init: RequestInit): Promise<Response> {
  return new URL(rawUrl).hostname === "host.docker.internal"
    ? fetchDockerHostHttp(rawUrl, "host.docker.internal", init)
    : fetchLoopbackHttp(rawUrl, init);
}
let startupPromise: Promise<void> | null = null;

export class NextEchoError extends Error {
  constructor(message: string, public status = 502, public code = "nextecho_error") {
    super(message);
  }
}

function candidates(): string[] {
  return [
    process.env.NEXTECHO_ROOT || "",
    path.resolve(process.cwd(), "../../Podcast/NextEcho"),
    path.resolve(process.cwd(), "../NextEcho"),
    path.resolve(process.cwd(), "NextEcho"),
  ].filter(Boolean);
}

export function resolveNextEchoRoot(): string | null {
  for (const root of candidates()) {
    if (fs.existsSync(path.join(root, "app.py")) && fs.existsSync(path.join(root, "workbench"))) return root;
  }
  return null;
}

async function isReady(): Promise<boolean> {
  try {
    const response = await fetchNextEcho(`${configuredBaseUrl()}/api/preflight`, { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitUntilReady(getStartupError?: () => string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await isReady()) return;
    const startupError = getStartupError?.();
    if (startupError) throw new NextEchoError(startupError, 503, "startup_failed");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new NextEchoError("NextEcho 启动超时。请检查本机依赖和 NextEcho 日志后重试。", 503, "startup_timeout");
}

export async function ensureNextEcho(): Promise<void> {
  try { configuredBaseUrl(); } catch {
    throw new NextEchoError("NEXTECHO_URL 必须是本机 HTTP 地址。", 500, "invalid_configuration");
  }
  if (await isReady()) return;
  if (startupPromise) return startupPromise;
  startupPromise = (async () => {
    const root = resolveNextEchoRoot();
    if (!root) throw new NextEchoError("未找到 NextEcho。请设置 NEXTECHO_ROOT 指向 NextEcho 项目目录。", 503, "not_found");
    const venvPython = path.join(root, ".venv", "bin", "python");
    const python = fs.existsSync(venvPython) ? venvPython : "python3";
    const child = spawn(python, ["-m", "workbench.cli", "serve"], {
      cwd: root,
      detached: true,
      stdio: "ignore",
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    let startupError = "";
    child.once("error", (error) => { startupError = `NextEcho 无法启动：${error.message}`; });
    child.once("exit", (code) => {
      if (code && code !== 0) startupError = `NextEcho 未能启动（退出码 ${code}）。请检查本机依赖。`;
    });
    child.unref();
    await waitUntilReady(() => startupError);
  })().finally(() => { startupPromise = null; });
  return startupPromise;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Existing NextEcho callers consume provider JSON before a dedicated schema-hardening pass.
export async function nextEchoRequest(endpoint: string, init?: RequestInit): Promise<any> {
  await ensureNextEcho();
  let response: Response;
  try {
    response = await fetchNextEcho(`${configuredBaseUrl()}${endpoint}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new NextEchoError("无法连接本机 NextEcho 服务，请稍后重试。", 503, "unavailable");
  }
  const text = await response.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Docker readiness endpoint has an untyped response contract.
  let payload: any = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { error: text }; }
  if (!response.ok) {
    throw new NextEchoError(payload.message || payload.error || "NextEcho 请求失败。", response.status, payload.code || payload.error || "upstream_error");
  }
  return payload;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Artifact JSON is consumed by the existing provider adapter.
export async function readNextEchoArtifact(artifactUrl: string): Promise<any> {
  if (!artifactUrl.startsWith("/artifacts/transcriptions/")) {
    throw new NextEchoError("无效的产物地址。", 400, "invalid_artifact");
  }
  await ensureNextEcho();
  const response = await fetchNextEcho(`${configuredBaseUrl()}${artifactUrl}`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new NextEchoError("无法读取 NextEcho 产物。", response.status, "artifact_unavailable");
  return response.json();
}
