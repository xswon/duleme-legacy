import { describe, expect, it } from "vitest";
import { parseFeedXml } from "../server/services/rssParser";

describe("rssParser format compatibility", () => {
  it("parses RSS 2.0", () => {
    const result = parseFeedXml(`<rss version="2.0"><channel><title>RSS</title><description>D</description><link>https://example.com</link><item><title>Hello</title><guid>1</guid><description><![CDATA[<p>Body</p>]]></description><link>https://example.com/1</link></item></channel></rss>`, "https://example.com/rss");
    expect(result.title).toBe("RSS");
    expect(result.items[0]).toMatchObject({ id: "1", title: "Hello", snippet: "Body" });
  });

  it("parses Atom", () => {
    const result = parseFeedXml(`<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title><entry><id>a1</id><title>Entry</title><link rel="alternate" href="https://example.com/a1"/><summary>Summary</summary></entry></feed>`, "https://example.com/atom");
    expect(result.title).toBe("Atom");
    expect(result.items[0]).toMatchObject({ id: "a1", link: "https://example.com/a1", snippet: "Summary" });
  });

  it("parses RDF", () => {
    const result = parseFeedXml(`<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><channel><title>RDF</title><link>https://example.com</link></channel><item><title>RDF item</title><link>https://example.com/i</link><description>Text</description></item></rdf:RDF>`, "https://example.com/rdf");
    expect(result.title).toBe("RDF");
    expect(result.items[0].title).toBe("RDF item");
  });

  it("preserves podcast audio and duration from RSS enclosures", () => {
    const result = parseFeedXml(`<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>Podcast</title><item><title>Episode</title><guid>episode-1</guid><description>Show notes</description><enclosure url="https://cdn.example.com/episode.mp3" type="audio/mpeg"/><itunes:duration>01:02:03</itunes:duration></item></channel></rss>`, "https://example.com/podcast.xml");

    expect(result.items[0]).toMatchObject({
      content: "Show notes",
      snippet: "Show notes",
      audioUrl: "https://cdn.example.com/episode.mp3",
      duration: "01:02:03",
    });
  });
});
