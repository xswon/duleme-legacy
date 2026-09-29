import type { Article, Feed } from "../src/types";

export const PERF_NOW = new Date(2026, 8, 24, 12).getTime();

export function createPerfData(articleCount = 50_000, feedCount = 500, categoryCount = 20): { articles: Article[]; feeds: Feed[] } {
  const feeds = Array.from({ length: feedCount }, (_, index): Feed => ({
    id: `feed-${index}`,
    title: `Feed ${index}`,
    feedUrl: `https://example.com/feed-${index}.xml`,
    siteUrl: `https://example.com/feed-${index}`,
    category: `Category ${index % categoryCount}`,
    unreadCount: 0,
  }));
  const articles = Array.from({ length: articleCount }, (_, index): Article => {
    const date = new Date(PERF_NOW);
    date.setDate(date.getDate() - (index % 90));
    const pubDate = index % 997 === 0
      ? "invalid"
      : index % 991 === 0
        ? new Date(PERF_NOW + 86_400_000).toISOString()
        : date.toISOString();
    const matches = index % 10 === 0;
    return {
      id: `article-${index}`,
      feedId: feeds[index % feedCount].id,
      feedTitle: feeds[index % feedCount].title,
      title: matches ? `Needle performance article ${index}` : `Article ${index}`,
      link: `https://example.com/articles/${index}`,
      content: `<p>${matches ? "Search needle body" : "Ordinary body"} ${index}</p>`,
      snippet: matches ? "Needle summary" : "Summary",
      author: `Author ${index % 100}`,
      pubDate,
      read: index % 3 === 0,
      starred: index % 17 === 0,
      audioUrl: index % 5 === 0 ? `https://example.com/audio/${index}.mp3` : undefined,
    };
  });
  return { articles, feeds };
}
