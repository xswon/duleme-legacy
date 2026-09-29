import { describe, expect, it } from "vitest";
import type { Article } from "../src/types";
import { OptimisticArticleMutationTracker } from "../src/services/optimisticArticleMutation";

const article = (overrides: Partial<Article> = {}): Article => ({
  id: "article-1",
  feedId: "feed-1",
  feedTitle: "Feed",
  title: "Article",
  link: "https://example.com/article-1",
  pubDate: "2026-09-23T00:00:00.000Z",
  snippet: "snippet",
  content: "content",
  read: false,
  starred: false,
  ...overrides,
});

describe("OptimisticArticleMutationTracker", () => {
  it("restores a failed read patch without overwriting a newer star mutation", () => {
    const tracker = new OptimisticArticleMutationTracker();
    const initial = article();
    const failedRead = tracker.begin(initial.id, { read: true });
    const newerStar = tracker.begin(initial.id, { starred: true, savedAt: "2026-09-23T01:00:00.000Z" });
    const current = [{ ...initial, read: true, starred: true, savedAt: "2026-09-23T01:00:00.000Z" }];

    const restored = tracker.restoreIfCurrent(current, initial, failedRead);

    expect(restored).toEqual([{ ...initial, starred: true, savedAt: "2026-09-23T01:00:00.000Z" }]);
    expect(newerStar).toBeDefined();
  });

  it("does not roll back a newer mutation to the same field", () => {
    const tracker = new OptimisticArticleMutationTracker();
    const initial = article();
    const olderRead = tracker.begin(initial.id, { read: true });
    tracker.begin(initial.id, { read: false });

    expect(tracker.restoreIfCurrent([{ ...initial, read: false }], initial, olderRead))
      .toEqual([{ ...initial, read: false }]);
  });
});
