import { afterEach, describe, expect, it, vi } from "vitest";
import { millisecondsUntilNextLocalMidnight, subscribeToLocalDayRefresh } from "../src/services/localDayRefresh";

class FakeVisibilityTarget {
  visibilityState: DocumentVisibilityState = "hidden";
  private listener: (() => void) | null = null;

  addEventListener(_type: "visibilitychange", listener: () => void) {
    this.listener = listener;
  }

  removeEventListener(_type: "visibilitychange", listener: () => void) {
    if (this.listener === listener) this.listener = null;
  }

  show() {
    this.visibilityState = "visible";
    this.listener?.();
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("local day refresh", () => {
  it("calculates the delay to the next local midnight", () => {
    const now = new Date(2026, 7, 31, 23, 59, 30).getTime();
    expect(millisecondsUntilNextLocalMidnight(now)).toBe(30_000);
    expect(millisecondsUntilNextLocalMidnight(Number.NaN)).toBe(60_000);
  });

  it("refreshes at local midnight and schedules the following midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 31, 23, 59, 59, 900));
    const refresh = vi.fn();
    const unsubscribe = subscribeToLocalDayRefresh(refresh, { visibilityTarget: null });

    vi.advanceTimersByTime(99);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(refresh).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it("refreshes and reschedules whenever the page becomes visible", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 31, 10));
    const target = new FakeVisibilityTarget();
    const refresh = vi.fn();
    const unsubscribe = subscribeToLocalDayRefresh(refresh, { visibilityTarget: target });

    target.show();
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(2026, 8, 1, 10));
    target.show();
    expect(refresh).toHaveBeenCalledTimes(2);

    unsubscribe();
    target.show();
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
