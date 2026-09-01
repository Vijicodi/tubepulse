/**
 * What a run actually cost, in cents, and what it was spent on.
 *
 * Pure module — no imports, no environment — because these numbers are shown to
 * a paying customer as "this run cost you $0.14", and a figure a customer can
 * read is a figure that has to be tested rather than eyeballed.
 *
 * ---------------------------------------------------------------------------
 * IT IS AN ESTIMATE, AND THE UI MUST SAY SO.
 *
 * Nothing here queries a provider's billing API. Apify and Firecrawl bill per
 * item at rates that move, and OpenAI bills per token at rates that move faster.
 * So this multiplies observed usage by a rate table maintained BY HAND, right
 * here, and the pricing page's "per-run cost breakdown" is honest only while
 * `RATES` is honest.
 *
 * That is a deliberate trade rather than laziness: the alternative is three
 * billing-API integrations, each with its own auth, latency and outage, sitting
 * in the path of a page someone loads to look at a number. An estimate labelled
 * as an estimate beats a live figure that fails to load.
 *
 * WHEN A PROVIDER CHANGES ITS PRICING, THIS FILE CHANGES. There is no other
 * copy of these rates — plans.ts carries the same economics in prose, and
 * `tests/cost.test.ts` fails if the two disagree about the worst case.
 * ---------------------------------------------------------------------------
 */

/** What one billable unit costs, in US cents. */
export interface Rates {
  /** Apify, per video pulled from YouTube. */
  apifyPerVideo: number;
  /** Apify, per Instagram post. Four to six times the YouTube rate. */
  apifyPerPost: number;
  /** Firecrawl, per page fetched for context. */
  firecrawlPerPage: number;
  /** OpenAI, per 1,000 INPUT tokens, on each model tier. */
  llmInputPer1k: { mini: number; premium: number };
  /** OpenAI, per 1,000 OUTPUT tokens. Output costs several times input. */
  llmOutputPer1k: { mini: number; premium: number };
  /** OpenAI Whisper, per minute of audio transcribed. */
  whisperPerMinute: number;
}

/**
 * The rate table. Cents, not dollars — money in the smallest unit only.
 *
 * Derived from the same measurements as the margin sums in plans.ts, converted
 * at ₹88 to the dollar:
 *
 *   Apify YouTube    ₹4.50 per 100 videos   = $0.0512 / 100 = 0.0512c a video
 *   Apify Instagram  $0.0027 an item        = 0.27c a post
 *   Firecrawl        ₹1.50 per ~3 pages     = 0.57c a page
 *   Whisper          $0.006 a minute        = 0.6c a minute
 */
export const RATES: Rates = {
  apifyPerVideo: 0.0512,
  apifyPerPost: 0.27,
  firecrawlPerPage: 0.57,
  llmInputPer1k: { mini: 0.015, premium: 0.25 },
  llmOutputPer1k: { mini: 0.06, premium: 1.0 },
  whisperPerMinute: 0.6,
};

/** One line of the breakdown: what was used, and what it cost. */
export interface CostLine {
  /** Which provider. Shown as the row label. */
  provider: "apify" | "firecrawl" | "openai";
  /** What was bought, in the customer's words. "142 videos", not "142 units". */
  detail: string;
  /** Cents. Fractional on purpose — a run can genuinely cost a third of a cent. */
  cents: number;
}

export interface RunCost {
  lines: CostLine[];
  /** The sum. Always equals the lines, because it is computed from them. */
  totalCents: number;
}

/** Everything measurable about one run. Every field optional — kinds differ. */
export interface Usage {
  videosScraped?: number;
  postsScraped?: number;
  pagesEnriched?: number;
  llmTier?: "mini" | "premium";
  llmInputTokens?: number;
  llmOutputTokens?: number;
  audioMinutes?: number;
}

/**
 * Turn measured usage into a breakdown.
 *
 * A zero-cost component produces NO LINE rather than a line reading $0.00.
 * "Firecrawl $0.00" invites the question of why it is there at all; a run that
 * never touched Firecrawl should not mention it.
 */
export function costOf(usage: Usage, rates: Rates = RATES): RunCost {
  const lines: CostLine[] = [];

  if (usage.videosScraped && usage.videosScraped > 0) {
    lines.push({
      provider: "apify",
      detail: `${usage.videosScraped.toLocaleString("en-US")} videos read`,
      cents: usage.videosScraped * rates.apifyPerVideo,
    });
  }

  if (usage.postsScraped && usage.postsScraped > 0) {
    lines.push({
      provider: "apify",
      detail: `${usage.postsScraped.toLocaleString("en-US")} posts read`,
      cents: usage.postsScraped * rates.apifyPerPost,
    });
  }

  if (usage.pagesEnriched && usage.pagesEnriched > 0) {
    lines.push({
      provider: "firecrawl",
      detail: `${usage.pagesEnriched} pages of web context`,
      cents: usage.pagesEnriched * rates.firecrawlPerPage,
    });
  }

  const tier = usage.llmTier ?? "premium";
  const inputTokens = usage.llmInputTokens ?? 0;
  const outputTokens = usage.llmOutputTokens ?? 0;

  if (inputTokens > 0 || outputTokens > 0) {
    const cents =
      (inputTokens / 1000) * rates.llmInputPer1k[tier] +
      (outputTokens / 1000) * rates.llmOutputPer1k[tier];

    lines.push({
      provider: "openai",
      // Both halves, because the split is the interesting part: output costs
      // several times input, so a long answer is where the money went.
      detail: `${formatTokens(inputTokens)} in, ${formatTokens(outputTokens)} out`,
      cents,
    });
  }

  if (usage.audioMinutes && usage.audioMinutes > 0) {
    lines.push({
      provider: "openai",
      detail: `${usage.audioMinutes.toFixed(1)} minutes of audio`,
      cents: usage.audioMinutes * rates.whisperPerMinute,
    });
  }

  return {
    lines,
    totalCents: lines.reduce((sum, line) => sum + line.cents, 0),
  };
}

/** "12.4k" — token counts are read for scale, not for their exact value. */
function formatTokens(tokens: number): string {
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
}

/**
 * Cents as money, for a figure that is usually a fraction of one cent.
 *
 * "$0.00" is the wrong answer for a real cost — it reads as free, and a
 * customer who is told a run was free will ask why their allowance moved. So
 * anything under a cent is shown to two more places, and a genuine zero is the
 * only thing that says "$0.00".
 */
export function formatCost(cents: number): string {
  if (cents === 0) return "$0.00";
  if (cents < 1) return `$${(cents / 100).toFixed(4)}`;
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * The worst case one run can cost, used by the margin sums.
 *
 * Kept here so `plans.ts` prose and this rate table can be checked against each
 * other by a test rather than by someone remembering to.
 */
export function worstCaseRunCents(tier: "mini" | "premium", rates: Rates = RATES): number {
  // The most expensive shape a single run takes: a deep Instagram pull, web
  // enrichment, and a full-length generation.
  return costOf(
    {
      postsScraped: 60,
      pagesEnriched: 3,
      llmTier: tier,
      llmInputTokens: 6000,
      llmOutputTokens: 9000,
    },
    rates,
  ).totalCents;
}
