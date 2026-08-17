import type { Video } from "@/lib/schemas/youtube";
import type { VideoKind } from "@/lib/supabase/types";

/**
 * Outlier scoring.
 *
 * The whole product rests on one question: which of this account's posts beat
 * their own baseline? Raw counts cannot answer it — a 500k video is a flop on a
 * channel that averages 2M and a breakout on one that averages 20k.
 *
 * We use the MEDIAN, not the mean, because one viral post drags a mean upward
 * far enough to hide every other outlier. That single choice is most of the
 * accuracy here.
 *
 * TWO RULES MAKE A SCORE COMPARABLE, and both matter as much as the median:
 *
 *   1. ONE POOL PER KIND. A reel is measured in plays and routinely passes ten
 *      times the follower count; a static post is measured in likes and reaches
 *      a fraction of it. Pooled together, one reel at 11 million plays makes
 *      every post on the account read as a failure. This is the same reason
 *      YouTube Shorts are excluded from a channel scrape.
 *   2. ONE METRIC PER KIND. Watchable things are scored on views, static posts
 *      on likes — because a static post HAS no view count, and inventing a zero
 *      would be a claim that nobody saw it.
 *
 * Pure functions, no I/O — cheap to test, and the tests are what let an agent
 * refactor this file without your review.
 */

/** What scoring needs. Wider than `Video` so an Instagram post fits too. */
export interface Scorable {
  kind?: VideoKind;
  viewCount: number | null;
  likeCount?: number | null;
  publishedAt: string;
}

/**
 * What can be scored.
 *
 * Wider than `Video` in exactly one place: `viewCount` may be null, because a
 * static Instagram post has no view count. Widening the type rather than
 * casting is what stops that null reaching `toLocaleString()` somewhere.
 */
export type ScoreInput = Omit<Video, "viewCount"> & {
  viewCount: number | null;
  kind?: VideoKind;
};

export interface ScoredVideo extends ScoreInput {
  /** This post's metric ÷ the median for its OWN kind. 1.0 is typical. */
  outlierScore: number;
  /** Metric per day since publication. Catches recent posts still climbing. */
  velocity: number;
  /** Days since publication, floored at 1 so brand-new posts are comparable. */
  ageDays: number;
}

/**
 * The number this kind is judged on.
 *
 * Returns null when there is nothing honest to use — a post with no likes
 * recorded is unscoreable, and guessing zero would rank it as a failure rather
 * than as unknown.
 */
export function metricOf(item: Scorable): number | null {
  if (item.kind === "post") return item.likeCount ?? null;
  return item.viewCount ?? null;
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
 * Posts published in the last `recentDays` are excluded from the baseline:
 * they have not had time to accumulate, so including them would drag the median
 * down and make everything look like an outlier.
 */
export function baselineViews(
  videos: Scorable[],
  now = new Date(),
  recentDays = 14,
): number {
  const mature = videos.filter((video) => ageInDays(video, now) >= recentDays);
  const pool = mature.length >= 5 ? mature : videos;

  const values = pool
    .map((video) => metricOf(video))
    .filter((value): value is number => value !== null);

  const baseline = median(values);
  // Guard against an account whose median is 0 — avoids dividing by zero below.
  return baseline > 0 ? baseline : 1;
}

export function ageInDays(video: Pick<Scorable, "publishedAt">, now = new Date()): number {
  const published = new Date(video.publishedAt).getTime();
  const days = (now.getTime() - published) / 86_400_000;
  return Math.max(days, 0);
}

/** Everything of one kind, keyed by kind. 'video' covers anything unlabelled. */
function groupByKind<T extends Scorable>(videos: T[]): Map<VideoKind, T[]> {
  const groups = new Map<VideoKind, T[]>();

  for (const video of videos) {
    const kind = video.kind ?? "video";
    const existing = groups.get(kind);
    if (existing) existing.push(video);
    else groups.set(kind, [video]);
  }

  return groups;
}

export function scoreVideos(videos: ScoreInput[], now = new Date()): ScoredVideo[] {
  // A baseline PER KIND, so a reel is never measured against a photo.
  const baselines = new Map<VideoKind, number>();
  for (const [kind, group] of groupByKind(videos)) {
    baselines.set(kind, baselineViews(group, now));
  }

  return videos.map((video) => {
    const kind = video.kind ?? "video";
    const baseline = baselines.get(kind) ?? 1;
    const ageDays = Math.max(ageInDays(video, now), 1);
    const metric = metricOf(video);

    return {
      ...video,
      // Unscoreable stays 0 rather than pretending — it sorts to the bottom and
      // the table shows a dash instead of a number.
      outlierScore: metric === null ? 0 : round(metric / baseline, 2),
      velocity: metric === null ? 0 : round(metric / ageDays, 1),
      ageDays: round(ageDays, 1),
    };
  });
}

/**
 * The posts worth feeding to the idea generator: strong performers, newest
 * first among equals. Sending all 500 to an LLM is expensive and worse — the
 * signal drowns.
 */
export function selectOutliers(
  videos: ScoreInput[],
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
