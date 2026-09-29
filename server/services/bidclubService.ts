import { marked } from "marked";
import { fetchSafeExternal, MAX_PROXY_BYTES, readResponseBodyLimited } from "./proxyService";

export function formatTranscript(md: string | null | undefined): string {
  if (!md) return "";
  return md.split("\n").map((line, i, lines) => {
    const t = line.trim();
    const blankBefore = i === 0 || !lines[i - 1].trim();
    const blankAfter = i === lines.length - 1 || !lines[i + 1].trim();
    return t && t.length <= 15 && blankBefore && blankAfter && !/\s/.test(t) && !/[。，、！？：；,.!?:;…"'')\]》」〉】]$/.test(t) && !/^[#*\-\[>`~]/.test(t) ? `**${t}**` : line;
  }).join("\n");
}

export function digestWithChapters(md: string | null | undefined) {
  const chapters: { id: string; title: string }[] = [];
  if (!md) return { html: "", chapters };
  for (const line of md.split("\n")) {
    const match = line.match(/^###\s+(.+)$/);
    if (match) chapters.push({ id: `chapter-${chapters.length + 1}`, title: match[1].trim() });
  }
  let index = 0;
  const html = String(marked.parse(md)).replace(/<h3([^>]*)>/g, (_m, attrs) => `<h3${attrs} id="chapter-${++index}">`);
  return { html, chapters };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Bidclub response JSON is mapped to the local episode model in this legacy adapter.
export async function fetchBidclubEpisode(slug: string) { const response = await fetchSafeExternal("https://bidclub.ai/api/v1/episodes/" + encodeURIComponent(slug), { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } }); if (!response.ok) { const error = new Error("HTTP " + response.status) as Error & { status?: number }; error.status = response.status; throw error; } const data = JSON.parse((await readResponseBodyLimited(response, MAX_PROXY_BYTES)).toString("utf8")) as any; const render = (md?: string) => md ? String(marked.parse(md)) : ""; const digest = digestWithChapters(data.digest_md); const alt = digestWithChapters(data.digest_md_alt); return { title: data.title || "", dek: data.dek || "", dekAlt: data.dek_alt || "", lang: data.lang || "", langAlt: data.lang_alt || "", tldrHtml: render(data.tldr_md), digestHtml: digest.html, chapters: digest.chapters, transcriptHtml: render(formatTranscript(data.transcript_md)), tldrAltHtml: render(data.tldr_md_alt), digestAltHtml: alt.html, chaptersAlt: alt.chapters, sourceUrl: data.source_url || "", sourceLabel: data.source_label || "", thumbnailUrl: data.thumbnail_url || "", durationMin: typeof data.duration_min === "number" ? data.duration_min : null, showName: data.shows?.name || "", hosts: data.shows?.hosts || "", chips: Array.isArray(data.chips) ? data.chips : [] }; }
