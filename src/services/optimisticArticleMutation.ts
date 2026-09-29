import type { Article } from "../types";

export interface ArticleMutationToken {
  articleId: string;
  versions: Map<keyof Article, number>;
}

/**
 * Tracks ownership of optimistic article fields. A failed older request may
 * restore only fields that have not since been changed by a newer request.
 */
export class OptimisticArticleMutationTracker {
  private versionsByArticle = new Map<string, Map<keyof Article, number>>();

  begin(articleId: string, patch: Partial<Article>): ArticleMutationToken {
    const versions = this.versionsByArticle.get(articleId) || new Map<keyof Article, number>();
    this.versionsByArticle.set(articleId, versions);
    const tokenVersions = new Map<keyof Article, number>();

    (Object.keys(patch) as Array<keyof Article>).forEach((field) => {
      const version = (versions.get(field) || 0) + 1;
      versions.set(field, version);
      tokenVersions.set(field, version);
    });

    return { articleId, versions: tokenVersions };
  }

  restoreIfCurrent(current: Article[], previous: Article, token: ArticleMutationToken): Article[] {
    return current.map((article) => {
      if (article.id !== token.articleId) return article;
      const versions = this.versionsByArticle.get(token.articleId);
      if (!versions) return article;
      let restored = article;

      token.versions.forEach((version, field) => {
        if (versions.get(field) === version) restored = { ...restored, [field]: previous[field] };
      });

      return restored;
    });
  }
}
