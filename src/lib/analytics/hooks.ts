import type { VideoRow } from "@/lib/supabase/types";

/**
 * The hook library: opening patterns mined from titles that actually beat
 * their own channel, across EVERY project the account owns.
 *
 * Pure module — no database, no network, no LLM — computed from rows a scrape
 * already paid for. Nothing here spends an allowance, which is why it is not
 * in BILLABLE_JOB_KINDS and why it never writes a `jobs` row.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS THE MAX-TIER FEATURE.
 *
 * Every other analysis in the product looks at one project. This one reads
 * across all of them, so it gets better the more you use the product — a hook
 * that works in three unrelated niches is a far stronger signal than one that
 * works in a single channel, and only an account with several projects can see
 * that at all. It is worth a top tier because it is worth MORE at volume,
 * rather than merely being withheld from cheaper ones.
 * ---------------------------------------------------------------------------
 * THE HONESTY PROBLEM, inherited from patterns.ts and slightly worse here.
 *
 * Title mining invites false confidence: pick enough regexes and something
 * always "wins". Two guards. First, MIN_SAMPLE — a shape seen fewer than four
 * times reports its count and is flagged unreliable, never dressed as a trend.
 * Second, every hook carries REAL EXAMPLES from real titles, so a claim can be
 * checked against the thing it was drawn from rather than taken on faith.
 *
 * A hook that cannot show its examples is not shown at all.
 * ---------------------------------------------------------------------------
 */

/** Below this many matching titles, a shape is a coincidence, not a pattern. */
export const MIN_SAMPLE = 4;

/**
 * How far above a channel's median a video must sit before its title is worth
 * copying. 1.2 rather than 1.0: a title that performed exactly typically has
 * nothing to teach, and including it would dilute every average on the page.
 */
export const OUTLIER_FLOOR = 1.2;

/** The most examples kept per hook. Enough to judge, few enough to read. */
const MAX_EXAMPLES = 3;

export interface HookExample {
  title: string;
  url: string;
  /** How far above its channel's median this one landed. */
  outlierScore: number;
}

export interface Hook {
  /** The shape, named for a human: "How-to", "Numbered list". */
  label: string;
  /** One line on when to reach for it. */
  guidance: string;
  /** How many outlier titles matched this shape. */
  sampleSize: number;
  /** Mean outlier score across the matches. 1.0 is a typical video. */
  meanScore: number;
  /** False when the sample is too small to claim anything. */
  isReliable: boolean;
  /** Real titles this was drawn from. Never empty for a rendered hook. */
  examples: HookExample[];
}

export interface HookLibrary {
  hooks: Hook[];
  /** Outlier titles considered in total. */
  titlesAnalysed: number;
  /** How many distinct projects contributed. The cross-project claim. */
  projectsCovered: number;
  /** The strongest RELIABLE hook, or null when nothing clears the bar. */
  best: Hook | null;
}

/**
 * The shapes we look for.
 *
 * Deliberately a small, fixed list of patterns that are well established in
 * how titles are written, rather than an open-ended miner. An open miner finds
 * "titles containing the letter e" and reports it proudly; a fixed list can
 * only find things that mean something to a person writing a title.
 *
 * Order matters: the FIRST match wins, so the more specific shapes are listed
 * before the general ones. "How I made $5,000" is a how-to, not merely a title
 * containing a number.
 */
