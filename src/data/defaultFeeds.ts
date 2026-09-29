import { CuratedFeedOption, Feed, Article } from "../types";

export const LEGACY_DEFAULT_FEEDS: Feed[] = [
  {
    id: "feed-crossing",
    title: "十字路口Crossing",
    feedUrl: "https://feed.xyzfm.space/68fyjknth9hj",
    siteUrl: "https://bidclub.ai/shows/shizilukou",
    category: "科技 | 商业",
    description: "探讨科技、商业与 Agent Infra 前沿",
    unreadCount: 3,
    bidclubFeedUrl: "https://bidclub.ai/feeds/shizilukou.xml",
    bidclubShowSlug: "shizilukou",
  },
  {
    id: "feed-kuaguo",
    title: "跨国串门儿计划",
    feedUrl: "https://feed.xyzfm.space/r8t44lmvu99m",
    siteUrl: "https://xyzfm.space",
    favicon: "https://www.google.com/s2/favicons?domain=xyzfm.space&sz=64",
    category: "科技 | 商业",
    description: "硅谷与全球创投 Podcast 深度探讨",
    unreadCount: 4,
  },
  {
    id: "feed-42",
    title: "42章经",
    feedUrl: "https://feed.xyzfm.space/evgg6xle9rdc",
    siteUrl: "https://bidclub.ai/shows/42zhangjing",
    category: "科技 | 商业",
    description: "思考商业本质，对话前沿科技创业者",
    unreadCount: 2,
    bidclubFeedUrl: "https://bidclub.ai/feeds/42zhangjing.xml",
    bidclubShowSlug: "42zhangjing",
  },
  {
    id: "feed-qianliang",
    title: "钱粮胡同FM",
    feedUrl: "https://s1.proxy.wavpub.com/qianlianghutong.xml",
    siteUrl: "https://xyzfm.space",
    favicon: "https://www.google.com/s2/favicons?domain=xyzfm.space&sz=64",
    category: "人文 | 生活",
    description: "文化、畅销书与商业背后的人物故事",
    unreadCount: 2,
  },
  {
    id: "feed-sv101",
    title: "硅谷101",
    feedUrl: "https://feeds.fireside.fm/sv101/rss",
    siteUrl: "https://bidclub.ai/shows/valley101",
    category: "科技 | 商业",
    description: "深度立体的硅谷科技与金融商业大事件",
    unreadCount: 3,
    bidclubFeedUrl: "https://bidclub.ai/feeds/valley101.xml",
    bidclubShowSlug: "valley101",
  },
  {
    id: "feed-zhangxiaojun",
    title: "张小珺｜商业访谈录",
    feedUrl: "https://feed.xyzfm.space/dk4yh3pkpjp3",
    siteUrl: "https://bidclub.ai/shows/zhangxiaojun",
    category: "科技 | 商业",
    description: "对话中国商业与科技一线的关键人物",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/zhangxiaojun.xml",
    bidclubShowSlug: "zhangxiaojun",
  },
  {
    id: "feed-tulongzhishu",
    title: "屠龙之术",
    feedUrl: "https://feed.xyzfm.space/834hyx3v9k74",
    siteUrl: "https://bidclub.ai/shows/tulongzhishu",
    category: "科技 | 商业",
    description: "前沿科技、创业与投资的深度对谈",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/tulongzhishu.xml",
    bidclubShowSlug: "tulongzhishu",
  },
  {
    id: "feed-latetalk",
    title: "晚点聊 LateTalk",
    feedUrl: "https://feeds.fireside.fm/latetalk/rss",
    siteUrl: "https://bidclub.ai/shows/latetalk",
    category: "科技 | 商业",
    description: "晚点团队聊公司与商业的幕后故事",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/latetalk.xml",
    bidclubShowSlug: "latetalk",
  },
  {
    id: "feed-gaonengliang",
    title: "高能量",
    feedUrl: "https://feed.xyzfm.space/jhfuba3dahq8",
    siteUrl: "https://bidclub.ai/shows/gaonengliang",
    category: "科技 | 商业",
    description: "高能量密度的人物访谈与商业洞察",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/gaonengliang.xml",
    bidclubShowSlug: "gaonengliang",
  },
  {
    id: "feed-whynottv",
    title: "WhynotTV",
    feedUrl: "https://feed.xyzfm.space/g79cxcnp3nev",
    siteUrl: "https://bidclub.ai/shows/whynottv",
    category: "科技 | 商业",
    description: "Why Not 视角下的科技与商业",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/whynottv.xml",
    bidclubShowSlug: "whynottv",
  },
  {
    id: "feed-1000x",
    title: "1000x",
    feedUrl: "https://anchor.fm/s/112316ec0/podcast/rss",
    siteUrl: "https://bidclub.ai/shows/1000x",
    category: "科技 | 商业",
    description: "Crypto、投资与技术趋势访谈",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/1000x.zh.xml",
    bidclubShowSlug: "1000x",
  },
  {
    id: "feed-20vc",
    title: "20VC",
    feedUrl: "https://rss.libsyn.com/shows/61840/destinations/240976.xml",
    siteUrl: "https://bidclub.ai/shows/20vc",
    category: "科技 | 商业",
    description: "创业者、投资人与科技公司的深度访谈",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/20vc.zh.xml",
    bidclubShowSlug: "20vc",
  },
  {
    id: "feed-acquired",
    title: "Acquired",
    feedUrl: "https://feeds.transistor.fm/acquired",
    siteUrl: "https://bidclub.ai/shows/acquired",
    category: "科技 | 商业",
    description: "科技公司与商业历史深度分析",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/acquired.zh.xml",
    bidclubShowSlug: "acquired",
  },
  {
    id: "feed-allin",
    title: "All-In",
    feedUrl: "https://allinchamathjason.libsyn.com/rss",
    siteUrl: "https://bidclub.ai/shows/allin",
    category: "科技 | 商业",
    description: "科技、商业、投资与宏观趋势讨论",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/allin.zh.xml",
    bidclubShowSlug: "allin",
  },
  {
    id: "feed-bg2",
    title: "BG2",
    feedUrl: "https://anchor.fm/s/f06c2370/podcast/rss",
    siteUrl: "https://bidclub.ai/shows/bg2",
    category: "科技 | 商业",
    description: "科技创业与投资访谈",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/bg2.zh.xml",
    bidclubShowSlug: "bg2",
  },
  {
    id: "feed-dwarkesh",
    title: "Dwarkesh Podcast",
    feedUrl: "https://api.substack.com/feed/podcast/69345.rss",
    siteUrl: "https://bidclub.ai/shows/dwarkesh",
    category: "科技 | 商业",
    description: "人工智能、科学与技术的深度访谈",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/dwarkesh.zh.xml",
    bidclubShowSlug: "dwarkesh",
  },
  {
    id: "feed-gradientdissent",
    title: "Gradient Dissent",
    feedUrl: "https://feeds.captivate.fm/gradient-dissent/",
    siteUrl: "https://bidclub.ai/shows/gradientdissent",
    category: "科技 | 商业",
    description: "机器学习与人工智能实践访谈",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/gradientdissent.zh.xml",
    bidclubShowSlug: "gradientdissent",
  },
  {
    id: "feed-hardfork",
    title: "Hard Fork",
    feedUrl: "https://feeds.simplecast.com/l2i9YnTd",
    siteUrl: "https://bidclub.ai/shows/hardfork",
    category: "科技 | 商业",
    description: "科技新闻与互联网文化讨论",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/hardfork.zh.xml",
    bidclubShowSlug: "hardfork",
  },
  {
    id: "feed-iltb",
    title: "Invest Like the Best",
    feedUrl: "https://feeds.megaphone.fm/CLS2859450455",
    siteUrl: "https://bidclub.ai/shows/iltb",
    category: "科技 | 商业",
    description: "投资、商业与企业家访谈",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/iltb.zh.xml",
    bidclubShowSlug: "iltb",
  },
  {
    id: "feed-latentspace",
    title: "Latent Space",
    feedUrl: "https://api.substack.com/feed/podcast/1084089.rss",
    siteUrl: "https://bidclub.ai/shows/latentspace",
    category: "科技 | 商业",
    description: "人工智能工程与产品访谈",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/latentspace.zh.xml",
    bidclubShowSlug: "latentspace",
  },
  {
    id: "feed-lex",
    title: "Lex Fridman Podcast",
    feedUrl: "https://lexfridman.com/feed/podcast/",
    siteUrl: "https://bidclub.ai/shows/lex",
    category: "科技 | 商业",
    description: "人工智能、科学、技术与社会访谈",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/lex.zh.xml",
    bidclubShowSlug: "lex",
  },
  {
    id: "feed-mlst",
    title: "Machine Learning Street Talk",
    feedUrl: "https://anchor.fm/s/1e4a0eac/podcast/rss",
    siteUrl: "https://bidclub.ai/shows/mlst",
    category: "科技 | 商业",
    description: "机器学习与人工智能研究讨论",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/mlst.zh.xml",
    bidclubShowSlug: "mlst",
  },
  {
    id: "feed-moonshots",
    title: "Moonshots",
    feedUrl: "https://feeds.megaphone.fm/DVVTS2890392624",
    siteUrl: "https://bidclub.ai/shows/moonshots",
    category: "科技 | 商业",
    description: "科技、科学与未来趋势访谈",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/moonshots.zh.xml",
    bidclubShowSlug: "moonshots",
  },
  {
    id: "feed-nopriors",
    title: "No Priors",
    feedUrl: "https://feeds.megaphone.fm/nopriors",
    siteUrl: "https://bidclub.ai/shows/nopriors",
    category: "科技 | 商业",
    description: "人工智能创业与投资访谈",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/nopriors.zh.xml",
    bidclubShowSlug: "nopriors",
  },
  {
    id: "feed-semianalysis",
    title: "SemiAnalysis",
    feedUrl: "https://media.rss.com/semianalysis-weekly/feed.xml",
    siteUrl: "https://bidclub.ai/shows/semianalysis",
    category: "科技 | 商业",
    description: "半导体、人工智能与算力产业分析",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/semianalysis.zh.xml",
    bidclubShowSlug: "semianalysis",
  },
  {
    id: "feed-sharptech",
    title: "Sharp Tech",
    feedUrl: "https://sharptech.fm/feed/podcast",
    siteUrl: "https://bidclub.ai/shows/sharptech",
    category: "科技 | 商业",
    description: "科技行业与商业趋势讨论",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/sharptech.zh.xml",
    bidclubShowSlug: "sharptech",
  },
  {
    id: "feed-sourcery",
    title: "Sourcery",
    feedUrl: "https://anchor.fm/s/f192713c/podcast/rss",
    siteUrl: "https://bidclub.ai/shows/sourcery",
    category: "科技 | 商业",
    description: "创业、投资与科技公司访谈",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/sourcery.zh.xml",
    bidclubShowSlug: "sourcery",
  },
  {
    id: "feed-cogrev",
    title: "The Cognitive Revolution",
    feedUrl: "https://feeds.megaphone.fm/RINTP3108857801",
    siteUrl: "https://bidclub.ai/shows/cogrev",
    category: "科技 | 商业",
    description: "人工智能与认知科学访谈",
    unreadCount: 0,
    bidclubFeedUrl: "https://bidclub.ai/feeds/cogrev.zh.xml",
    bidclubShowSlug: "cogrev",
  },
];

