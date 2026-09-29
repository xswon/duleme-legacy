import { describe, expect, it } from "vitest";
import { attachBidclubSelfReferences, matchBidclubItems } from "../src/services/rssService";
import { resolveArticlePresentation } from "../src/services/articlePresentation";
import type { Article } from "../src/types";
import { parseFeedXml } from "../server/services/rssParser";

describe("BidClub enrichment pipeline", () => {
  it("turns a BidClub feed item into an enrichment reference when used as the primary feed", () => {
    const feed = parseFeedXml(`
      <rss version="2.0"><channel><title>Show — BidClub</title>
        <item>
          <guid>bidclub-item</guid>
          <title>Translated title</title>
          <link>https://bidclub.ai/e/show-episode-1</link>
          <pubDate>Fri, 07 Aug 2026 00:30:00 GMT</pubDate>
          <description>&lt;p&gt;Digest preview&lt;/p&gt;</description>
        </item>
      </channel></rss>
    `, "https://bidclub.ai/feeds/show.xml");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Test fixture uses provider-shaped feed items before normalization.
    const [item] = attachBidclubSelfReferences(feed.items as any[]);

    expect(item.enrichment).toMatchObject({
      provider: "bidclub",
      episodeId: "show-episode-1",
      episodeUrl: "https://bidclub.ai/e/show-episode-1",
      status: "candidate",
      matchedBy: "source-url",
    });
  });

  it("associates the translated LateTalk 178 fixture by Source URL and exposes all real content", () => {
    const primary = {
      id: "late-178",
      title: "178: 与田渊栋聊 RSI：模型自进化如何到来？",
      link: "https://podcast.latepost.com/178",
      content: "<p>Original show notes</p>",
      snippet: "Original show notes",
      pubDate: "2026-08-07T02:00:00.000Z",
      audioUrl: "https://cdn.example.com/178.mp3",
      duration: "01:29:00",
    };
    const helperFeed = parseFeedXml(`
      <rss version="2.0"><channel><title>LateTalk — BidClub</title>
        <item>
          <guid>bidclub-178</guid>
          <title>178: Talking RSI with 田渊栋: How Will Model Self-Evolution Arrive?</title>
          <link>https://bidclub.ai/e/latetalk-2026-08-07-178-rsi</link>
          <pubDate>Fri, 07 Aug 2026 00:30:00 GMT</pubDate>
          <description>&lt;p&gt;Digest preview&lt;/p&gt;&lt;p&gt;&lt;a href=&quot;https://podcast.latepost.com/178?utm_source=rss&quot;&gt;Source&lt;/a&gt;&lt;/p&gt;</description>
          <itunes:duration>01:29:00</itunes:duration>
        </item>
      </channel></rss>
    `, "https://bidclub.ai/feeds/latetalk.xml");
    const helper = helperFeed.items[0] as unknown as {
      title: string;
      link: string;
      content: string;
      snippet: string;
      pubDate: string;
      duration?: string;
    };

    const match = matchBidclubItems([primary], [helper]);
    const article: Article = {
      ...match.items[0],
      feedId: "latetalk",
      feedTitle: "LateTalk",
      read: false,
      starred: false,
    };
    const presentation = resolveArticlePresentation(article, {
      status: "available",
      overview: "<p>TLDR</p>",
      digest: "<p>Digest</p>",
      transcript: "<p>Transcript</p>",
    });

    expect(article.enrichment).toMatchObject({
      episodeId: "latetalk-2026-08-07-178-rsi",
      status: "candidate",
      matchedBy: "source-url",
    });
    expect(presentation.defaultTab).toBe("body");
    expect(presentation.tabs.map((tab) => tab.key)).toEqual([
      "body",
      "overview",
      "transcript",
    ]);
  });
});
