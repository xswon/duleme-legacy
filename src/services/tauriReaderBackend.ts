import type { RssParseResponse } from "../types";
import { setReaderBackend, type ReaderBackend } from "./readerBackend";

export type TauriInvoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke?: TauriInvoke;
      };
    };
  }
}

function requestUrl(input: RequestInfo | URL): URL {
  const raw = input instanceof Request
    ? input.url
    : input instanceof URL
      ? input.toString()
      : input;
  const base = typeof window !== "undefined" && window.location?.href
    ? window.location.href
    : "http://localhost/";
  return new URL(raw, base);
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Desktop backend request failed.";
}

/**
 * Tauri adapter for the operations already moved into Rust.
 *
 * Unmigrated endpoints intentionally return 501 instead of silently falling
 * back to browser networking. This keeps desktop security boundaries explicit.
 */
export function createTauriReaderBackend(invoke: TauriInvoke): ReaderBackend {
  return {
    async request(input, init) {
      const url = requestUrl(input);
      const method = requestMethod(input, init);

      if (method === "GET" && url.pathname === "/api/rss/parse") {
        const feedUrl = url.searchParams.get("url")?.trim();
        if (!feedUrl) return jsonResponse({ error: "Missing feed URL parameter" }, 400);
        try {
          const payload = await invoke("fetch_rss", { url: feedUrl }) as RssParseResponse;
          return jsonResponse(payload);
        } catch (error) {
          return jsonResponse({ error: errorMessage(error) }, 500);
        }
      }

      // AI is optional and not part of the first Tauri milestone. Returning an
      // explicit unconfigured capability keeps the existing settings UI usable
      // without starting a localhost server.
      if (method === "GET" && url.pathname === "/api/ai/status") {
        return jsonResponse({ configured: false });
      }

      return jsonResponse(
        { error: "This backend operation has not been migrated to Tauri yet." },
        501,
      );
    },
  };
}

export function installTauriReaderBackend(): boolean {
  if (typeof window === "undefined") return false;
  const core = window.__TAURI__?.core;
  if (!core?.invoke) return false;
  const invoke: TauriInvoke = (command, args) => core.invoke!(command, args);
  setReaderBackend(createTauriReaderBackend(invoke));
  return true;
}
