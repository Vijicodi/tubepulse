import { PLANS } from "@/lib/billing/plans";
import type { JobKind, Platform } from "@/lib/supabase/types";

/**
 * The job kinds that cost money and therefore spend from the allowance.
 *
 * A scrape pays Apify; an idea generation pays OpenAI and Firecrawl; a
 * transcript pays Apify for the captions and OpenAI for the summary. All three
 * are charged per press, so all three are counted. Lives here — a pure module — rather
 * than in `store.ts`, which is `server-only` and cannot be imported by a test.
 *
 * A new job kind is free until it appears in this list. That is the trap: it
 * fails silently and in the user's favour, so nothing complains.
 */
export const BILLABLE_JOB_KINDS = [
  "channel_scrape",
  "idea_generation",
  "transcript",
] as const satisfies readonly JobKind[];

/**
 * How many scrapes someone may still run, and why not when they may not.
 *
 * TWO SEPARATE POOLS, deliberately:
 *
 *   1. The PLAN ALLOWANCE — 20 a month on Pro, 5 once ever on Scout. It resets,
 *      and it is counted from the `jobs` table rather than stored, because a
 *      job row already exists for every scrape and a second counter could
 *      disagree with it.
 *   2. REFILLS — bought outright, never expiring, held in `scrape_credits`.
 *      Spent only once the allowance is gone, so a pack is never burned while
 *      free scrapes remain.
 *
 * Nothing here writes. `spendRefill()` in store.ts does that, and only when the
 * allowance is exhausted, so the ledger stays a record of refills alone.
 */

export interface Quota {
  isPro: boolean;
  /** Scrapes included in the plan for one period. */
  allowance: number;
  /** Used against the allowance this period. Never more than `allowance`. */
  allowanceUsed: number;
  /** Allowance left before refills are touched. */
  allowanceLeft: number;
  /** Packs bought and not yet spent. */
  refills: number;
  /** allowanceLeft + refills. */
  remaining: number;
  /** Scrapes started today, against `dailyCap`. */
  dailyUsed: number;
  dailyCap: number;
  /** Start of the current allowance period. */
  periodStart: string;
  /** When the allowance next resets. Null on Scout, whose 5 never reset. */
  resetsAt: string | null;
  canScrape: boolean;
  /** Why not, in a sentence for a human. Null when they can. */
  reason: string | null;
  /**
   * This request must be charged to the refill ledger rather than the
   * allowance. The routes read this rather than re-deriving it, so the three
   * that spend money cannot disagree.
   */
  mustSpendRefill: boolean;
  /** Today's cap is reached, and work continues only on bought scrapes. */
  onRefillsToday: boolean;
}

/**
 * The day the current allowance period began.
 *
 * Anchored to the day of the month the subscription started, NOT the 1st.
 * Someone subscribing on the 28th would otherwise get a full 20 for three days
 * and 20 more on the 1st — twice the scrapes for one payment, which is exactly
 * the margin the pricing was built around.
 *
 * Yearly subscribers are treated identically: the allowance is 20 a MONTH, so
 * it resets monthly whichever cycle they pay on.
 */
export function periodStartFor(now: Date, subscriptionStart: Date | null): Date {
  // Scout's five are one-time-ever, so the period never begins again.
  if (!subscriptionStart) return new Date(0);

  const anchorDay = subscriptionStart.getUTCDate();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), clampDay(now, anchorDay)),
  );

  // Before this month's anniversary, the period began last month.
  if (start.getTime() > now.getTime()) {
    const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return new Date(
      Date.UTC(
        previous.getUTCFullYear(),
        previous.getUTCMonth(),
        clampDay(previous, anchorDay),
      ),
    );
  }

  return start;
}

/** The 31st does not exist in September. Fall back to that month's last day. */
function clampDay(monthOf: Date, day: number): number {
  const lastDay = new Date(
    Date.UTC(monthOf.getUTCFullYear(), monthOf.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return Math.min(day, lastDay);
}

/** One month on from a period start — when the allowance comes back. */
export function periodEndFor(periodStart: Date, anchorDay: number): Date {
  const next = new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1),
  );
  return new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), clampDay(next, anchorDay)),
  );
}

