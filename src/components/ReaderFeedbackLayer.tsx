import type { Feed } from "../types";
import type { ArticleGenerationTask } from "../hooks/useArticleGenerationTasks";

interface ReaderFeedbackLayerProps {
  toast: { message: string; action?: { label: string; run: () => void } } | null;
  refreshFeedback: "success" | "failure" | null;
  refreshState: { failed: Feed[]; successful: number; newArticles: number };
  failureDetailsOpen: boolean;
  onFailureDetailsOpenChange: (open: boolean) => void;
  onDismissRefresh: () => void;
  onRetryFailed: () => void;
  onRetryFeed: (feedId: string) => void;
  generationTask?: ArticleGenerationTask | null;
  generationCount?: number;
  onViewGeneration?: (task: ArticleGenerationTask) => void;
  onDismissGeneration?: (articleId: string) => void;
}

export function ReaderFeedbackLayer({
  toast,
  refreshFeedback,
  refreshState,
  failureDetailsOpen,
  onFailureDetailsOpenChange,
  onDismissRefresh,
  onRetryFailed,
  onRetryFeed,
  generationTask,
  generationCount = 0,
  onViewGeneration,
  onDismissGeneration,
}: ReaderFeedbackLayerProps) {
  return <div className="wreader-toast-stack" aria-live="polite" aria-atomic="true">
    {toast && <div className="wreader-toast" role="status">
      <span>{toast.message}</span>
      {toast.action && <button type="button" onClick={toast.action.run} className="wreader-toast-action">{toast.action.label}</button>}
    </div>}
    {refreshFeedback && <section className={`wreader-toast wreader-refresh-feedback ${refreshFeedback === "failure" ? "is-error" : ""}`} role="status">
      {refreshFeedback === "success" ? <span>同步完成：已更新 {refreshState.successful} 个订阅源，发现 {refreshState.newArticles} 篇新内容。</span> : <>
        <span>{refreshState.failed.length} 个订阅源同步失败</span>
        <button type="button" onClick={() => onFailureDetailsOpenChange(!failureDetailsOpen)} aria-expanded={failureDetailsOpen}>{failureDetailsOpen ? "收起" : "查看"}</button>
        <button type="button" onClick={onRetryFailed}>重试</button>
        <button type="button" className="toast-close" onClick={onDismissRefresh} aria-label="关闭同步失败提示">关闭</button>
      </>}
    </section>}
    {generationTask && <section className={`wreader-toast wreader-generation-feedback ${generationTask.status === "failed" ? "is-error" : ""}`} role="status">
      <span>
        {generationTask.status === "failed"
          ? `《${generationTask.articleTitle}》的${generationTask.stage === "summarizing" ? "AI 摘要" : "逐字稿"}生成失败`
          : `正在生成《${generationTask.articleTitle}》的${generationTask.stage === "summarizing" ? "AI 摘要" : "逐字稿"}`}
        {generationTask.status === "processing" && typeof generationTask.progress === "number" ? ` · ${Math.round(generationTask.progress)}%` : ""}
        {generationTask.status === "processing" && generationCount > 1 ? ` · 另有 ${generationCount - 1} 项` : ""}
      </span>
      {onViewGeneration && <button type="button" onClick={() => onViewGeneration(generationTask)}>查看</button>}
      {generationTask.status === "failed" && onDismissGeneration && <button type="button" className="toast-close" onClick={() => onDismissGeneration(generationTask.articleId)} aria-label="关闭生成失败提示">关闭</button>}
    </section>}
    {refreshFeedback === "failure" && failureDetailsOpen && <section className="wreader-refresh-failure-panel" aria-label="刷新失败详情">
      <div className="wreader-failure-heading"><strong>刷新失败详情</strong><button type="button" onClick={() => onFailureDetailsOpenChange(false)} aria-label="关闭失败详情"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
      <p>以下订阅源未能更新，可逐个重试。</p>
      <div className="wreader-failure-list">{refreshState.failed.map((feed) => <div key={feed.id}><span title={feed.lastSyncError}>{feed.title}</span><button type="button" onClick={() => onRetryFeed(feed.id)}>重试</button></div>)}</div>
    </section>}
  </div>;
}
