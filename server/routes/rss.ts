import { Router } from "express";
import { fetchSafeExternal, isSafeExternalUrl, MAX_PROXY_BYTES, readResponseBodyLimited } from "../services/proxyService";
import { parseFeedXml } from "../services/rssParser";

const RSS_FETCH_TIMEOUT_MS = 45_000;

export function createRssRouter() {
  const router = Router();
  router.get("/parse", async (req, res) => {
    const url = String(req.query.url || "");
    if (!url) return res.status(400).json({ error: "Missing feed URL parameter" });
    if (!isSafeExternalUrl(url)) return res.status(400).json({ error: "Feed URL must be a public http/https URL" });
    try {
      const response = await fetchSafeExternal(url, {
        headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
        signal: AbortSignal.timeout(RSS_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const feed = parseFeedXml((await readResponseBodyLimited(response, MAX_PROXY_BYTES)).toString("utf8"), url);
      let favicon = "";
      try { favicon = `https://www.google.com/s2/favicons?domain=${new URL(feed.link).hostname}&sz=64`; } catch { /* empty */ }
      return res.json({ ...feed, feedUrl: url, favicon, feedImage: feed.feedImage || favicon, itemCount: feed.items.length });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Existing RSS fetch errors carry an optional provider status.
    } catch (error: any) {
      return res.status(500).json({ error: `Failed to fetch or parse RSS feed: ${error.message || "Unknown error"}` });
    }
  });
  return router;
}
