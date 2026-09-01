import type { VideoRow } from "@/lib/supabase/types";

/**
 * Patterns across a channel's catalogue, computed from rows already stored.
 *
 * Pure module — no database, no network, no API calls — which is the point.
 * Every number here comes from data a scrape already paid for, so these read
 * as free: no allowance is spent looking at what you already fetched.
 *
 * ---------------------------------------------------------------------------
 * THE HONESTY PROBLEM, and it is the whole design of this file.
 *
 * Give a small sample to any grouping and it will hand back a "finding". Three
 * videos posted on a Tuesday, one of which went wide, produces "Tuesdays
 * outperform by 4.2x" — which is one video wearing a trend's clothes. A
 * creator who reschedules their week around that has been actively misled by
 * their own tool.
 *
 * So every function here returns buckets carrying their own `sampleSize`, and
 * `isReliable` is computed rather than assumed. The UI renders an unreliable
 * bucket differently — or not at all. NEVER strip that flag to make a page
 * look more confident: the confidence would be fictional.
 * ---------------------------------------------------------------------------
 */

/** Below this many videos in a bucket, the number is noise wearing a hat. */
export const MIN_SAMPLE = 4;

export interface Bucket {
  /** What this bucket is: "Tuesday", "8-12 min", "Has a number". */
  label: string;
  sampleSize: number;
  /** Mean outlier score across the bucket. 1.0 is a typical video. */
  meanScore: number;
  /** Whether the sample is large enough to say anything at all. */
  isReliable: boolean;
}

/** A finished analysis: the buckets, and whether ANY of it is worth showing. */
export interface Pattern {
  buckets: Bucket[];
  /** The strongest reliable bucket, or null when nothing clears the bar. */
  best: Bucket | null;
  /** How many videos went into this analysis at all. */
  totalVideos: number;
}

/** Videos with a usable score. Everything here ignores the rest. */
function scorable(videos: VideoRow[]): VideoRow[] {
  return videos.filter(
    (video) => video.outlier_score !== null && Number(video.outlier_score) > 0,
  );
}

function scoreOf(video: VideoRow): number {
  return Number(video.outlier_score ?? 0);
}

/**
 * Turn grouped videos into buckets, sorted strongest first.
 *
 * `best` is the strongest RELIABLE bucket, not the strongest bucket — that
 * distinction is the difference between advice and a coin flip.
 */
function buildPattern(
  groups: Map<string, VideoRow[]>,
  total: number,
  order?: string[],
): Pattern {
  const buckets: Bucket[] = [...groups.entries()].map(([label, videos]) => ({
    label,
    sampleSize: videos.length,
    meanScore:
      videos.reduce((sum, video) => sum + scoreOf(video), 0) / Math.max(videos.length, 1),
    isReliable: videos.length >= MIN_SAMPLE,
  }));

  // A fixed order for things that have one — days of the week read wrong
  // sorted by performance, because the reader is scanning for a day.
  const sorted = order
    ? buckets.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label))
    : buckets.sort((a, b) => b.meanScore - a.meanScore);

  const reliable = buckets.filter((bucket) => bucket.isReliable);
  const best =
    reliable.length > 0
      ? reliable.reduce((top, bucket) => (bucket.meanScore > top.meanScore ? bucket : top))
      : null;

  return { buckets: sorted, best, totalVideos: total };
}

// ---------------------------------------------------------------------------
// When to post
// ---------------------------------------------------------------------------

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Which day of the week this channel's best videos went out on.
 *
 * UTC throughout, and that is a real limitation rather than an oversight:
 * `published_at` is stored in UTC and the audience's timezone is unknown, so
 * "Tuesday" means Tuesday UTC. For a channel posting near midnight in its own
 * timezone that can be the wrong day. Said plainly in the UI rather than
 * papered over.
 */
export function byDayOfWeek(videos: VideoRow[]): Pattern {
  const usable = scorable(videos);
  const groups = new Map<string, VideoRow[]>();

  for (const video of usable) {
    const day = DAYS[new Date(video.published_at).getUTCDay()];
    const existing = groups.get(day);
    if (existing) existing.push(video);
    else groups.set(day, [video]);
  }

  return buildPattern(groups, usable.length, DAYS);
}

// ---------------------------------------------------------------------------
// How long
// ---------------------------------------------------------------------------

/**
 * Length buckets, chosen to match how YouTube itself behaves rather than to be
 * evenly spaced: under a minute is Shorts, and the 8-minute line is where
 * mid-roll ads become available, which changes what creators make.
 */
const LENGTH_BUCKETS: { label: string; max: number }[] = [
  { label: "Under 1 min", max: 60 },
  { label: "1-4 min", max: 240 },
  { label: "4-8 min", max: 480 },
  { label: "8-15 min", max: 900 },
  { label: "15-30 min", max: 1800 },
  { label: "Over 30 min", max: Infinity },
];

