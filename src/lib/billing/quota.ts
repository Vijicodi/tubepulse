import { PLANS, type Plan, type PlanKey } from "@/lib/billing/plans";
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
 * How many runs someone may still start, and why not when they may not.
 *
 * ONE POOL. Refill packs were removed when pricing moved to four tiers — the
 * ladder now carries what top-ups used to: someone who runs out upgrades rather
 * than buying a patch. `scrape_credits` still exists in the schema and is still
 * summed here, so any credit granted before the change is honoured, but nothing
 * sells new ones.
 *
 * The allowance is counted from the `jobs` table rather than stored, because a
 * job row already exists for every billable action and a second counter could
 * disagree with it.
 *
 * Nothing here writes.
 */

export interface Quota {
  /** Which plan this quota was computed against. */
  planKey: PlanKey;
  /** True for any paid tier. Kept for the many call sites that only ask that. */
  isPaid: boolean;
  /** Runs included in the plan for one period. */
  allowance: number;
  /** Used against the allowance this period. Never more than `allowance`. */
  allowanceUsed: number;
  /** Allowance left before legacy credits are touched. */
  allowanceLeft: number;
  /** Legacy credits bought before refills were retired. Usually zero. */
  refills: number;
  /** allowanceLeft + refills. */
  remaining: number;
  /** Runs started today, against `dailyCap`. */
  dailyUsed: number;
  dailyCap: number;
  /** Start of the current allowance period. */
  periodStart: string;
  /** When the allowance next resets. */
  resetsAt: string | null;
  canScrape: boolean;
  /** Why not, in a sentence for a human. Null when they can. */
  reason: string | null;
  /**
   * This request must be charged to the legacy credit ledger rather than the
   * allowance. The routes read this rather than re-deriving it, so the three
   * that spend money cannot disagree.
   */
  mustSpendRefill: boolean;
  /** Today's cap is reached, and work continues only on bought credits. */
  onRefillsToday: boolean;
}

/**
 * The day the current allowance period began.
 *
 * Anchored to the day of the month the subscription started, NOT the 1st.
 * Someone subscribing on the 28th would otherwise get a full allowance for
 * three days and a fresh one on the 1st — twice the runs for one payment, which
 * is exactly the margin the pricing was built around.
 *
 * Yearly subscribers are treated identically: the allowance is per MONTH, so it
 * resets monthly whichever cycle they pay on.
 *
 * FREE RESETS MONTHLY TOO, and that is a change. Scout's grant used to be five
 * once ever; it is now three a month, so it needs a period like any other plan.
 * With no subscription to anchor to, the calendar month is the anchor.
 */
export function periodStartFor(now: Date, subscriptionStart: Date | null): Date {
  // No subscription: anchor to the 1st, so the free grant resets monthly.
  if (!subscriptionStart) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

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
  planKey,
  scrapesThisPeriod,
  scrapesToday,
  refills,
  periodStart,
  resetsAt,
}: {
  planKey: PlanKey;
  scrapesThisPeriod: number;
  scrapesToday: number;
  refills: number;
  periodStart: Date;
  resetsAt: Date | null;
}): Quota {
  const plan = PLANS[planKey];
  const isPaid = planKey !== "free";

  const allowanceUsed = Math.min(scrapesThisPeriod, plan.runs);
  const allowanceLeft = plan.runs - allowanceUsed;
  const remaining = allowanceLeft + refills;

  const dailyCap = plan.dailyCap;
  const overDailyCap = scrapesToday >= dailyCap;

  /**
   * THE DAILY CAP GOVERNS THE PLAN ALLOWANCE, NOT RUNS ALREADY PAID FOR.
   *
   * The cap exists so one afternoon cannot drain a month's allowance and hand
   * you a surprise API bill. A legacy credit is a different thing entirely: it
   * was bought outright, well above what a run costs, so spending several in an
   * hour earns money rather than losing it.
   *
   * Telling someone who has already PAID for runs to come back tomorrow is the
   * worst sentence a billing system can say. So past the cap the work still
   * runs — charged to a credit instead of the allowance.
   *
   * The guard survives: the allowance itself is still capped per day, so it
   * still cannot be emptied in a couple of afternoons.
   */
  const cappedButPaid = overDailyCap && refills > 0;

  /**
   * This request must come out of the credit ledger rather than the allowance.
   *
   * True in two cases: the allowance is gone, or the cap has been reached and
   * the user is continuing on credits they bought. The routes read this instead
   * of re-deriving the rule, so all three spend money the same way.
   */
  const mustSpendRefill = allowanceLeft === 0 || cappedButPaid;

  // Order matters: someone with nothing left should be told how to get more,
  // not told to come back tomorrow, because tomorrow will not help them.
  //
  // One sentence each. These appear as a toast over the work someone was in the
  // middle of, so they say what happened and what fixes it — the reasoning
  // behind the limits belongs in the docs, not in the way.
  const reason =
    remaining <= 0
      ? outOfAllowanceReason(plan)
      : overDailyCap && !cappedButPaid
        ? `That is your ${dailyCap} for today. More tomorrow.`
        : null;

  return {
    planKey,
    isPaid,
    allowance: plan.runs,
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
    /** True when today's cap is reached and only bought credits remain usable. */
    onRefillsToday: cappedButPaid,
  };
}

