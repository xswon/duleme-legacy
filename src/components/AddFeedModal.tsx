import React, { useEffect, useState } from "react";
import {
  X,
  Plus,
  Rss,
  Upload,
  Check,
  Loader2,
} from "lucide-react";
import { CuratedFeedOption, Feed } from "../types";
import { CURATED_FEEDS, resolveKnownEnrichmentSource } from "../data/defaultFeeds";
import { fetchRssFeed, matchBidclubItems } from "../services/rssService";
import { isEnrichmentSourceEditorEnabled } from "../config/features";
import { resolveFeedEnrichmentSource } from "../services/feedEnrichment";

interface AddFeedModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingFeeds: Feed[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Feed parser article payload predates a dedicated type at this callback boundary.
  onAddFeed: (feed: Feed, newArticles?: any[]) => Promise<boolean | void> | boolean | void;
  onImportOpmlFile: (file: File) => void;
  onShowToast?: (message: string) => void;
}

export const AddFeedModal: React.FC<AddFeedModalProps> = ({
  isOpen,
  onClose,
  existingFeeds,
  onAddFeed,
  onImportOpmlFile,
  onShowToast,
}) => {
  const [feedUrlInput, setFeedUrlInput] = useState("");
  const [bidclubFeedUrlInput, setBidclubFeedUrlInput] = useState("");
  const [enrichmentDisabled, setEnrichmentDisabled] = useState(false);
  const [categoryInput, setCategoryInput] = useState("未分类");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failedCuratedId, setFailedCuratedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"custom" | "curated" | "opml">("custom");
  const [curatedCategory, setCuratedCategory] = useState("Featured");
  const enrichmentSourceEditorEnabled = isEnrichmentSourceEditorEnabled();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Extract existing categories
  const categories = Array.from(
    new Set(["未分类", ...existingFeeds.map((f) => f.category || "未分类")])
  );

  const handleSubscribeCustomUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedUrlInput.trim()) return;

    setIsLoading(true);
    setErrorMsg(null);
    setFailedCuratedId(null);

    const targetCategory = categoryInput === "NEW" ? newCategoryName || "未分类" : categoryInput;

    try {
      const feedUrl = feedUrlInput.trim();
      const parsedData = await fetchRssFeed(feedUrl);
      const manualBidclubFeedUrl = enrichmentSourceEditorEnabled ? bidclubFeedUrlInput.trim() : "";
      const knownSource = resolveKnownEnrichmentSource(feedUrl);
      const source = resolveFeedEnrichmentSource({
        feedUrl,
        bidclubFeedUrl: manualBidclubFeedUrl || undefined,
        enrichmentDisabled: enrichmentSourceEditorEnabled && enrichmentDisabled,
      });
      const bidclubFeedUrl = source.bidclubFeedUrl;
      const bidclubData = bidclubFeedUrl
        ? await fetchRssFeed(bidclubFeedUrl).catch(() => null)
        : null;
      const matchResult = bidclubData
        ? matchBidclubItems(parsedData.items, bidclubData.items)
        : null;
      const matchedItems = matchResult?.items || parsedData.items;
      if (matchResult) console.info("BidClub subscription match summary", matchResult.diagnostics);

      const newFeed: Feed = {
        id: `feed-${Date.now()}`,
        title: parsedData.title || "未命名订阅源",
        feedUrl,
        siteUrl: parsedData.link || feedUrl,
        favicon: parsedData.feedImage || parsedData.favicon,
        category: targetCategory,
        description: parsedData.description,
        unreadCount: parsedData.items ? parsedData.items.length : 0,
        lastUpdated: new Date().toISOString(),
        bidclubFeedUrl,
        bidclubShowSlug: source.bidclubShowSlug,
        ...(enrichmentSourceEditorEnabled && (enrichmentDisabled || manualBidclubFeedUrl) ? { enrichmentDisabled } : {}),
      };

      const newArticles = (matchedItems || []).map((item) => ({
        ...item,
        feedId: newFeed.id,
        feedTitle: newFeed.title,
        feedFavicon: newFeed.favicon,
        read: false,
        starred: false,
      }));

      const added = await onAddFeed(newFeed, newArticles);
      if (added === false) return;
      if (knownSource.bidclubFeedUrl && !enrichmentDisabled) onShowToast?.("已识别为推荐节目，可直接使用已提供的摘要、章节或逐字稿。");
      setFeedUrlInput("");
      setBidclubFeedUrlInput("");
      setEnrichmentDisabled(false);
      onClose();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Existing feed-service rejections have no typed error contract.
    } catch (err: any) {
      setErrorMsg(err.message || "无法获取或解析该 RSS 源，请检查链接是否正确。");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubscribeCurated = async (curated: CuratedFeedOption) => {
    // Check if already subscribed
    const existing = existingFeeds.find((f) => f.feedUrl === curated.feedUrl);
    if (existing) {
      setNotice(`你已订阅「${curated.title}」`);
      setTimeout(() => setNotice(null), 2500);
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setFailedCuratedId(null);
    try {
      const parsedData = await fetchRssFeed(curated.feedUrl);
      if (parsedData.items.length === 0) {
        throw new Error("推荐源暂时没有可用文章，未创建订阅。");
      }

      const newFeed: Feed = {
        id: `feed-${Date.now()}`,
        title: curated.title,
        feedUrl: curated.feedUrl,
        siteUrl: parsedData.link || curated.siteUrl || curated.feedUrl,
        favicon: parsedData.feedImage || curated.favicon || parsedData.favicon,
        category: curated.category,
        description: curated.description,
        unreadCount: parsedData.items ? parsedData.items.length : 0,
        lastUpdated: new Date().toISOString(),
        bidclubFeedUrl: curated.bidclubFeedUrl,
        bidclubShowSlug: curated.bidclubShowSlug,
      };

      const newArticles = (parsedData.items || []).map((item) => ({
        ...item,
        feedId: newFeed.id,
        feedTitle: newFeed.title,
        feedFavicon: newFeed.favicon,
        read: false,
        starred: false,
      }));

      const added = await onAddFeed(newFeed, newArticles);
      if (added === false) return;
      setNotice(`已订阅「${curated.title}」`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Existing feed-service rejections have no typed error contract.
    } catch (err: any) {
      setFailedCuratedId(curated.id);
      setErrorMsg(err.message || `推荐源「${curated.title}」暂时无法获取，未创建订阅。`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      onImportOpmlFile(files[0]);
      onClose();
    }
  };

  const curatedCategories = [
    "Featured",
    "All",
    ...Array.from(new Set(CURATED_FEEDS.map((feed) => feed.category))),
  ];
  const filteredCurated = CURATED_FEEDS.filter((feed) => {
    if (curatedCategory === "Featured") return feed.featured;
    return curatedCategory === "All" || feed.category === curatedCategory;
  });

  const CURATED_CATEGORY_LABELS: Record<string, string> = {
    Featured: "精选",
    All: "全部",
    Technology: "科技",
    Business: "商业",
    Developer: "开发者",
    News: "新闻",
    "AI & Science": "AI 与科学",
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/30 backdrop-blur-[1.5px] flex items-center justify-center p-4 animate-fadeIn">
      <div role="dialog" aria-modal="true" aria-labelledby="add-feed-modal-title" className="bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200/80 text-slate-900 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between bg-slate-50">
          <div>
            <h2 id="add-feed-modal-title" className="font-bold text-lg text-slate-900">添加订阅源</h2>
            <p className="text-xs text-slate-500">
              通过 RSS 链接订阅、从推荐源中发现，或导入 OPML 文件
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭添加订阅源"
            className="wreader-btn-icon"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-50/60 text-xs font-semibold px-6 pt-3 gap-5" role="tablist" aria-label="添加订阅方式">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "custom"}
            onClick={() => {
              setActiveTab("custom");
              setErrorMsg(null);
            }}
            className={`pb-3 border-b-2 transition-all cursor-pointer ${
              activeTab === "custom"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            RSS 链接
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "curated"}
            onClick={() => {
              setActiveTab("curated");
              setErrorMsg(null);
            }}
            className={`pb-3 border-b-2 transition-all cursor-pointer ${
              activeTab === "curated"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            推荐源
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "opml"}
            onClick={() => {
              setActiveTab("opml");
              setErrorMsg(null);
            }}
            className={`pb-3 border-b-2 transition-all cursor-pointer ${
              activeTab === "opml"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            导入 OPML
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === "custom" && (
            <form onSubmit={handleSubscribeCustomUrl} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  RSS / Atom 链接
                </label>
                <div className="relative">
                  <Rss className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="url"
                    required
                    value={feedUrlInput}
                    onChange={(e) => setFeedUrlInput(e.target.value)}
                    placeholder="https://example.com/feed.xml"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {enrichmentSourceEditorEnabled && <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  内容增强源（高级）
                </label>
                <input
                  type="url"
                  value={bidclubFeedUrlInput}
                  onChange={(e) => {
                    setBidclubFeedUrlInput(e.target.value);
                    if (e.target.value.trim()) setEnrichmentDisabled(false);
                  }}
                  placeholder="https://bidclub.ai/feeds/example.zh.xml"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">可选，用于补充摘要、章节和逐字稿；不会替换主 RSS 或音频来源。</p>
                <button type="button" onClick={() => {
                  setEnrichmentDisabled((current) => !current);
                  setBidclubFeedUrlInput("");
                }}>{enrichmentDisabled ? "恢复自动增强" : "关闭内容增强"}</button>
              </div>}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  分类文件夹
                </label>
                <select
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="NEW">+ 新建文件夹…</option>
                </select>
              </div>

              {categoryInput === "NEW" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    新文件夹名称
                  </label>
                  <input
                    type="text"
                    required
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="例如：设计 | 灵感"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              {errorMsg && (
                <div role="alert" className="p-3 rounded-lg bg-rose-50 text-rose-700 text-xs">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="wreader-btn wreader-btn-lg wreader-btn-primary wreader-btn-block"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>正在获取并解析…</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>订阅</span>
                  </>
                )}
              </button>
            </form>
          )}

          {activeTab === "curated" && (
            <div className="space-y-4">
              <p className="text-xs leading-5 text-slate-500">
                部分节目已提供摘要、章节或逐字稿；其他节目可在配置相关服务后生成。
              </p>
              {/* Category Pills */}
              <div className="flex flex-wrap gap-1.5 text-xs">
                {curatedCategories.map(
                  (cat) => (
                    <button
                      key={cat}
                      onClick={() => setCuratedCategory(cat)}
                      className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                        curatedCategory === cat
                          ? "bg-blue-600 text-white font-medium"
                          : "bg-slate-100 text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {CURATED_CATEGORY_LABELS[cat] || cat}
                    </button>
                  )
                )}
              </div>

              {notice && (
                <div className="p-2.5 rounded-lg bg-amber-50 text-amber-800 text-xs">
                  {notice}
                </div>
              )}

              {errorMsg && (
                <div role="alert" className="p-3 rounded-lg bg-rose-50 text-rose-700 text-xs flex items-center justify-between gap-3">
                  <span>{errorMsg}</span>
                  {failedCuratedId && (
                    <button
                      type="button"
                      onClick={() => {
                        const failed = CURATED_FEEDS.find((feed) => feed.id === failedCuratedId);
                        if (failed) void handleSubscribeCurated(failed);
                      }}
                      disabled={isLoading}
                      className="shrink-0 font-semibold underline underline-offset-2 disabled:opacity-50"
                    >
                      重试
                    </button>
                  )}
                </div>
              )}

              {/* Feed Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1 scrollbar-thin">
                {filteredCurated.map((curated) => {
                  const isSubscribed = existingFeeds.some((f) => f.feedUrl === curated.feedUrl);

                  return (
                    <div
                      key={curated.id}
                      className="p-3 rounded-xl bg-slate-50 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <img
                            src={curated.favicon}
                            alt=""
                            className="w-4 h-4 rounded object-contain shrink-0"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                          <span className="font-bold text-xs text-slate-900 truncate">
                            {curated.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                          {curated.description}
                        </p>
                      </div>

                      <div className="mt-3 flex items-center justify-between pt-1">
                        <span className="text-[10px] text-slate-500 bg-slate-200/70 px-1.5 py-0.5 rounded">
                          {CURATED_CATEGORY_LABELS[curated.category] || curated.category}
                        </span>
                        <button
                          onClick={() => handleSubscribeCurated(curated)}
                          disabled={isSubscribed || isLoading}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                            isSubscribed
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-blue-600 hover:bg-blue-700 text-white"
                          }`}
                        >
                          {isSubscribed ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>已订阅</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3" />
                              <span>订阅</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "opml" && (
            <div className="p-8 rounded-2xl text-center space-y-3 bg-slate-50">
              <Upload className="w-8 h-8 text-blue-600 mx-auto" />
              <div>
                <h3 className="font-semibold text-sm text-slate-800">上传 OPML 订阅文件</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  支持从 Inoreader、Feedly、NewsBlur 或任何标准 RSS 客户端导出的订阅文件。
                </p>
              </div>
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs cursor-pointer transition-all">
                <Upload className="w-4 h-4" />
                <span>选择 OPML 文件</span>
                <input
                  type="file"
                  accept=".opml,.xml"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
