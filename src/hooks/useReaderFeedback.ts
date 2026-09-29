import { useCallback, useEffect, useRef, useState } from "react";
import type { Feed } from "../types";

export interface RefreshFeedbackState {
  failed: Feed[];
  successful: number;
  newArticles: number;
  finishedAt?: number;
}

export function useReaderToast() {
  type ReaderToast = { message: string; action?: { label: string; run: () => void } };
  const [toastQueue, setToastQueue] = useState<ReaderToast[]>([]);
  const toast = toastQueue[0] || null;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToastQueue((current) => [...current, { message }]);
  }, []);

  const showToastWithAction = useCallback((message: string, action: { label: string; run: () => void }) => {
    setToastQueue((current) => [...current, { message, action }]);
  }, []);

  useEffect(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (!toast) return;
    toastTimer.current = setTimeout(() => {
      setToastQueue((current) => current.slice(1));
    }, toast.action ? 5000 : 3000);
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [toast]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  return { toast, showToast, showToastWithAction };
}

export function useRefreshFeedback(refreshState: RefreshFeedbackState, isRefreshing: boolean) {
  const [refreshFeedback, setRefreshFeedback] = useState<"success" | "failure" | null>(null);
  const [isRefreshFailureDetailsOpen, setIsRefreshFailureDetailsOpen] = useState(false);
  const refreshFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (refreshFeedbackTimer.current) clearTimeout(refreshFeedbackTimer.current);
  }, []);

  useEffect(() => {
    if (!refreshState.finishedAt || isRefreshing) return;
    if (refreshFeedbackTimer.current) clearTimeout(refreshFeedbackTimer.current);
    if (refreshState.failed.length > 0) {
      setRefreshFeedback("failure");
      setIsRefreshFailureDetailsOpen(false);
      return;
    }
    setRefreshFeedback("success");
    refreshFeedbackTimer.current = setTimeout(() => setRefreshFeedback(null), 3500);
  }, [isRefreshing, refreshState.failed.length, refreshState.finishedAt]);

  return {
    refreshFeedback,
    setRefreshFeedback,
    isRefreshFailureDetailsOpen,
    setIsRefreshFailureDetailsOpen,
  };
}
