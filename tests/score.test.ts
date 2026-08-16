import { describe, expect, it } from "vitest";
import { baselineViews, median, scoreVideos, selectOutliers } from "@/lib/ideas/score";
import type { Video } from "@/lib/schemas/youtube";

const NOW = new Date("2026-08-16T00:00:00.000Z");

function video(overrides: Partial<Video> & { viewCount: number; daysAgo: number }): Video {
  const { daysAgo, ...rest } = overrides;
  return {
    videoId: rest.videoId ?? `v${overrides.viewCount}-${daysAgo}`,
    title: rest.title ?? "A video",
    url: rest.url ?? "https://www.youtube.com/watch?v=abc",
    thumbnailUrl: null,
    durationSeconds: 600,
    likeCount: null,
    commentCount: null,
    publishedAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
    ...rest,
  };
}

describe("median", () => {
  it("handles odd and even lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("returns 0 for an empty list rather than NaN", () => {
    expect(median([])).toBe(0);
  });
});

describe("baselineViews", () => {
  it("uses the median, so one viral video does not hide every other outlier", () => {
    const videos = [
      video({ viewCount: 10_000, daysAgo: 100 }),
      video({ viewCount: 11_000, daysAgo: 90 }),
      video({ viewCount: 9_000, daysAgo: 80 }),
      video({ viewCount: 10_500, daysAgo: 70 }),
      video({ viewCount: 5_000_000, daysAgo: 60 }),
    ];

    // The mean here is over 1M, which would make every normal video look like
    // a flop. The median stays honest.
    expect(baselineViews(videos, NOW)).toBe(10_500);
  });

  it("excludes videos too new to have accumulated views", () => {
    const mature = Array.from({ length: 6 }, (_, index) =>
      video({ viewCount: 100_000, daysAgo: 40 + index }),
    );
    const brandNew = [
      video({ viewCount: 500, daysAgo: 1 }),
      video({ viewCount: 800, daysAgo: 2 }),
    ];

    expect(baselineViews([...mature, ...brandNew], NOW)).toBe(100_000);
  });

  it("falls back to all videos when there are too few mature ones to trust", () => {
    const videos = [
      video({ viewCount: 1_000, daysAgo: 1 }),
      video({ viewCount: 3_000, daysAgo: 2 }),
      video({ viewCount: 2_000, daysAgo: 3 }),
    ];
    expect(baselineViews(videos, NOW)).toBe(2_000);
  });

  it("never returns 0, so scoring cannot divide by zero", () => {
    expect(baselineViews([video({ viewCount: 0, daysAgo: 30 })], NOW)).toBe(1);
    expect(baselineViews([], NOW)).toBe(1);
  });
});

describe("scoreVideos", () => {
  const videos = [
    video({ videoId: "typical", viewCount: 10_000, daysAgo: 100 }),
    video({ videoId: "alsoTypical", viewCount: 10_000, daysAgo: 90 }),
    video({ videoId: "breakout", viewCount: 40_000, daysAgo: 80 }),
    video({ videoId: "flop", viewCount: 2_000, daysAgo: 70 }),
    video({ videoId: "mid", viewCount: 10_000, daysAgo: 60 }),
  ];

  it("scores against the channel's own median, not an absolute number", () => {
    const scored = scoreVideos(videos, NOW);
    const byId = Object.fromEntries(scored.map((v) => [v.videoId, v]));

    expect(byId.typical.outlierScore).toBe(1);
    expect(byId.breakout.outlierScore).toBe(4);
    expect(byId.flop.outlierScore).toBe(0.2);
  });

  it("computes velocity as views per day", () => {
    const scored = scoreVideos([video({ viewCount: 1_000, daysAgo: 10 })], NOW);
    expect(scored[0].velocity).toBe(100);
  });

  it("floors age at one day so a video published today is not divided by zero", () => {
    const scored = scoreVideos([video({ viewCount: 5_000, daysAgo: 0 })], NOW);
    expect(scored[0].ageDays).toBe(1);
    expect(Number.isFinite(scored[0].velocity)).toBe(true);
  });
});

describe("selectOutliers", () => {
  const videos = [
    video({ videoId: "a", viewCount: 10_000, daysAgo: 100 }),
    video({ videoId: "b", viewCount: 10_000, daysAgo: 90 }),
    video({ videoId: "c", viewCount: 10_000, daysAgo: 80 }),
    video({ videoId: "big", viewCount: 90_000, daysAgo: 70 }),
    video({ videoId: "medium", viewCount: 20_000, daysAgo: 60 }),
  ];

  it("returns only videos beating the threshold, strongest first", () => {
    const picked = selectOutliers(videos, { now: NOW });
    expect(picked.map((v) => v.videoId)).toEqual(["big", "medium"]);
  });

  it("respects the limit so we never send 500 videos to the model", () => {
    expect(selectOutliers(videos, { now: NOW, limit: 1 })).toHaveLength(1);
  });

  it("returns an empty list for a channel with no variance", () => {
    const flat = Array.from({ length: 8 }, (_, i) =>
      video({ videoId: `x${i}`, viewCount: 10_000, daysAgo: 30 + i }),
    );
    expect(selectOutliers(flat, { now: NOW })).toEqual([]);
  });
});