const SHAPES: {
  label: string;
  guidance: string;
  test: (title: string) => boolean;
}[] = [
  {
    label: "How-to",
    guidance: "Promises a method. Strongest when the outcome is specific.",
    test: (t) => /^how\s+(to|i|we|they)\b/i.test(t),
  },
  {
    label: "Numbered list",
    guidance: "Sets an expectation of length. Odd numbers read as researched.",
    test: (t) => /^\d+\s+\w/.test(t),
  },
  {
    label: "Question",
    guidance: "Works when the viewer already wonders. Falls flat when invented.",
    // A question mark ANYWHERE, not just at the end. Real titles routinely
    // append a series name or a channel tag after the question — "Is this
    // worth it? | Ep 4" — and an endsWith test silently drops every one of
    // them, which is a whole bucket lost to punctuation.
    test: (t) => t.includes("?"),
  },
  {
    label: "Negative or warning",
    guidance: "Loss aversion. Effective, and easy to overuse into distrust.",
    // Both apostrophes: titles arrive with the typographic one as often as the
    // ASCII one, and matching only one silently halves this bucket.
    test: (t) =>
      /\b(never|stop|avoid|mistake|worst|wrong|fail)\b/i.test(t) ||
      /\bdon['’]?t\b/i.test(t),
  },
  {
    label: "Superlative",
    guidance: "Stakes a claim. Needs the video to actually deliver it.",
    test: (t) => /\b(best|ultimate|only|fastest|easiest|perfect|greatest)\b/i.test(t),
  },
  {
    label: "Curiosity gap",
    guidance: "Withholds the payoff. Cheap if the video does not close it fast.",
    test: (t) => /\b(secret|nobody|no one|truth|really|actually|why)\b/i.test(t),
  },
  {
    label: "Time-bound",
    guidance: "Bounds the effort. Concrete spans beat vague ones.",
    test: (t) =>
      /\b\d+\s*(second|minute|hour|day|week|month|year)s?\b/i.test(t) ||
      /\b(today|tonight)\b/i.test(t),
  },
  {
    label: "Personal result",
    guidance: "Borrows credibility from a real outcome. Needs a real number.",
    test: (t) =>
      /\b(i|we|my|our)\b/i.test(t) && /[$₹€£]?\s?\d/.test(t),
  },
  {
    label: "Versus or comparison",
    guidance: "Rides two existing interests at once.",
    test: (t) => /\bvs\.?\b/i.test(t) || /\bversus\b/i.test(t),
  },
  {
    label: "Beginner-framed",
    guidance: "Names the audience. Narrows reach and raises intent.",
    test: (t) => /\b(beginner|beginners|start|starting|first|101|guide)\b/i.test(t),
  },
];

function scoreOf(video: VideoRow): number {
  return Number(video.outlier_score ?? 0);
}

/**
 * Build the library from every video the account owns.
 *
 * `projectCount` is passed in rather than derived: the caller knows how many
 * projects it queried, and a video row carries a channel id rather than a
 * project id. Reporting it honestly matters because the whole pitch of this
 * feature is that it reads across projects.
 */
export function buildHookLibrary(
  videos: VideoRow[],
  projectCount: number,
): HookLibrary {
  // Only titles that actually beat their own channel. A hook drawn from a
  // typical video is a hook drawn from nothing.
  const outliers = videos.filter(
    (video) =>
      video.outlier_score !== null &&
      Number(video.outlier_score) >= OUTLIER_FLOOR &&
      video.title.trim() !== "",
  );

  const groups = new Map<string, VideoRow[]>();

  for (const video of outliers) {
    // First match wins — see the ordering note on SHAPES.
    const shape = SHAPES.find((candidate) => candidate.test(video.title));
    if (!shape) continue;

    const existing = groups.get(shape.label);
    if (existing) existing.push(video);
    else groups.set(shape.label, [video]);
  }

  const hooks: Hook[] = [];

  for (const shape of SHAPES) {
    const matches = groups.get(shape.label);
    if (!matches || matches.length === 0) continue;

    // Strongest examples first: if only three are shown, show the three that
    // best make the case.
    const ranked = [...matches].sort((a, b) => scoreOf(b) - scoreOf(a));

    hooks.push({
      label: shape.label,
      guidance: shape.guidance,
      sampleSize: matches.length,
      meanScore:
        matches.reduce((sum, video) => sum + scoreOf(video), 0) / matches.length,
      isReliable: matches.length >= MIN_SAMPLE,
      examples: ranked.slice(0, MAX_EXAMPLES).map((video) => ({
        title: video.title,
        url: video.url,
        outlierScore: scoreOf(video),
      })),
    });
  }

  hooks.sort((a, b) => b.meanScore - a.meanScore);

  const reliable = hooks.filter((hook) => hook.isReliable);
  const best =
    reliable.length > 0
      ? reliable.reduce((top, hook) => (hook.meanScore > top.meanScore ? hook : top))
      : null;

  return {
    hooks,
    titlesAnalysed: outliers.length,
    projectsCovered: projectCount,
    best,
  };
}
