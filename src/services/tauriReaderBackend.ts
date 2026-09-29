import { marked } from "marked";
import type { BidclubEpisode, RssParseResponse } from "../types";
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

interface RawBidclubEpisode {
  title?: unknown;
  dek?: unknown;
  dek_alt?: unknown;
  lang?: unknown;
  lang_alt?: unknown;
  tldr_md?: unknown;
  digest_md?: unknown;
  transcript_md?: unknown;
  tldr_md_alt?: unknown;
  digest_md_alt?: unknown;
  source_url?: unknown;
  source_label?: unknown;
  thumbnail_url?: unknown;
  duration_min?: unknown;
  shows?: { name?: unknown; hosts?: unknown } | null;
  chips?: unknown;
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

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function formatTranscript(markdown: string): string {
  if (!markdown) return "";
  const lines = markdown.split("\n");
  return lines.map((line, index) => {
    const value = line.trim();
    const blankBefore = index === 0 || !lines[index - 1].trim();
    const blankAfter = index === lines.length - 1 || !lines[index + 1].trim();
    return value
      && value.length <= 15
      && blankBefore
      && blankAfter
      && !/\s/.test(value)
      && !/[。，、！？：；,.!?:;…"'')\]》」〉】]$/.test(value)
      && !/^[#*\-\[>`~]/.test(value)
      ? `**${value}**`
      : line;
  }).join("\n");
}

function digestWithChapters(markdown: string): { html: string; chapters: { id: string; title: string }[] } {
  const chapters: { id: string; title: string }[] = [];
  if (!markdown) return { html: "", chapters };
  for (const line of markdown.split("\n")) {
    const match = line.match(/^###\s+(.+)$/);
    if (match) chapters.push({ id: `chapter-${chapters.length + 1}`, title: match[1].trim() });
  }
  let index = 0;
  const html = String(marked.parse(markdown)).replace(
    /<h3([^>]*)>/g,
    (_match, attrs) => `<h3${attrs} id="chapter-${++index}">`,
  );
  return { html, chapters };
}

function renderMarkdown(value: unknown): string {
  const markdown = text(value);
  return markdown ? String(marked.parse(markdown)) : "";
}

function mapBidclubEpisode(raw: RawBidclubEpisode): BidclubEpisode {
  const digest = digestWithChapters(text(raw.digest_md));
  const digestAlt = digestWithChapters(text(raw.digest_md_alt));
  return {
    title: text(raw.title),
    dek: text(raw.dek),
    dekAlt: text(raw.dek_alt),
    lang: text(raw.lang),
    langAlt: text(raw.lang_alt),
    tldrHtml: renderMarkdown(raw.tldr_md),
    digestHtml: digest.html,
    transcriptHtml: renderMarkdown(formatTranscript(text(raw.transcript_md))),
    tldrAltHtml: renderMarkdown(raw.tldr_md_alt),
    digestAltHtml: digestAlt.html,
    chapters: digest.chapters,
    chaptersAlt: digestAlt.chapters,
    sourceUrl: text(raw.source_url),
    sourceLabel: text(raw.source_label),
    thumbnailUrl: text(raw.thumbnail_url),
    durationMin: typeof raw.duration_min === "number" ? raw.duration_min : null,
    showName: text(raw.shows?.name),
    hosts: text(raw.shows?.hosts),
    chips: Array.isArray(raw.chips) ? raw.chips.filter((chip): chip is string => typeof chip === "string") : [],
  };
}

/**
 * Tauri adapter for operations already moved into Rust.
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

      if (method === "GET" && url.pathname === "/api/bidclub/episode") {
        const reference = (url.searchParams.get("url") || url.searchParams.get("slug") || "").trim();
        if (!reference) return jsonResponse({ error: "Missing episode url or slug parameter" }, 400);
        try {
          const raw = await invoke("fetch_bidclub_episode", { reference }) as RawBidclubEpisode;
          return jsonResponse(mapBidclubEpisode(raw));
        } catch (error) {
          return jsonResponse({ error: `Failed to fetch BidClub episode: ${errorMessage(error)}` }, 502);
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