/**
 * Turn raw counts into a decision. Pure, so the rules are testable without a
 * database — the arithmetic here decides whether someone is charged money.
 */
export function computeQuota({
  isPro,
  scrapesThisPeriod,
  scrapesToday,
  refills,
  periodStart,
  resetsAt,
}: {
  isPro: boolean;
  scrapesThisPeriod: number;
  scrapesToday: number;
  refills: number;
  periodStart: Date;
  resetsAt: Date | null;
}): Quota {
  const plan = isPro ? PLANS.pro : PLANS.free;

  const allowanceUsed = Math.min(scrapesThisPeriod, plan.scrapes);
  const allowanceLeft = plan.scrapes - allowanceUsed;
  const remaining = allowanceLeft + refills;

  const dailyCap = plan.dailyCap;
  const overDailyCap = scrapesToday >= dailyCap;

  /**
   * THE DAILY CAP GOVERNS THE PLAN ALLOWANCE, NOT SCRAPES ALREADY PAID FOR.
   *
   * The cap exists so one afternoon cannot drain a month of the ₹499 allowance
   * and hand you a surprise API bill. A refill is a different thing entirely:
   * it was bought outright at about ₹30 a scrape, well above what a scrape
   * costs to run, so using ten of them in an hour earns money rather than
   * losing it.
   *
   * Telling someone who has just PAID for five scrapes to come back tomorrow
   * is the worst sentence a billing system can say. So past the cap the work
   * still runs — charged to a refill instead of the allowance.
   *
   * The guard survives: the allowance itself is still capped at 5 a day, so it
   * still cannot be emptied in under four days.
   */
  const cappedButPaid = overDailyCap && refills > 0;

  /**
   * This request must come out of the refill ledger rather than the allowance.
   *
   * True in two cases: the allowance is gone, or the cap has been reached and
   * the user is continuing on scrapes they bought. The routes read this instead
   * of re-deriving the rule, so all three spend money the same way.
   */
  const mustSpendRefill = allowanceLeft === 0 || cappedButPaid;

  // Order matters: someone with nothing left should be told to buy, not told
  // to come back tomorrow, because tomorrow will not help them.
  //
  // One sentence each. These appear as a toast over the work someone was in the
  // middle of, so they say what happened and what fixes it — the reasoning
  // behind the limits belongs in the docs, not in the way.
  const reason =
    remaining <= 0
      ? isPro
        ? `You have used all ${plan.scrapes} scrapes this period. Buy a refill to keep going.`
        : `Scout gives you ${plan.scrapes} scrapes. Upgrade to Pro for ${PLANS.pro.scrapes} a month, or buy a refill.`
      : overDailyCap && !cappedButPaid
        ? `That is your ${dailyCap} for today. More tomorrow.`
        : null;

  return {
    isPro,
    allowance: plan.scrapes,
    allowanceUsed,
    allowanceLeft,
    refills,
    remaining,
    dailyUsed: scrapesToday,
    dailyCap,
    periodStart: periodStart.toISOString(),
    resetsAt: resetsAt ? resetsAt.toISOString() : null,
    canScrape: reason === null,
    reason,
    mustSpendRefill,
    /** True when today's cap is reached and only bought scrapes remain usable. */
    onRefillsToday: cappedButPaid,
  };
}

/** Videos read per scrape, which is the other thing Pro actually buys. */
export function videosPerScrapeFor(isPro: boolean): number {
  return isPro ? PLANS.pro.videosPerScrape : PLANS.free.videosPerScrape;
}

/**
 * Instagram posts read per scrape. Lower than the video figure because
 * Instagram data costs several times more per item — see the sums in plans.ts.
 */
export function postsPerScrapeFor(isPro: boolean): number {
  return isPro ? PLANS.pro.postsPerScrape : PLANS.free.postsPerScrape;
}

/** How deep a scrape goes on this platform, for this plan. */
export function depthFor(platform: Platform, isPro: boolean): number {
  return platform === "instagram" ? postsPerScrapeFor(isPro) : videosPerScrapeFor(isPro);
}