const CURRENT_CURATED_FEED_ADDITIONS: CuratedFeedOption[] = [
  {
    id: "feed-light-the-star",
    title: "卫诗婕｜漫谈Light the Star",
    feedUrl: "https://feed.xyzfm.space/4jjdlpq3khc9",
    siteUrl: "https://www.xiaoyuzhoufm.com/podcast/6627fda4b56459544087d86a?utm_source=rss",
    category: "科技 | 商业",
    description: "",
    favicon: "https://www.google.com/s2/favicons?domain=www.xiaoyuzhoufm.com&sz=64",
  },
  {
    id: "feed-shanghaojin",
    title: "Shanghao Jin",
    feedUrl: "https://bidclub.ai/feeds/shanghaojin.zh.xml",
    siteUrl: "https://bidclub.ai/shows/shanghaojin",
    category: "科技 | 商业",
    description: "",
    favicon: "https://www.google.com/s2/favicons?domain=bidclub.ai&sz=64",
  },
  {
    id: "feed-svvector",
    title: "硅谷坐标 Silicon Valley Vector",
    feedUrl: "https://bidclub.ai/feeds/svvector.zh.xml",
    siteUrl: "https://bidclub.ai/shows/svvector",
    category: "科技 | 商业",
    description: "",
    favicon: "https://www.google.com/s2/favicons?domain=bidclub.ai&sz=64",
  },
  {
    id: "feed-theprompt",
    title: "the prompt",
    feedUrl: "https://bidclub.ai/feeds/theprompt.zh.xml",
    siteUrl: "https://bidclub.ai/shows/theprompt",
    category: "科技 | 商业",
    description: "",
    favicon: "https://www.google.com/s2/favicons?domain=bidclub.ai&sz=64",
  },
  {
    id: "feed-aihot",
    title: "AIHOT — 精选",
    feedUrl: "https://aihot.virxact.com/feed.xml",
    siteUrl: "https://aihot.virxact.com/",
    category: "新闻｜公众号",
    description: "",
    favicon: "https://www.google.com/s2/favicons?domain=aihot.virxact.com&sz=64",
  },
  {
    id: "feed-mianji",
    title: "面基",
    feedUrl: "https://feed.xyzfm.space/6hpdgggtxpxb",
    siteUrl: "https://feed.xyzfm.space/6hpdgggtxpxb",
    category: "投资 | 理财",
    description: "",
    favicon: "https://www.google.com/s2/favicons?domain=feed.xyzfm.space&sz=64",
  },
  {
    id: "feed-zhixing",
    title: "知行小酒馆",
    feedUrl: "https://feed.xyzfm.space/j8yp8gxkmgqr",
    siteUrl: "https://feed.xyzfm.space/j8yp8gxkmgqr",
    category: "投资 | 理财",
    description: "",
    favicon: "https://www.google.com/s2/favicons?domain=feed.xyzfm.space&sz=64",
  },
  {
    id: "feed-touziabc",
    title: "投资ABC",
    feedUrl: "https://feed.xyzfm.space/9bmupxfae9qd",
    siteUrl: "https://feed.xyzfm.space/9bmupxfae9qd",
    category: "投资 | 理财",
    description: "",
    favicon: "https://www.google.com/s2/favicons?domain=feed.xyzfm.space&sz=64",
  },
  {
    id: "feed-afterschool",
    title: "放学以后After school",
    feedUrl: "https://anchor.fm/s/81d05f80/podcast/rss",
    siteUrl: "https://anchor.fm/s/81d05f80/podcast/rss",
    category: "人文 | 生活",
    description: "",
    favicon: "https://www.google.com/s2/favicons?domain=anchor.fm&sz=64",
  },
  {
    id: "feed-zhankaijiangjiang",
    title: "展开讲讲",
    feedUrl: "https://feed.xyzfm.space/444v89dnlhkf",
    siteUrl: "https://feed.xyzfm.space/444v89dnlhkf",
    category: "人文 | 生活",
    description: "",
    favicon: "https://www.google.com/s2/favicons?domain=feed.xyzfm.space&sz=64",
  },
  {
    id: "feed-zhiwubuyan",
    title: "知无不言QA",
    feedUrl: "https://feed.xyzfm.space/kthwg4quxknw",
    siteUrl: "https://feed.xyzfm.space/kthwg4quxknw",
    category: "人文 | 生活",
    description: "",
    favicon: "https://www.google.com/s2/favicons?domain=feed.xyzfm.space&sz=64",
  },
  {
    id: "feed-liangshiyiting",
    title: "两室一听",
    feedUrl: "https://feed.xyzfm.space/fnrdh946mana",
    siteUrl: "https://feed.xyzfm.space/fnrdh946mana",
    category: "人文 | 生活",
    description: "",
    favicon: "https://www.google.com/s2/favicons?domain=feed.xyzfm.space&sz=64",
  },
  {
    id: "feed-tongjing",
    title: "铜镜",
    feedUrl: "https://feed.xyzfm.space/xpa79uvcn9lw",
    siteUrl: "https://feed.xyzfm.space/xpa79uvcn9lw",
    category: "政 | 经 | 史",
    description: "",
    favicon: "https://www.google.com/s2/favicons?domain=feed.xyzfm.space&sz=64",
  },
];

