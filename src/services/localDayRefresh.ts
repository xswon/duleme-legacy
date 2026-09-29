const FALLBACK_REFRESH_DELAY_MS = 60_000;

type TimerHandle = ReturnType<typeof setTimeout>;

interface VisibilityTarget {
  visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export interface LocalDayRefreshOptions {
  now?: () => number;
  visibilityTarget?: VisibilityTarget | null;
  setTimeoutFn?: (callback: () => void, delay: number) => TimerHandle;
  clearTimeoutFn?: (handle: TimerHandle) => void;
}

/** Milliseconds until the next local midnight, including DST transitions. */
export function millisecondsUntilNextLocalMidnight(now = Date.now()): number {
  if (!Number.isFinite(now)) return FALLBACK_REFRESH_DELAY_MS;
  const nextMidnight = new Date(now);
  nextMidnight.setHours(0, 0, 0, 0);
  nextMidnight.setDate(nextMidnight.getDate() + 1);
  const delay = nextMidnight.getTime() - now;
  return Number.isFinite(delay) && delay > 0 ? delay : FALLBACK_REFRESH_DELAY_MS;
}

/**
 * Notify a React owner when local-day-derived views must be recomputed.
 * This utility owns no article state: consumers can increment a clock/version
 * value and include it in their count/list memo dependencies.
 */
export function subscribeToLocalDayRefresh(
  onRefresh: () => void,
  options: LocalDayRefreshOptions = {},
): () => void {
  const now = options.now ?? Date.now;
  const visibilityTarget = options.visibilityTarget ?? (typeof document === "undefined" ? null : document);
  const setTimer = options.setTimeoutFn ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer = options.clearTimeoutFn ?? ((handle) => clearTimeout(handle));
  let timer: TimerHandle | null = null;
  let disposed = false;

  const schedule = () => {
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      if (disposed) return;
      onRefresh();
      schedule();
    }, millisecondsUntilNextLocalMidnight(now()));
  };

  const handleVisibilityChange = () => {
    if (visibilityTarget?.visibilityState !== "visible" || disposed) return;
    onRefresh();
    schedule();
  };

  visibilityTarget?.addEventListener("visibilitychange", handleVisibilityChange);
  schedule();

  return () => {
    disposed = true;
    if (timer !== null) clearTimer(timer);
    visibilityTarget?.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
