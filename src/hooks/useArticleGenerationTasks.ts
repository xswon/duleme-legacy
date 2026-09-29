import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { Article, DetailTab, LocalPodcastArtifacts, LocalTaskStatus, TranscriptSegment } from "../types";
import { getTranscriptionSettings } from "../services/dbService";
import { localPodcastApi, type LocalSessionStatus } from "../services/localPodcastService";
import { summarizeArticleWithAI } from "../services/rssService";
import { transcriptionApi } from "../services/transcriptionService";

export type ArticleGenerationStage = "transcribing" | "summarizing";
export type ArticleGenerationStatus = "processing" | "completed" | "failed";

export interface ArticleGenerationTask {
  articleId: string;
  articleTitle: string;
  kind: "transcription" | "summary" | "pipeline";
  stage: ArticleGenerationStage;
  status: ArticleGenerationStatus;
  progress?: number;
  error?: string;
  dismissed?: boolean;
  updatedAt: number;
}

interface StartTranscriptionOptions {
  preferLocal: boolean;
  force?: boolean;
}

interface StartSummaryOptions {
  source: "article" | "transcript";
  input: string;
  snippet: string;
  preferLocal: boolean;
  force?: boolean;
}

interface UseArticleGenerationTasksOptions {
  articles: Article[];
  articlesRef: MutableRefObject<Article[]>;
  patchArticle: (articleId: string, patch: Partial<Article>) => void;
  isResultVisible: (articleId: string, tab: DetailTab) => boolean;
  onCompleted: (message: string, articleId: string, tab: DetailTab) => void;
}

function mapLocalStatus(value?: string): LocalTaskStatus {
  if (value === "completed") return "completed";
  if (value === "failed" || value === "stale") return "failed";
  if (value === "running" || value === "pending") return "processing";
  return "not_started";
}