export function byLength(videos: VideoRow[]): Pattern {
  // A video with no duration cannot be bucketed, and guessing one would put a
  // real score in a made-up bucket.
  const usable = scorable(videos).filter((video) => video.duration_seconds !== null);
  const groups = new Map<string, VideoRow[]>();

  for (const video of usable) {
    const seconds = video.duration_seconds ?? 0;
    const bucket = LENGTH_BUCKETS.find((candidate) => seconds <= candidate.max);
    if (!bucket) continue;

    const existing = groups.get(bucket.label);
    if (existing) existing.push(video);
    else groups.set(bucket.label, [video]);
  }

  return buildPattern(
    groups,
    usable.length,
    LENGTH_BUCKETS.map((bucket) => bucket.label),
  );
}

// ---------------------------------------------------------------------------
// What the title does
// ---------------------------------------------------------------------------

/**
 * Title shapes, tested independently.
 *
 * A title can be in several of these at once — "5 Things I Got WRONG (2026)"
 * is a number, a bracket and a capitalised word — so these are NOT buckets of
 * a partition and their sample sizes deliberately overlap. Each answers "do
 * titles doing X beat titles not doing X on this channel", which is the
 * question a creator actually has.
 */
const TITLE_TRAITS: { label: string; test: (title: string) => boolean }[] = [
  { label: "Starts with a number", test: (title) => /^\d/.test(title.trim()) },
  { label: "Contains a number", test: (title) => /\d/.test(title) },
  { label: "Asks a question", test: (title) => title.includes("?") },
  { label: "Has brackets", test: (title) => /[([]/.test(title) },
  { label: "SHOUTS a word", test: (title) => /\b[A-Z]{3,}\b/.test(title) },
  { label: "Says 'you' or 'your'", test: (title) => /\byou(r)?\b/i.test(title) },
  { label: "Under 40 characters", test: (title) => title.length < 40 },
];

export interface TraitComparison {
  label: string;
  /** Videos whose titles do this. */
  withTrait: Bucket;
  /** Videos whose titles do not. The comparison, not a footnote. */
  withoutTrait: Bucket;
  /** withTrait.meanScore / withoutTrait.meanScore. Above 1 means it helps. */
  lift: number;
  /** True only when BOTH sides clear the sample floor. */
  isReliable: boolean;
}

export function byTitleTrait(videos: VideoRow[]): TraitComparison[] {
  const usable = scorable(videos);

  return TITLE_TRAITS.map(({ label, test }) => {
    const withTrait = usable.filter((video) => test(video.title));
    const withoutTrait = usable.filter((video) => !test(video.title));

    const meanOf = (group: VideoRow[]) =>
      group.length === 0
        ? 0
        : group.reduce((sum, video) => sum + scoreOf(video), 0) / group.length;

    const withMean = meanOf(withTrait);
    const withoutMean = meanOf(withoutTrait);

    return {
      label,
      withTrait: {
        label: "With",
        sampleSize: withTrait.length,
        meanScore: withMean,
        isReliable: withTrait.length >= MIN_SAMPLE,
      },
      withoutTrait: {
        label: "Without",
        sampleSize: withoutTrait.length,
        meanScore: withoutMean,
        isReliable: withoutTrait.length >= MIN_SAMPLE,
      },
      // A lift needs something to lift against. With no comparison group the
      // honest answer is 1 — no claim — rather than a division by zero.
      lift: withoutMean === 0 ? 1 : withMean / withoutMean,
      isReliable: withTrait.length >= MIN_SAMPLE && withoutTrait.length >= MIN_SAMPLE,
    };
  })
    // Only traits that actually appear on this channel. "Asks a question: 0
    // videos" is a row about nothing.
    .filter((comparison) => comparison.withTrait.sampleSize > 0)
    .sort((a, b) => Math.abs(b.lift - 1) - Math.abs(a.lift - 1));
}

// ---------------------------------------------------------------------------
// Engagement
// ---------------------------------------------------------------------------

export interface EngagementRow {
  video: VideoRow;
  /** Likes per thousand views. Null when either number is missing. */
  likeRate: number | null;
  /** Comments per thousand views. Null when either number is missing. */
  commentRate: number | null;
}

/**
 * Likes and comments per thousand views.
 *
 * The thing raw view counts hide: a video with modest reach and an unusually
 * high like rate found its audience, while a big number with a flat like rate
 * was probably carried by a thumbnail. Your competitor cannot show this — they
 * do not store like or comment counts.
 *
 * NULL, NOT ZERO, when a count is missing. A static Instagram post has no view
 * count at all, and dividing by it would invent an engagement rate for
 * something that cannot be watched.
 */
export function engagementRates(videos: VideoRow[]): EngagementRow[] {
  return videos
    .map((video) => {
      const views = video.view_count;
      const usable = views !== null && views > 0;

      return {
        video,
        likeRate:
          usable && video.like_count !== null ? (video.like_count / views) * 1000 : null,
        commentRate:
          usable && video.comment_count !== null
            ? (video.comment_count / views) * 1000
            : null,
      };
    })
    .filter((row) => row.likeRate !== null || row.commentRate !== null)
    .sort((a, b) => (b.likeRate ?? 0) - (a.likeRate ?? 0));
}

/** "3.1x" / "0.8x" — a lift reads as a multiple, not a percentage. */
export function formatLift(lift: number): string {
  return `${lift.toFixed(1)}x`;
}