export const FEATURED_CURATED_FEED_IDS = [
  "feed-crossing",
  "feed-42",
  "feed-sv101",
  "feed-dwarkesh",
  "feed-hardfork",
  "feed-acquired",
  "feed-zhixing",
  "feed-qianliang",
  "feed-zhankaijiangjiang",
  "feed-aihot",
] as const;

const featuredCuratedFeedIds = new Set<string>(FEATURED_CURATED_FEED_IDS);

function fallbackFavicon(feed: Pick<Feed, "siteUrl" | "feedUrl">): string {
  try {
    const domain = new URL(feed.siteUrl || feed.feedUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return "";
  }
}

function asCuratedFeedOption(feed: Feed): CuratedFeedOption {
  return {
    id: feed.id,
    title: feed.title,
    feedUrl: feed.feedUrl,
    siteUrl: feed.siteUrl,
    category: feed.category,
    description: feed.description || "",
    favicon: feed.favicon || fallbackFavicon(feed),
    bidclubFeedUrl: feed.bidclubFeedUrl,
    bidclubShowSlug: feed.bidclubShowSlug,
  };
}

export const CURATED_FEEDS: CuratedFeedOption[] = [
  ...LEGACY_DEFAULT_FEEDS.map(asCuratedFeedOption),
  ...CURRENT_CURATED_FEED_ADDITIONS,
].map((feed) => ({
  ...feed,
  featured: featuredCuratedFeedIds.has(feed.id),
}));

function normalizedFeedUrl(feedUrl: string): string | undefined {
  try {
    const url = new URL(feedUrl.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}

const LEGACY_FEED_URL_REPLACEMENTS = new Map([
  ["https://apple.dwarkesh-podcast.workers.dev/feed.rss", "https://api.substack.com/feed/podcast/69345.rss"],
]);

/** Migrate only explicitly listed historical primary RSS URLs. */
export function resolveKnownPrimaryFeedUrl(feedUrl: string): string {
  return LEGACY_FEED_URL_REPLACEMENTS.get(feedUrl) ?? feedUrl;
}

const knownEnrichmentSources = new Map(
  CURATED_FEEDS.filter((feed) => feed.bidclubFeedUrl).map((feed) => [
    normalizedFeedUrl(feed.feedUrl),
    { bidclubFeedUrl: feed.bidclubFeedUrl, bidclubShowSlug: feed.bidclubShowSlug },
  ])
);

/** Resolve only explicitly configured primary RSS URLs, never titles or legacy identifiers. */
export function resolveKnownEnrichmentSource(feedUrl: string): Pick<Feed, "bidclubFeedUrl" | "bidclubShowSlug"> {
  const normalized = normalizedFeedUrl(feedUrl);
  return normalized ? knownEnrichmentSources.get(normalized) || {} : {};
}

export const FEATURED_CURATED_FEEDS = CURATED_FEEDS.filter((feed) => feed.featured).map((feed) => ({
  ...feed,
  contentType: feed.id === "feed-aihot" ? "article" as const : "podcast" as const,
}));

// BidClub Coverage subscriptions with original RSS sources. Shows without
// original RSS are excluded because BidClub feeds do not carry audio enclosures.
export const COVERAGE_FEED_IDS = [
  "feed-crossing",
  "feed-42",
  "feed-sv101",
  "feed-zhangxiaojun",
  "feed-tulongzhishu",
  "feed-latetalk",
  "feed-gaonengliang",
  "feed-whynottv",
  "feed-1000x",
  "feed-20vc",
  "feed-acquired",
  "feed-allin",
  "feed-bg2",
  "feed-dwarkesh",
  "feed-gradientdissent",
  "feed-hardfork",
  "feed-iltb",
  "feed-latentspace",
  "feed-lex",
  "feed-mlst",
  "feed-moonshots",
  "feed-nopriors",
  "feed-semianalysis",
  "feed-sharptech",
  "feed-sourcery",
  "feed-cogrev",
] as const;

export const INITIAL_ARTICLES: Article[] = [
  {
    id: "init-crossing-1",
    feedId: "feed-crossing",
    feedTitle: "十字路口Crossing",
    feedFavicon: "https://www.google.com/s2/favicons?domain=xyzfm.space&sz=64",
    title: "「模型能力已经够了，要卷就卷 infra」｜对谈戴冠兰：Runta 创始人",
    link: "https://xyzfm.space/episodes/crossing-runta",
    snippet:
      "🎪 十字路口将邀请戴冠兰在8.16(周日)举办 Agent Infra 线上闭门分享会，深入展开播客未尽的话题。欢迎对 Agent Infra 领域感兴趣的工程师、创业者参与。为...",
    content: `<p>在 AI Agent 与大模型爆发的今天，底层计算与存储 Infra 正在经历翻天覆地的重塑。</p>
    <p>本期对谈 Runta 创始人戴冠兰，深入探讨大模型推理加速、上下文缓存 (KV Cache) 与分布式 Agent 调度的底层逻辑。</p>`,
    pubDate: new Date(Date.now() - 1000 * 3600 * 9).toISOString(), // 9h ago
    author: "十字路口",
    read: false,
    starred: false,
  },
  {
    id: "init-kuaguo-1",
    feedId: "feed-kuaguo",
    feedTitle: "跨国串门儿计划",
    feedFavicon: "https://www.google.com/s2/favicons?domain=xyzfm.space&sz=64",
    title: "#666. all-in | 谷歌人才流失，SpaceX 的强劲季度，Airtable 暴跌 90%，美国数据助推中国 AI",
    link: "https://xyzfm.space/episodes/kuaguo-666",
    snippet:
      "📝 本期播客简介本期我们克隆了：知名播客 All-In Podcast Google's AI Brain Drain, SpaceX's Huge Quarter, Airtable's 90% Collapse, US Data Fuels Chin...",
    content: `<p>复盘硅谷与全球科技资本市场的最新动向：从谷歌大模型人才向初创企业的流动，到 SaaS 估值体系重塑与全球算力产业链竞争。</p>`,
    pubDate: new Date(Date.now() - 1000 * 3600 * 12).toISOString(), // 12h ago
    author: "跨国串门儿计划",
    read: false,
    starred: false,
  },
  {
    id: "init-kuaguo-2",
    feedId: "feed-kuaguo",
    feedTitle: "跨国串门儿计划",
    feedFavicon: "https://www.google.com/s2/favicons?domain=xyzfm.space&sz=64",
    title: "#665. 李录与查理·芒格和沃伦·巴菲特",
    link: "https://xyzfm.space/episodes/kuaguo-665",
    snippet:
      "📝 本期播客简介本期我们克隆了：知名播客 Founders Podcast Li Lu and Charlie Munger and Warren Buffett 原内容更新时间：2024-09-25 本期节目由...",
    content: `<p>深入探讨喜马拉雅资本创始人李录与伯克希尔哈撒韦长期合作伙伴关系的哲学思考，以及价值投资在AI时代的演变。</p>`,
    pubDate: new Date(Date.now() - 1000 * 3600 * 13).toISOString(), // 13h ago
    author: "跨国串门儿计划",
    read: false,
    starred: false,
  },
  {
    id: "init-42-1",
    feedId: "feed-42",
    feedTitle: "42章经",
    feedFavicon: "https://www.google.com/s2/favicons?domain=42zhangjing.com&sz=64",
    title: "从蒸馏到合成数据到 RSI，模型竞争的下一个焦点是什么？｜对谈 Evolvent AI 联创孟繁青",
    link: "https://42zhangjing.com/episodes/mengfanqing",
    snippet:
      "活动预告🥳：8 月 22 日，我们会请到繁青做一场线上活动，还会有数十位 model researchers 参与，大家记得翻到 shownotes 末尾查看报名信息！近几个月，...",
    content: `<p>大模型 Scaling Law 是否撞墙？合成数据 (Synthetic Data) 与自对弈强化学习 (RSI) 是如何撬动新一代 Reasoning 模型的突破。</p>`,
    pubDate: new Date(Date.now() - 1000 * 3600 * 24).toISOString(), // 1d ago
    author: "42章经",
    read: false,
    starred: true,
  },
  {
    id: "init-qianliang-1",
    feedId: "feed-qianliang",
    feedTitle: "钱粮胡同FM",
    feedFavicon: "https://www.google.com/s2/favicons?domain=xyzfm.space&sz=64",
    title: "342. 写书是门好生意，中国作家富豪榜揭秘-郑渊洁和杨红樱童话世界的背后",
    link: "https://xyzfm.space/episodes/qianliang-342",
    snippet:
      "本期主播：细菌佛、野人 本期简介：2024 年，中国图书零售市场码洋总规模 1129 亿元，其中少儿类图书占比 28.16%——图书市场近三成靠孩子撑起，是占比最...",
    content: `<p>拆解图书出版行业的商业杠杆：童话 IP 运作、渠道分发与长尾版税收入结构。</p>`,
    pubDate: new Date(Date.now() - 1000 * 3600 * 24 * 4).toISOString(), // 4d ago
    author: "钱粮胡同FM",
    read: false,
    starred: false,
  },
  {
    id: "init-sv101-1",
    feedId: "feed-sv101",
    feedTitle: "硅谷101",
    feedFavicon: "https://www.google.com/s2/favicons?domain=sv101.net&sz=64",
    title: "E247 | 对谈盛额：xAI，Infra 的浪漫，SGLang，开源，平权与“甄嬛传”",
    link: "https://sv101.net/episodes/e247",
    snippet:
      "这期播客的嘉宾是盛额，xAI 前推理团队负责人、开源推理引擎 SGLang 发起人及 RadixArk 联合创始人/CEO。在开源模型集中爆发之际，盛额在 AI Infra（基础...",
    content: `<p>对话 xAI 前推理团队负责人盛额：解密万卡集群工程中的极致性能榨取、开源 SGLang 架构设计与大模型基础设施的未来演进。</p>`,
    pubDate: new Date(Date.now() - 1000 * 3600 * 24 * 4).toISOString(), // 4d ago
    author: "硅谷101",
    read: false,
    starred: false,
  },
];