function formatTranscript(segments?: TranscriptSegment[]): string {
  const timestamp = (startMs: number) => {
    const totalSeconds = Math.max(0, Math.floor(startMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };
  return segments?.map((segment) => `[${timestamp(segment.startMs)}] ${segment.text}`).join("\n").trim() || "";
}

export function useArticleGenerationTasks({
  articles,
  articlesRef,
  patchArticle,
  isResultVisible,
  onCompleted,
}: UseArticleGenerationTasksOptions) {
  const [tasks, setTasks] = useState<Record<string, ArticleGenerationTask>>({});
  const [artifactsByArticleId, setArtifactsByArticleId] = useState<Record<string, LocalPodcastArtifacts>>({});
  const tasksRef = useRef(tasks);
  const pollingRef = useRef(new Set<string>());
  const summaryRef = useRef(new Set<string>());
  const callbacksRef = useRef({ patchArticle, isResultVisible, onCompleted });
  tasksRef.current = tasks;
  callbacksRef.current = { patchArticle, isResultVisible, onCompleted };

  const findArticle = useCallback((articleId: string) => (
    articlesRef.current.find((article) => article.id === articleId)
  ), [articlesRef]);

  const updateTask = useCallback((articleId: string, patch: Partial<ArticleGenerationTask>) => {
    setTasks((current) => {
      const existing = current[articleId];
      if (!existing) return current;
      return {
        ...current,
        [articleId]: { ...existing, ...patch, updatedAt: Date.now() },
      };
    });
  }, []);

  const setUnread = useCallback((articleId: string, key: "transcript" | "summary") => {
    const article = findArticle(articleId);
    if (!article) return;
    const tab: DetailTab = key === "summary" ? "overview" : "transcript";
    callbacksRef.current.patchArticle(articleId, {
      insightUnread: {
        ...article.insightUnread,
        [key]: !callbacksRef.current.isResultVisible(articleId, tab),
      },
    });
  }, [findArticle]);

  const failTask = useCallback((articleId: string, message: string) => {
    updateTask(articleId, { status: "failed", error: message, dismissed: false });
  }, [updateTask]);

  const runSummary = useCallback(async (
    article: Article,
    input: string,
    source: "article" | "transcript",
    kind: "summary" | "pipeline",
  ): Promise<boolean> => {
    if (!input.trim() || summaryRef.current.has(article.id)) return false;
    summaryRef.current.add(article.id);
    setTasks((current) => ({
      ...current,
      [article.id]: {
        articleId: article.id,
        articleTitle: article.title,
        kind,
        stage: "summarizing",
        status: "processing",
        progress: 0,
        updatedAt: Date.now(),
      },
    }));
    try {
      const summary = await summarizeArticleWithAI(
        article.title,
        input,
        source === "article" ? article.snippet : article.content || article.snippet,
        source,
        (progress) => updateTask(article.id, { progress }),
      );
      const current = findArticle(article.id) || article;
      callbacksRef.current.patchArticle(article.id, {
        aiSummary: summary,
        aiSummarySource: source,
        insightUnread: {
          ...current.insightUnread,
          summary: !callbacksRef.current.isResultVisible(article.id, "overview"),
        },
      });
      updateTask(article.id, { status: "completed", progress: 100, error: undefined });
      callbacksRef.current.onCompleted(
        kind === "pipeline" ? `《${article.title}》的逐字稿和 AI 摘要已生成` : `《${article.title}》的 AI 摘要已生成`,
        article.id,
        "overview",
      );
      return true;
    } catch (error) {
      failTask(article.id, error instanceof Error ? error.message : "AI 摘要生成失败，请稍后重试。");
      return false;
    } finally {
      summaryRef.current.delete(article.id);
    }
  }, [failTask, findArticle, updateTask]);

  const finishTranscription = useCallback(async (
    article: Article,
    segments: TranscriptSegment[],
    task: ArticleGenerationTask,
  ) => {
    setUnread(article.id, "transcript");
    if (task.kind === "pipeline") {
      const transcript = formatTranscript(segments);
      if (!transcript) {
        failTask(article.id, "逐字稿为空，请重新生成后再试。");
        return;
      }
      await runSummary(article, transcript, "transcript", "pipeline");
      return;
    }
    updateTask(article.id, { status: "completed", progress: 100, error: undefined });
    callbacksRef.current.onCompleted(`《${article.title}》的逐字稿已生成`, article.id, "transcript");
  }, [failTask, runSummary, setUnread, updateTask]);

  const pollLocal = useCallback(async (article: Article, task: ArticleGenerationTask) => {
    const sessionId = article.localPodcast?.sessionId;
    if (!sessionId || pollingRef.current.has(article.id)) return;
    pollingRef.current.add(article.id);
    try {
      const payload: LocalSessionStatus = await localPodcastApi.status(sessionId);
      const status = mapLocalStatus(payload.job.status);
      const nextLocal = {
        sessionId: payload.session_id,
        jobId: payload.job_id,
        sourceAudioUrl: article.localPodcast?.sourceAudioUrl || article.audioUrl || "",
        transcriptionStatus: status,
        insightStatus: mapLocalStatus(payload.job.insight_status),
        updatedAt: new Date().toISOString(),
        error: payload.job.error || undefined,
        insightError: payload.job.insight_error || undefined,
      };
      callbacksRef.current.patchArticle(article.id, { localPodcast: nextLocal });
      updateTask(article.id, { progress: Number.isFinite(payload.job.progress) ? Number(payload.job.progress) : undefined });
      if (payload.artifacts?.transcript?.length || payload.artifacts?.digest) {
        setArtifactsByArticleId((current) => ({ ...current, [article.id]: payload.artifacts }));
      }
      if (status === "failed") {
        failTask(article.id, payload.job.error || "逐字稿生成失败，请重试。");
      } else if (status === "completed") {
        await finishTranscription(article, payload.artifacts?.transcript || [], task);
      }
    } catch (error) {
      // A temporary status request failure must not turn a provider-side job into a failed task.
      updateTask(article.id, { error: error instanceof Error ? error.message : "暂时无法读取转录进度。" });
    } finally {
      pollingRef.current.delete(article.id);
    }
  }, [failTask, finishTranscription, updateTask]);

  const pollCloud = useCallback(async (article: Article, task: ArticleGenerationTask) => {
    const cloud = article.transcription;
    if (!cloud?.taskId || pollingRef.current.has(article.id)) return;
    pollingRef.current.add(article.id);
    try {
      const settings = await getTranscriptionSettings();
      if (!settings?.apiKey) {
        failTask(article.id, "请先配置转录服务。");
        return;
      }
      const result = await transcriptionApi.poll(cloud.taskId, settings.apiKey);
      const next = {
        ...cloud,
        status: result.status,
        segments: result.segments || cloud.segments,
        error: result.message,
        updatedAt: new Date().toISOString(),
      };
      callbacksRef.current.patchArticle(article.id, { transcription: next });
      if (result.status === "failed") {
        failTask(article.id, result.message || "逐字稿生成失败，请重试。");
      } else if (result.status === "completed") {
        await finishTranscription(article, next.segments || [], task);
      }
    } catch (error) {
      updateTask(article.id, { error: error instanceof Error ? error.message : "暂时无法读取转录进度。" });
    } finally {
      pollingRef.current.delete(article.id);
    }
  }, [failTask, finishTranscription, updateTask]);

  const startTranscriptionInternal = useCallback(async (
    article: Article,
    options: StartTranscriptionOptions,
    kind: "transcription" | "pipeline",
  ): Promise<{ started: boolean; error?: string }> => {
    if (!article.audioUrl) return { started: false, error: "当前节目没有可转录的音频。" };
    setTasks((current) => ({
      ...current,
      [article.id]: {
        articleId: article.id,
        articleTitle: article.title,
        kind,
        stage: "transcribing",
        status: "processing",
        progress: options.preferLocal ? 0 : undefined,
        updatedAt: Date.now(),
      },
    }));
    callbacksRef.current.patchArticle(article.id, {
      insightUnread: { ...article.insightUnread, transcript: false, ...(kind === "pipeline" ? { summary: false } : {}) },
    });

    try {
      if (options.preferLocal) {
        const pending = {
          sourceAudioUrl: article.audioUrl,
          transcriptionStatus: "processing" as const,
          insightStatus: "not_started" as const,
          updatedAt: new Date().toISOString(),
        };
        callbacksRef.current.patchArticle(article.id, { localPodcast: pending });
        const session = await localPodcastApi.start({
          audioUrl: article.audioUrl,
          title: article.title,
          showNotes: article.content || article.snippet || "",
          force: Boolean(options.force),
        });
        callbacksRef.current.patchArticle(article.id, {
          localPodcast: { ...pending, sessionId: session.session_id, jobId: session.job_id },
        });
      } else {
        const settings = await getTranscriptionSettings();
        if (!settings?.apiKey) throw new Error("请先配置转录服务。");
        const pending = {
          provider: "aliyun" as const,
          sourceAudioUrl: article.audioUrl,
          status: "processing" as const,
          updatedAt: new Date().toISOString(),
        };
        callbacksRef.current.patchArticle(article.id, { transcription: pending });
        const context = settings.contextEnhancement
          ? [article.title, article.feedTitle, article.snippet].filter(Boolean).join("\n").slice(0, 400)
          : undefined;
        const result = await transcriptionApi.submit({
          apiKey: settings.apiKey,
          audioUrl: article.audioUrl,
          language: settings.language,
          diarization: settings.diarization,
          context,
        });
        callbacksRef.current.patchArticle(article.id, {
          transcription: { ...pending, taskId: result.taskId, updatedAt: new Date().toISOString() },
        });
      }
      return { started: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "逐字稿生成失败，请重试。";
      const failedAt = new Date().toISOString();
      if (options.preferLocal) {
        callbacksRef.current.patchArticle(article.id, {
          localPodcast: {
            sourceAudioUrl: article.audioUrl,
            transcriptionStatus: "failed",
            insightStatus: "not_started",
            updatedAt: failedAt,
            error: message,
          },
        });
      } else {
        callbacksRef.current.patchArticle(article.id, {
          transcription: {
            provider: "aliyun",
            sourceAudioUrl: article.audioUrl,
            status: "failed",
            updatedAt: failedAt,
            error: message,
          },
        });
      }
      failTask(article.id, message);
      return { started: false, error: message };
    }
  }, [failTask]);

  const startTranscription = useCallback(async (articleId: string, options: StartTranscriptionOptions) => {
    const article = findArticle(articleId);
    if (!article) return { started: false, error: "文章不存在。" };
    return startTranscriptionInternal(article, options, "transcription");
  }, [findArticle, startTranscriptionInternal]);

  const startSummary = useCallback(async (articleId: string, options: StartSummaryOptions) => {
    const article = findArticle(articleId);
    if (!article) return false;
    callbacksRef.current.patchArticle(article.id, {
      insightUnread: { ...article.insightUnread, summary: false },
    });
    if (options.input.trim()) {
      return runSummary(article, options.input, options.source, "summary");
    }
    if (!article.audioUrl) return false;
    const result = await startTranscriptionInternal(article, {
      preferLocal: options.preferLocal,
      force: options.force,
    }, "pipeline");
    return result.started;
  }, [findArticle, runSummary, startTranscriptionInternal]);

  useEffect(() => {
    const restore: Record<string, ArticleGenerationTask> = {};
    articles.forEach((article) => {
      if (tasksRef.current[article.id]) return;
      if (article.localPodcast?.transcriptionStatus === "processing" || article.transcription?.status === "processing") {
        restore[article.id] = {
          articleId: article.id,
          articleTitle: article.title,
          kind: "transcription",
          stage: "transcribing",
          status: "processing",
          updatedAt: Date.now(),
        };
      }
    });
    if (Object.keys(restore).length > 0) setTasks((current) => ({ ...restore, ...current }));
  }, [articles]);

  useEffect(() => {
    const poll = () => {
      Object.values(tasksRef.current).forEach((task) => {
        if (task.status !== "processing" || task.stage !== "transcribing") return;
        const article = findArticle(task.articleId);
        if (!article) return;
        if (article.localPodcast?.sessionId) void pollLocal(article, task);
        else if (article.transcription?.taskId) void pollCloud(article, task);
      });
    };
    poll();
    const timer = window.setInterval(poll, 3000);
    return () => window.clearInterval(timer);
  }, [findArticle, pollCloud, pollLocal]);

  const clearUnread = useCallback((articleId: string, tab: DetailTab) => {
    const article = findArticle(articleId);
    const key = tab === "overview" ? "summary" : tab === "transcript" ? "transcript" : null;
    if (!article || !key || !article.insightUnread?.[key]) return;
    callbacksRef.current.patchArticle(articleId, {
      insightUnread: { ...article.insightUnread, [key]: false },
    });
  }, [findArticle]);

  const dismissTask = useCallback((articleId: string) => {
    updateTask(articleId, { dismissed: true });
  }, [updateTask]);

  const feedbackTask = useMemo(() => Object.values(tasks)
    .filter((task) => task.status === "processing" || (task.status === "failed" && !task.dismissed))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0] || null, [tasks]);
  const processingCount = useMemo(() => Object.values(tasks)
    .filter((task) => task.status === "processing").length, [tasks]);

  return {
    tasks,
    feedbackTask,
    processingCount,
    artifactsByArticleId,
    startTranscription,
    startSummary,
    clearUnread,
    dismissTask,
  };
}

export type ArticleGenerationController = ReturnType<typeof useArticleGenerationTasks>;
