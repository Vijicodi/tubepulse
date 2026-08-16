import type { Video } from "@/lib/schemas/youtube";

/**
 * Outlier scoring.
 *
 * The whole product rests on one question: which of this channel's videos beat
 * their own baseline? Raw view counts cannot answer it — a 500k video is a flop
 * on a channel that averages 2M and a breakout on one that averages 20k.
 *
 * We use the MEDIAN, not the mean, because one viral video drags a mean upward
 * far enough to hide every other outlier. That single choice is most of the
 * accuracy here.
 *
 * Pure functions, no I/O — cheap to test, and the tests are what let an agent
 * refactor this file without your review.
 */

export interface ScoredVideo extends Video {
  /** view_count / channel median. 1.0 is typical, 3.0 is a 3x breakout. */
  outlierScore: number;
  /** Views per day since publication. Catches recent videos still climbing. */
  velocity: number;
  /** Days since publication, floored at 1 so brand-new videos are comparable. */
  ageDays: number;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Videos published in the last `recentDays` are excluded from the baseline:
 * they have not had time to accumulate views, so including them would drag the
 * median down and make everything look like an outlier.
 */
export function baselineViews(videos: Video[], now = new Date(), recentDays = 14): number {
  const mature = videos.filter((video) => ageInDays(video, now) >= recentDays);
  const pool = mature.length >= 5 ? mature : videos;
  const baseline = median(pool.map((video) => video.viewCount));
  // Guard against a channel whose median is 0 — avoids dividing by zero below.
  return baseline > 0 ? baseline : 1;
}

export function ageInDays(video: Video, now = new Date()): number {
  const published = new Date(video.publishedAt).getTime();
  const days = (now.getTime() - published) / 86_400_000;
  return Math.max(days, 0);
}

export function scoreVideos(videos: Video[], now = new Date()): ScoredVideo[] {
  const baseline = baselineViews(videos, now);

  return videos.map((video) => {
    const ageDays = Math.max(ageInDays(video, now), 1);
    return {
      ...video,
      outlierScore: round(video.viewCount / baseline, 2),
      velocity: round(video.viewCount / ageDays, 1),
      ageDays: round(ageDays, 1),
    };
  });
}

/**
 * The videos worth feeding to the idea generator: strong performers, newest
 * first among equals. Sending all 500 videos to an LLM is expensive and worse —
 * the signal drowns.
 */
export function selectOutliers(
  videos: Video[],
  { limit = 12, minScore = 1.5, now = new Date() } = {},
): ScoredVideo[] {
  return scoreVideos(videos, now)
    .filter((video) => video.outlierScore >= minScore)
    .sort((a, b) => b.outlierScore - a.outlierScore)
    .slice(0, limit);
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