/**
 * What to say when the allowance is spent.
 *
 * Names the NEXT tier up rather than a generic "upgrade", because the useful
 * sentence is the one that says what to do. The top tier has nothing above it,
 * so it is told when the period resets instead of being sold something that
 * does not exist.
 */
function outOfAllowanceReason(plan: Plan): string {
  const next = nextTierUp(plan.key);

  if (!next) {
    return `You have used all ${plan.runs} runs this period. They reset at the start of your next billing month.`;
  }

  return `You have used all ${plan.runs} runs this period. ${next.name} gives you ${next.runs} a month.`;
}

/** The tier above this one, or null at the top. Drives upgrade prompts. */
export function nextTierUp(key: PlanKey): Plan | null {
  const ladder: PlanKey[] = ["free", "creator", "studio", "agency"];
  const next = ladder[ladder.indexOf(key) + 1];
  return next ? PLANS[next] : null;
}

/** Videos read per run — the other thing a higher tier actually buys. */
export function videosPerRunFor(planKey: PlanKey): number {
  return PLANS[planKey].videosPerRun;
}

/**
 * Instagram posts read per run. Lower than the video figure because Instagram
 * data costs several times more per item — see the sums in plans.ts. Zero on
 * tiers where Instagram is not included at all.
 */
export function postsPerRunFor(planKey: PlanKey): number {
  return PLANS[planKey].postsPerRun;
}

/** How deep a run goes on this platform, for this plan. */
export function depthFor(platform: Platform, planKey: PlanKey): number {
  return platform === "instagram"
    ? postsPerRunFor(planKey)
    : videosPerRunFor(planKey);
}

/**
 * Whether this plan may research Instagram at all.
 *
 * Gated to Studio and above: an Instagram run costs 4-6x a YouTube one, and it
 * is the clearest reason to move up a tier. Checked at the research route, not
 * only hidden in the UI — a hidden button is not an access control.
 */
export function canUseInstagram(planKey: PlanKey): boolean {
  return PLANS[planKey].features.instagram;
}

/** Whether this plan may use voice input. Paid tiers only — Whisper costs. */
export function canUseVoice(planKey: PlanKey): boolean {
  return PLANS[planKey].features.voiceInput;
}

/** Whether this plan may extract transcripts. */
export function canUseTranscripts(planKey: PlanKey): boolean {
  return PLANS[planKey].features.transcripts;
}

/**
 * Whether this plan may schedule ideas onto the content calendar.
 *
 * Studio and up. Scheduling is a working-creator need rather than a power-user
 * one, so putting it above Studio would hollow out the tier the pricing page
 * honestly recommends to most people.
 */
export function canUseContentCalendar(planKey: PlanKey): boolean {
  return PLANS[planKey].features.contentCalendar;
}

/**
 * Whether this plan may use the cross-project hook library.
 *
 * Max alone. It reads outlier titles across EVERY project the account owns,
 * so it is the one feature that compounds with use — which is what the top
 * tier needs in order to be worth $40 over Studio now that seats are gone.
 */
export function canUseHookLibrary(planKey: PlanKey): boolean {
  return PLANS[planKey].features.hookLibrary;
}

/**
 * Whether another project may be created.
 *
 * `maxProjects` is null for unlimited. Passing the current count keeps this
 * pure — the caller does the counting, this decides.
 */
export function canCreateProject(planKey: PlanKey, currentCount: number): boolean {
  const max = PLANS[planKey].features.maxProjects;
  return max === null || currentCount < max;
}
