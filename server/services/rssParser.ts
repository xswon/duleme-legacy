import { XMLParser } from "fast-xml-parser";

export type ParsedFeed = { title: string; description: string; link: string; feedImage: string; items: Array<Record<string, unknown>> };
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text", parseAttributeValue: true, trimValues: true });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- XML parser leaf values are runtime-narrowed in this helper.
const value = (v: any, fallback = ""): string => typeof v === "string" || typeof v === "number" ? String(v) : v && typeof v === "object" && v["#text"] !== null && v["#text"] !== undefined ? String(v["#text"]) : fallback;
const decode = (s: string) => (s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- XML parser leaf values are normalized by value() before use.
const strip = (s: any) => decode(value(s)).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- XML image metadata is structurally variable and narrowed below.
function imageFromObject(obj: any): string | undefined {
  if (!obj) return;
  if (typeof obj === "string" && obj.startsWith("http")) return obj;
  if (Array.isArray(obj)) for (const x of obj) { const u = imageFromObject(x); if (u) return u; }
  if (typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj)) if (typeof v === "string" && v.startsWith("http") && /href|url|src|text|image/i.test(k)) return v;
  for (const v of Object.values(obj)) if (typeof v === "string" && v.startsWith("http") && /(?:xyzcdn\.net|qiniucdn\.com|aliyuncs\.com|\.(?:jpg|jpeg|png|webp|svg|gif))/i.test(v)) return v;
  for (const v of Object.values(obj)) if (v && typeof v === "object") { const u = imageFromObject(v); if (u) return u; }
}
function imageFromHtml(html: string, base: string): string | undefined {
  const decoded = decode((html || "").replace(/\\"/g, '"').replace(/\\\//g, "/")); const re = /<img[^>]+(?:src|data-src|srcset|data-original)=["']([^"'\s>]+)["']/gi; let m: RegExpExecArray | null;
  while ((m = re.exec(decoded))) { let u = m[1]; if (/1x1|feedburner|pixel|stat|badge|\.gif$/i.test(u)) continue; if (u.startsWith("//")) u = "https:" + u; else if (u.startsWith("/")) try { u = new URL(base).origin + u; } catch {} if (/^https?:\/\//.test(u)) return u; }
  return decoded.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i)?.[1] || decoded.match(/https?:\/\/[^\s"'<>]+?\.(?:jpg|jpeg|png|webp|svg)(?:\?[^\s"'<>]*)?/i)?.[0];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSS and Atom image fields have incompatible untyped shapes.
function itemImage(item: any, content: string, channel: any, feedUrl: string): string | undefined {
  for (const key of ["media:thumbnail", "itunes:image", "podcast:image", "image", "cover"]) { const u = imageFromObject(item[key]); if (u) return u; }
  for (const key of ["media:content", "enclosure"]) { const all = item[key] ? (Array.isArray(item[key]) ? item[key] : [item[key]]) : []; for (const x of all) { const u = imageFromObject(x); const type = x?.["@_type"] || x?.type || ""; if (u && (/^image/.test(type) || x?.["@_medium"] === "image" || /\.(?:jpg|jpeg|png|webp|svg|gif)(?:\?|#|$)/i.test(u))) return u; } }
  return imageFromHtml(content, value(item.link, feedUrl)) || imageFromObject(channel?.["itunes:image"]) || imageFromObject(channel?.image);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSS enclosure extensions are untyped external XML data.
function itemAudio(item: any, content: string) {
  const enclosures = item.enclosure ? (Array.isArray(item.enclosure) ? item.enclosure : [item.enclosure]) : []; const media = item["media:content"] ? (Array.isArray(item["media:content"]) ? item["media:content"] : [item["media:content"]]) : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSS enclosure extension values are narrowed by optional access and predicates.
  const audio = [...enclosures, ...media].find((x: any) => x?.["@_type"]?.startsWith("audio") || x?.["@_medium"] === "audio" || (x?.["@_url"] && /\.(?:mp3|m4a|aac|wav|ogg)(?:$|\?)/i.test(x["@_url"])));
  const audioUrl = audio?.["@_url"] || content.match(/<(?:audio|source)[^>]+src=["']([^"']+)["']/i)?.[1]; const raw = item["itunes:duration"];
  return { audioUrl, duration: typeof raw === "object" ? value(raw) : typeof raw === "string" || typeof raw === "number" ? String(raw).trim() : undefined };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Feed-level image extensions are untyped XML data.
function feedImage(source: any, feedUrl: string): string { for (const key of ["itunes:image", "podcast:image", "image", "logo", "icon"]) { const u = imageFromObject(source?.[key]); if (u) return u; } try { return `https://www.google.com/s2/favicons?domain=${new URL(feedUrl).hostname}&sz=64`; } catch { return ""; } }
export function parseFeedXml(xml: string, feedUrl: string): ParsedFeed {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- The XML library exposes parsed RSS/Atom trees without a schema.
  const parsed = parser.parse(xml) as any; const atom = parsed.feed; const channel = parsed.rss?.channel || parsed["rdf:RDF"]?.channel; const source = channel || atom;
  if (!source) return { title: "Untitled Feed", description: "", link: feedUrl, feedImage: feedImage({}, feedUrl), items: [] };
  const isAtom = !!atom; const raw = isAtom ? atom.entry : (channel?.item || parsed["rdf:RDF"]?.item); const list = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Atom link variants are selected from the untyped parsed tree.
  const link = isAtom ? (Array.isArray(atom.link) ? (atom.link.find((x: any) => x?.["@_rel"] === "alternate") || atom.link[0])?.["@_href"] : atom.link?.["@_href"]) || feedUrl : value(channel?.link, feedUrl);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Parsed item fields differ between RSS and Atom and are normalized into the local article shape.
  const items = list.map((item: any, i: number) => { const itemLink = isAtom ? (Array.isArray(item.link) ? (item.link.find((x: any) => x?.["@_rel"] === "alternate") || item.link[0])?.["@_href"] : item.link?.["@_href"]) || feedUrl : value(item.link, feedUrl); const rawContent = isAtom ? (item.content ?? item.summary) : (item["content:encoded"] ?? item.description); const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent ?? ""); const id = value(isAtom ? item.id : (item.guid ?? itemLink), `${feedUrl}-${i}`); return { id: String(id), title: strip(item.title) || "Untitled Article", link: String(itemLink), content, snippet: strip(content).slice(0, 240), pubDate: value(isAtom ? (item.published ?? item.updated) : (item.pubDate ?? item["dc:date"]), new Date().toISOString()), author: value(isAtom ? item.author?.name : (item["dc:creator"] ?? item.author), strip(source.title) || "Unknown"), thumbnail: itemImage(item, content, source, feedUrl), ...itemAudio(item, content), read: false, starred: false }; });
  return { title: strip(source.title) || "Untitled Feed", description: strip(isAtom ? source.subtitle : source.description), link, feedImage: feedImage(source, feedUrl), items };
}
export { parser as rssXmlParser };
