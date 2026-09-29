import { describe, expect, it } from "vitest";
import { attachBidclubMatches } from "../src/services/rssService";

const primary = (overrides: Partial<{ link: string; title: string; pubDate: string; duration: string }> = {}) => ({
  link: "https://example.com/episodes/12",
  title: "Episode 12: Building Reliable Systems",
  pubDate: "2026-08-10T08:00:00.000Z",
  duration: "01:00:00",
  ...overrides,
});

const bidclub = (
  link: string,
  overrides: Partial<{ title: string; pubDate: string; duration: string; content: string }> = {}
) => ({
  title: "EP 12｜Building Reliable Systems",
  pubDate: "2026-08-10T09:00:00.000Z",
  duration: "01:01:00",
  link,
  ...overrides,
});

describe("attachBidclubMatches confidence rules", () => {
  it("does not match different titles merely because they were published the same day", () => {
    const [result] = attachBidclubMatches(
      [primary({ title: "A conversation about databases" })],
      [bidclub("https://bidclub.ai/e/unrelated", { title: "How to train a language model" })]
    );

    expect(result).not.toHaveProperty("enrichment");
  });

  it("matches a reliable title when publication date and duration support it", () => {
    const [result] = attachBidclubMatches(
      [primary()],
      [bidclub("https://bidclub.ai/e/reliable-systems")]
    );

    expect(result).toMatchObject({
      enrichment: {
        provider: "bidclub",
        episodeUrl: "https://bidclub.ai/e/reliable-systems",
        episodeId: "reliable-systems",
        status: "candidate",
    },
  });
  });

  it("matches translated BidClub titles when the episode slug preserves the source title", () => {
    const [result] = attachBidclubMatches(
      [primary({
        title: "Nvidia's Historic Quarter, SaaS Comeback, Bessent vs Druck, America's Debt Crisis, Cancer Vaccine",
        pubDate: "2026-08-29T01:19:00.000Z",
        duration: "01:36:41",
      })],
      [bidclub("https://bidclub.ai/e/nvidia-s-historic-quarter-saas-comeback-bessent", {
        title: "Nvidia的历史性季度、SaaS复苏、Bessent对阵Druck、美国债务危机、癌症疫苗",
        pubDate: "2026-08-29T01:19:00.000Z",
        duration: undefined,
      })]
    );

    expect(result.enrichment).toMatchObject({
      episodeId: "nvidia-s-historic-quarter-saas-comeback-bessent",
      matchedBy: "title",
    });
  });

  it("matches source titles to slugs that omit common English stop words", () => {
    const [result] = attachBidclubMatches(
      [primary({
        title: "Disney: The Renaissance and the Empire",
        pubDate: "2026-08-10T04:41:43.000Z",
        duration: "16376",
      })],
      [bidclub("https://bidclub.ai/e/disney-renaissance-empire", {
        title: "Disney：文艺复兴与帝国",
        pubDate: "2026-08-10T04:41:43.000Z",
        duration: undefined,
      })]
    );

    expect(result.enrichment).toMatchObject({
      episodeId: "disney-renaissance-empire",
      matchedBy: "title",
    });
  });

  it("matches by mirrored publish time when translated titles have no shared source words", () => {
    const [result] = attachBidclubMatches(
      [primary({
        title: "陈天奇：机器学习系统，长期主义，初心，XGBoost，MXNet，TVM，MLC LLM，OctoML，CMU，UW",
        pubDate: "2025-09-12T14:07:32.000Z",
        duration: "02:40:10",
      })],
      [bidclub("https://bidclub.ai/e/whynottv-2025-09-12-xgboost-mxnet", {
        title: "Chen Tianqi on Long-Termism, XGBoost, MXNet, and TVM",
        pubDate: "2025-09-12T14:07:32.000Z",
        duration: undefined,
      })]
    );

    expect(result.enrichment).toMatchObject({
      episodeId: "whynottv-2025-09-12-xgboost-mxnet",
      matchedBy: "pub-date",
    });
  });

  it("matches an explicit episode number when duration supplies supporting evidence", () => {
    const [result] = attachBidclubMatches(
      [primary({ title: "Episode 42: Primary-feed wording", pubDate: "2026-08-01T00:00:00.000Z" })],
      [bidclub("https://bidclub.ai/e/episode-42", {
        title: "EP 42: Completely translated wording",
        pubDate: "2026-08-08T00:00:00.000Z",
        duration: "01:02:00",
      })]
    );

    expect(result).toMatchObject({ enrichment: { episodeId: "episode-42", matchedBy: "episode-number" } });
  });

  it("matches leading episode numbers across translated titles when date supports it", () => {
    const [result] = attachBidclubMatches(
      [primary({
        title: "178: 与田渊栋聊 RSI：模型自进化如何到来？",
        pubDate: "2026-08-07T02:00:00.000Z",
      })],
      [bidclub("https://bidclub.ai/e/latetalk-2026-08-07-178-rsi", {
        title: "178: Talking RSI with 田渊栋: How Will Model Self-Evolution Arrive?",
        pubDate: "2026-08-07T00:30:00.000Z",
      })]
    );

    expect(result).toMatchObject({
      enrichment: {
        episodeUrl: "https://bidclub.ai/e/latetalk-2026-08-07-178-rsi",
        episodeId: "latetalk-2026-08-07-178-rsi",
      },
    });
  });

  it("matches a Chinese numbered title to an unnumbered English title when the canonical slug supplies the number", () => {
    const [result] = attachBidclubMatches(
      [primary({
        title: "152. 中文主标题",
        pubDate: "2026-08-10T02:00:00.000Z",
      })],
      [bidclub("https://bidclub.ai/e/latetalk-2026-08-10-152-english-title", {
        title: "English title without a number",
        pubDate: "2026-08-10T09:00:00.000Z",
        duration: "02:00:00",
      })]
    );

    expect(result.enrichment).toMatchObject({
      episodeId: "latetalk-2026-08-10-152-english-title",
      matchedBy: "episode-number",
    });
  });

  it.each([".", "．", "、", ":", "："])("recognizes a leading episode prefix with %s", (separator) => {
    const [result] = attachBidclubMatches(
      [primary({ title: `152${separator}中文标题` })],
      [bidclub("https://bidclub.ai/e/translated-episode", {
        title: "EP 152: English title",
      })]
    );

    expect(result.enrichment).toMatchObject({ episodeId: "translated-episode", matchedBy: "episode-number" });
  });

  it("prefers explicit episode number evidence over a reliable translated title", () => {
    const [result] = attachBidclubMatches(
      [primary({ title: "Episode 152: Shared title" })],
      [
        bidclub("https://bidclub.ai/e/show-152-different-wording", {
          title: "Different English wording",
        }),
        bidclub("https://bidclub.ai/e/show-no-number", {
          title: "Shared title",
        }),
      ]
    );

    expect(result.enrichment).toMatchObject({
      episodeId: "show-152-different-wording",
      matchedBy: "episode-number",
    });
  });

  it("does not treat a year as an episode number or match a different slug episode", () => {
    const [result] = attachBidclubMatches(
      [primary({ title: "2026: 中文标题" })],
      [bidclub("https://bidclub.ai/e/show-152", { title: "English title without a number" })]
    );

    expect(result).not.toHaveProperty("enrichment");
  });

  it("does not match a different episode number even when dates align", () => {
    const [result] = attachBidclubMatches(
      [primary({ title: "152. 中文标题" })],
      [bidclub("https://bidclub.ai/e/show-153", { title: "English title without a number" })]
    );

    expect(result).not.toHaveProperty("enrichment");
  });

  it("does not match a slug episode when its publication date is too far away", () => {
    const [result] = attachBidclubMatches(
      [primary({ title: "152. 中文标题", pubDate: "2026-08-10T08:00:00.000Z" })],
      [bidclub("https://bidclub.ai/e/show-152", {
        title: "English title without a number",
        pubDate: "2026-08-20T08:00:00.000Z",
        duration: "02:00:00",
      })]
    );

    expect(result).not.toHaveProperty("enrichment");
  });

  it("does not force a match when two candidates have similarly strong evidence", () => {
    const [result] = attachBidclubMatches(
      [primary()],
      [
        bidclub("https://bidclub.ai/e/candidate-a"),
        bidclub("https://bidclub.ai/e/candidate-b", { pubDate: "2026-08-10T10:00:00.000Z" }),
      ]
    );

    expect(result).not.toHaveProperty("enrichment");
  });

  it("rejects explicitly different episode numbers even when normalized titles match", () => {
    const [result] = attachBidclubMatches(
      [primary({ title: "Episode 12: Building Reliable Systems" })],
      [bidclub("https://bidclub.ai/e/episode-13", { title: "EP 13: Building Reliable Systems" })]
    );

    expect(result).not.toHaveProperty("enrichment");
  });

  it("uses an exact Source URL before translated titles or episode fallbacks", () => {
    const [result] = attachBidclubMatches(
      [primary({
        link: "https://podcast.latepost.com/178",
        title: "完全不同的中文标题",
      })],
      [bidclub("https://bidclub.ai/e/latetalk-178", {
        title: "Completely different English title",
        content: '<p><a href="https://podcast.latepost.com/178?utm_source=rss">Source</a></p>',
      })]
    );

    expect(result.enrichment).toMatchObject({
      episodeId: "latetalk-178",
      status: "candidate",
      matchedBy: "source-url",
    });
  });

  it("falls back to slug titles when a generic source URL points to multiple helper items", () => {
    const [result] = attachBidclubMatches(
      [primary({
        link: "https://www.nytimes.com/column/hard-fork",
        title: "Meta Shifts the Blame + Do Data Center Bans Work? + The Final HatGPT",
        pubDate: "2026-08-28T11:00:00.000Z",
      })],
      [
        bidclub("https://bidclub.ai/e/openai-s-two-week-pause-jill-lepore-threat-artif", {
          title: "OpenAI 暂停两周 + Jill Lepore 谈人工国家",
          content: '<a href="https://www.nytimes.com/column/hard-fork">Source</a>',
          pubDate: "2026-08-21T11:00:00.000Z",
        }),
        bidclub("https://bidclub.ai/e/meta-shifts-blame-do-data-center-bans-work-final", {
          title: "Meta甩锅 + 禁建数据中心管用吗？+ 最终 HatGPT",
          content: '<a href="https://www.nytimes.com/column/hard-fork">Source</a>',
          pubDate: "2026-08-28T11:00:00.000Z",
        }),
      ]
    );

    expect(result.enrichment).toMatchObject({
      episodeId: "meta-shifts-blame-do-data-center-bans-work-final",
      matchedBy: "title",
    });
  });
});
