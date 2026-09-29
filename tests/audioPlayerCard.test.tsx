import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AudioPlayerCard, resolveDurationLabel } from "../src/components/AudioPlayerCard";
import type { Article } from "../src/types";

const article: Article = {
  id: "episode-1",
  feedId: "feed-1",
  feedTitle: "Example",
  title: "Episode",
  link: "https://example.com/episode",
  content: "",
  snippet: "",
  pubDate: "2026-08-18T00:00:00Z",
  read: false,
  starred: false,
  audioUrl: "https://example.com/episode.mp3",
};

const model = (isInPlaylist: boolean) => ({
  article,
  audioRef: React.createRef<HTMLAudioElement>(),
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  playbackRate: 1,
  audioPlayError: null,
  isInPlaylist,
  onTogglePlaylist: vi.fn(),
  togglePlay: vi.fn(),
  onSeek: vi.fn(),
  onRateChange: vi.fn(),
  onRewind: vi.fn(),
  onForward: vi.fn(),
  onTimeUpdate: vi.fn(),
  onLoadedMetadata: vi.fn(),
  onEnded: vi.fn(),
  onError: vi.fn(),
});

describe("AudioPlayerCard playlist control", () => {
  it("prefers the exact media duration and normalizes numeric feed durations", () => {
    expect(resolveDurationLabel(2536, "42 分钟")).toBe("42:16");
    expect(resolveDurationLabel(0, "2536")).toBe("42:16");
    expect(resolveDurationLabel(0, "42:16")).toBe("42:16");
  });

  it("preserves queue state while rendering the confirmed player controls", () => {
    const inactive = renderToStaticMarkup(<AudioPlayerCard model={model(false)} />);
    expect(inactive).toContain("M16 5H3M11 12H3M16 19H3M18 9v6M21 12h-6");
    expect(inactive).toContain('title="加入待播列表"');
    expect(inactive).toContain('aria-label="加入待播列表"');

    const active = renderToStaticMarkup(<AudioPlayerCard model={model(true)} />);
    expect(active).toContain("lucide-list-check");
    expect(active).toContain('title="已在播放列表中（点击移除）"');
    expect(active).toContain('aria-label="已在播放列表中（点击移除）"');
    expect(active).toContain("wreader-audio-card");
    expect(active).toContain("player-track");
    expect(active).toContain("player-toggle");
    expect(active).toContain('aria-label="后退 15 秒"');
    const rewindStart = active.indexOf('title="后退 15 秒"');
    const rewindEnd = active.indexOf("</button>", rewindStart);
    const rewindHtml = active.slice(rewindStart, rewindEnd);
    expect(rewindHtml).toContain('d="M3 12a9 9 0 1 0 9-9c-2.52 0-4.93 1-6.74 2.74L3 8M3 3v5h5"');
    expect(rewindHtml).toContain('d="M9 12h6"');
    expect(rewindHtml).not.toContain("<text");
    expect(rewindHtml).not.toContain("M12 8v8M9 12h6");
  });
});
