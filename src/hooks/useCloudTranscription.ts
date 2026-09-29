import { useCallback, useEffect, useRef, useState } from "react";
import type { Article, CloudTranscriptionTask } from "../types";
import { getTranscriptionSettings } from "../services/dbService";
import { transcriptionApi } from "../services/transcriptionService";

export interface TranscriptionStartResult {
  started: boolean;
  error?: string;
}

export function useCloudTranscription(article: Article | null, onPatch?: (id: string, patch: Partial<Article>) => void) {
  const [missingKey, setMissingKey] = useState(false);
  const inFlight = useRef(false);
  const articleRef = useRef(article);
  articleRef.current = article;

  const poll = useCallback(async () => {
    const current = articleRef.current;
    const task = current?.transcription;
    if (!current || !task?.taskId || task.status !== "processing" || inFlight.current) return;
    const settings = await getTranscriptionSettings();
    if (!settings?.apiKey) {
      setMissingKey(true);
      return;
    }

    inFlight.current = true;
    try {
      const result = await transcriptionApi.poll(task.taskId, settings.apiKey);
      const next: CloudTranscriptionTask = {
        ...task,
        status: result.status,
        segments: result.segments || task.segments,
        error: result.message,
        updatedAt: new Date().toISOString(),
      };
      onPatch?.(current.id, { transcription: next });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Existing cloud provider rejections have no typed error contract.
    } catch (error: any) {
      onPatch?.(current.id, {
        transcription: {
          ...task,
          status: "failed",
          error: error.message || "转录失败",
          updatedAt: new Date().toISOString(),
        },
      });
    } finally {
      inFlight.current = false;
    }
  }, [onPatch]);

  useEffect(() => {
    void poll();
  }, [article?.id, article?.transcription?.taskId, poll]);

  useEffect(() => {
    if (article?.transcription?.status !== "processing") return;
    const timer = window.setInterval(() => void poll(), 5000);
    return () => window.clearInterval(timer);
  }, [article?.transcription?.status, poll]);

  const start = useCallback(async (): Promise<TranscriptionStartResult> => {
    const current = articleRef.current;
    if (!current?.audioUrl) return { started: false, error: "当前节目没有可转录的音频。" };
    if (inFlight.current || current.transcription?.status === "processing") {
      return { started: current.transcription?.status === "processing" };
    }

    const settings = await getTranscriptionSettings();
    if (!settings?.apiKey) {
      setMissingKey(true);
      return { started: false, error: "请先配置转录服务。" };
    }

    setMissingKey(false);
    inFlight.current = true;
    const pending: CloudTranscriptionTask = {
      provider: "aliyun",
      sourceAudioUrl: current.audioUrl,
      status: "processing",
      updatedAt: new Date().toISOString(),
    };
    onPatch?.(current.id, { transcription: pending });

    try {
      const context = settings.contextEnhancement
        ? [current.title, current.feedTitle, current.snippet].filter(Boolean).join("\n").slice(0, 400)
        : undefined;
      const result = await transcriptionApi.submit({
        apiKey: settings.apiKey,
        audioUrl: current.audioUrl,
        language: settings.language,
        diarization: settings.diarization,
        context,
      });
      onPatch?.(current.id, {
        transcription: {
          ...pending,
          taskId: result.taskId,
          updatedAt: new Date().toISOString(),
        },
      });
      return { started: true };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Existing cloud provider rejections have no typed error contract.
    } catch (error: any) {
      const message = error.message || "转录失败";
      onPatch?.(current.id, {
        transcription: {
          ...pending,
          status: "failed",
          error: message,
          updatedAt: new Date().toISOString(),
        },
      });
      return { started: false, error: message };
    } finally {
      inFlight.current = false;
    }
  }, [onPatch]);

  return {
    start,
    poll,
    missingKey,
    clearMissingKey: () => setMissingKey(false),
  };
}
