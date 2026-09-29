import { describe, expect, it } from "vitest";
import { countRecentUnreadArticles, formatUnreadCount, getUnreadCountAriaLabel } from "../src/services/unreadCount";

const localTime = (year: number, month: number, day: number, hour = 0, second = 0) =>
  new Date(year, month - 1, day, hour, 0, second).getTime();
const localIso = (...args: Parameters<typeof localTime>) => new Date(localTime(...args)).toISOString();
const now = localTime(2026, 8, 31, 12);

describe("unread count formatting", () => {
  it("shows zero and counts from 1 through 99 exactly", () => {
    expect(formatUnreadCount(0)).toBe("0");
    expect(formatUnreadCount(1)).toBe("1");
    expect(formatUnreadCount(42)).toBe("42");
    expect(formatUnreadCount(99)).toBe("99");
  });

  it("caps counts of 100 or more at 99+", () => {
    expect(formatUnreadCount(100)).toBe("99+");
    expect(formatUnreadCount(1234)).toBe("99+");
  });

  it("keeps the exact count in the accessible label", () => {
    expect(getUnreadCountAriaLabel(100)).toBe("100 篇未读");
    expect(getUnreadCountAriaLabel(1234, "篇未读文章")).toBe("1234 篇未读文章");
  });

  it("normalizes non-finite and fractional values safely", () => {
    expect(formatUnreadCount(-4)).toBe("0");
    expect(formatUnreadCount(2.9)).toBe("2");
    expect(getUnreadCountAriaLabel(Number.NaN)).toBe("0 篇未读");
  });
});

describe("recent unread count scope", () => {
  it("counts only unread articles in the inclusive recent 30-day window", () => {
    const articles = [
      { read: false, pubDate: localIso(2026, 8, 2) },
      { read: false, pubDate: localIso(2026, 8, 30) },
      { read: false, pubDate: localIso(2026, 8, 1, 23, 59) },
      { read: true, pubDate: localIso(2026, 8, 30) },
      { read: false, pubDate: "not-a-date" },
      { read: false, pubDate: localIso(2026, 8, 31, 12, 1) },
    ];

    expect(countRecentUnreadArticles(articles, now)).toBe(2);
  });
});
