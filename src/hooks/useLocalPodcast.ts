import { useCallback, useEffect, useRef, useState } from "react";
import type { Article, LocalPodcastArtifacts, LocalPodcastProcessing, LocalTaskStatus } from "../types";
import { localPodcastApi, type LocalSessionStatus } from "../services/localPodcastService";

function mapStatus(value?: string): LocalTaskStatus {
  if (value === "completed") return "completed";
  if (value === "failed" || value === "stale") return "failed";
  if (value === "running" || value === "pending") return "processing";
  return "not_started";
}

export interface LocalTranscriptionStartResult {
  started: boolean;
  error?: string;
}

export function useLocalPodcast(article: Article | null, onPatch?: (id: string, patch: Partial<Article>) => void) {
  const [artifacts, setArtifacts] = useState<LocalPodcastArtifacts | null>(null);
  const [progress, setProgress] = useState(0);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const inFlight = useRef(false);
  const articleRef = useRef(article);
  const patchRef = useRef(onPatch);
  articleRef.current = article;
  patchRef.current = onPatch;

  const applyStatus = useCallback((payload: LocalSessionStatus) => {
    const current = articleRef.current;
    if (!current) return;
    const transcriptionStatus = mapStatus(payload.job.status);
    const insightStatus = mapStatus(payload.job.insight_status);
    const next: LocalPodcastProcessing = {
      sessionId: payload.session_id,
      jobId: payload.job_id,
      sourceAudioUrl: current.localPodcast?.sourceAudioUrl || current.audioUrl || "",
      transcriptionStatus,
      insightStatus,
      updatedAt: new Date().toISOString(),
      error: payload.job.error || undefined,
      insightError: payload.job.insight_error || undefined,
    };
    setProgress(Number(payload.job.progress || 0));
    setFetchError(null);
    if (payload.artifacts?.transcript?.length || payload.artifacts?.digest) setArtifacts(payload.artifacts);
    patchRef.current?.(current.id, { localPodcast: next });
    return next;
  }, []);

  const refresh = useCallback(async (): Promise<LocalSessionStatus | null> => {
    const current = articleRef.current;
    const sessionId = current?.localPodcast?.sessionId;
    if (!current || !sessionId || inFlight.current) return null;
    inFlight.current = true;
    setRestoring(true);
    try {
      const payload = await localPodcastApi.status(sessionId);
      applyStatus(payload);
      return payload;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Existing local-podcast request rejections have no typed error contract.
    catch (error: any) {
      // A transport failure does not mean the persisted NextEcho task failed.
      // Keep the lightweight reference intact so a later retry can restore it.
      setFetchError(error.message || "暂时无法读取本机逐字稿。");
      return null;
    } finally { inFlight.current = false; setRestoring(false); }
  }, [applyStatus]);

  useEffect(() => {
    setArtifacts(null);
    setProgress(0);
    setFetchError(null);
    if (article?.localPodcast?.sessionId) void refresh();
  }, [article?.id, article?.localPodcast?.sessionId, refresh]);

  useEffect(() => {
    const task = article?.localPodcast;
    if (!task?.sessionId || (task.transcriptionStatus !== "processing" && task.insightStatus !== "processing")) return;
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(timer);
  }, [article?.localPodcast?.sessionId, article?.localPodcast?.transcriptionStatus, article?.localPodcast?.insightStatus, refresh]); // eslint-disable-line react-hooks/exhaustive-deps -- Polling follows task fields without restarting for unrelated article updates.

  const startTranscription = useCallback(async (options: { force?: boolean } = {}): Promise<LocalTranscriptionStartResult> => {
    const current = articleRef.current;
    if (!current?.audioUrl) return { started: false, error: "当前节目没有可转录的音频。" };
    if (current.localPodcast?.transcriptionStatus === "processing") return { started: true };
    if (inFlight.current) return { started: false, error: "本地转录正在处理中。" };

    setFetchError(null);
    if (options.force) setArtifacts(null);
    patchRef.current?.(current.id, { localPodcast: { sourceAudioUrl: current.audioUrl, transcriptionStatus: "processing", insightStatus: "not_started", updatedAt: new Date().toISOString() } });
    inFlight.current = true;
    try {
      const session = await localPodcastApi.start({ audioUrl: current.audioUrl, title: current.title, showNotes: current.content || current.snippet || "", force: Boolean(options.force) });
      patchRef.current?.(current.id, { localPodcast: { sessionId: session.session_id, jobId: session.job_id, sourceAudioUrl: current.audioUrl, transcriptionStatus: "processing", insightStatus: "not_started", updatedAt: new Date().toISOString() } });
      return { started: true };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Existing local-podcast request rejections have no typed error contract.
    } catch (error: any) {
      const message = error.message || "本地转录启动失败。";
      setFetchError(message);
      patchRef.current?.(current.id, { localPodcast: { sourceAudioUrl: current.audioUrl, transcriptionStatus: "failed", insightStatus: "not_started", error: message, updatedAt: new Date().toISOString() } });
      return { started: false, error: message };
    } finally { inFlight.current = false; }
  }, []);

  const regenerateTranscription = useCallback(
    () => startTranscription({ force: true }),
    [startTranscription],
  );

  const retryTranscription = useCallback(async () => {
    const current = articleRef.current;
    const task = current?.localPodcast;
    if (!current || inFlight.current) return;
    if (task?.sessionId) {
      const payload = await refresh();
      if (!payload) return;
      if (mapStatus(payload.job.status) !== "failed") return;
    }
    await startTranscription();
  }, [refresh, startTranscription]);

  const createInsight = useCallback(async () => {
    const current = articleRef.current;
    const task = current?.localPodcast;
    if (!current || !task?.sessionId || task.transcriptionStatus !== "completed" || task.insightStatus === "processing" || task.insightStatus === "completed" || inFlight.current) return;
    patchRef.current?.(current.id, { localPodcast: { ...task, insightStatus: "processing", insightError: undefined, updatedAt: new Date().toISOString() } });
    inFlight.current = true;
    try { await localPodcastApi.createInsight(task.sessionId); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Existing local-podcast request rejections have no typed error contract.
    catch (error: any) { patchRef.current?.(current.id, { localPodcast: { ...task, insightStatus: "failed", insightError: error.message, updatedAt: new Date().toISOString() } }); }
    finally { inFlight.current = false; }
  }, []);

  return { artifacts, progress, fetchError, restoring, refresh, startTranscription, regenerateTranscription, retryTranscription, createInsight };
}
