/**
 * The plan catalogue — the ONE place any pricing number is written down.
 *
 * The pricing page, the billing page, the Razorpay plan-creation script and the
 * quota checks all read from here. Previously these numbers lived only in the
 * marketing copy, which is how a page ends up promising 30 scrapes while the
 * plan charges for 15.
 *
 * Pure module, no imports, no environment. Safe from a client component.
 *
 * ---------------------------------------------------------------------------
 * CURRENCY IS INR, INDIA ONLY. Changed 2026-09-11.
 *
 * The product previously priced in USD globally. That is still the intended
 * destination — but USD subscriptions need a payment path this business does
 * not yet have:
 *
 *   * Razorpay Subscriptions refuses USD until International Payments is
 *     approved. Verified against the live account: a USD plan returns
 *     "Currency provided is not supported" while an INR plan is created fine.
 *   * PayPal's own Subscriptions API needs Reference Transactions enabled on
 *     the merchant account, which PayPal does not grant by default.
 *
 * Both are pending. Rather than wait, the product sells to India in INR now.
 * WHEN EITHER APPROVAL LANDS, THIS FILE GOES BACK TO USD — see the USD ladder
 * preserved at the bottom of this comment, and keep the two in step.
 *
 * ALLOWANCES SHRANK WITH THE PRICE, AND THAT IS THE WHOLE POINT.
 * The previous version of this comment warned that INR pricing at USD
 * allowances is negative margin, and it was right: Studio at Rs 1299 for the
 * old 60 runs is MINUS 28% on a promoted annual. Rupee prices therefore buy
 * rupee-sized allowances. This is the "two products wearing the same tier
 * names" problem the old note predicted — accepted deliberately, because the
 * alternative is charging Indian customers $49.
 * ---------------------------------------------------------------------------
 * THE ECONOMICS. Do not "improve" these numbers without redoing this sum.
 * `tests/billing-status.test.ts` fails if any of it stops holding.
 *
 * WHAT ONE UNIT OF THE ALLOWANCE BUYS. `runs` counts every billable action: a
 * channel scrape, a generation of ideas from a channel already scraped, or a
 * transcript extraction. All cost real money per press, so all spend a unit —
 * see BILLABLE_JOB_KINDS in quota.ts.
 *
 * COST PER RUN depends on the model tier, which is a PLAN FEATURE:
 *
 *   Mini-tier model (Scout, Creator)
 *     Apify        Rs 4.50
 *     Firecrawl    Rs 1.50
 *     LLM          Rs 0.40
 *     ----------------------------------------------------------------
 *     Total        Rs 6.40
 *
 *   Premium model (Studio, Max)
 *     Apify        Rs 4.50
 *     Firecrawl    Rs 1.50
 *     LLM          Rs 6.00
 *     ----------------------------------------------------------------
 *     Total        Rs 12.00
 *
 * An INSTAGRAM run costs about Rs 9.50 in Apify alone — 4-6x YouTube's rate,
 * measured at $0.0027 an item. That is why `postsPerRun` is smaller than
 * `videosPerRun`, and why Instagram is gated to Studio and above: the depth
 * moves and the tier moves, the price does not.
 *
 * Whisper voice transcription adds ~Rs 0.26 per voice-initiated request.
 * Assumed at 50% of runs in the sums below, which is generous.
 *
 * RAZORPAY DOMESTIC takes 2% plus 18% GST on the fee — 2.36% of the charge.
 * That is the number these sums use, and it is LOWER than the 3.54% the
 * international path cost. Selling only in India is cheaper to collect.
 *
 * THE WORST CASE IS NOT THE MONTHLY PRICE. It is the yearly price with the
 * launch promo applied, spread across twelve months — the least revenue a
 * month of usage will ever earn. Every allowance is sized against THAT:
 *
 *   Creator  Rs 499/mo   -> Rs 4,990/yr,  20% off -> 76% margin
 *   Studio   Rs 1,299/mo -> Rs 12,990/yr, 20% off -> 54% margin
 *   Max      Rs 3,499/mo -> Rs 34,990/yr, 20% off -> 52% margin
 *
 * At the monthly sticker price with no promo those become 84% / 69% / 68%.
 *
 * WHY CREATOR GIVES ONLY 12 RUNS, which looks mean next to the old 20.
 * The pricing page badges Studio "best value", and a test enforces that the
 * badge is TRUE: Studio must cost less per run than Creator. Studio runs the
 * PREMIUM model at Rs 12/run against Creator's Rs 6.40, and at 50% margin a
 * premium tier cannot be cheaper than about Rs 37 a run. Creator at 15 runs
 * priced itself at Rs 33 a run — BELOW that floor — which made the badge
 * arithmetically impossible and left Studio dearer per run than the tier
 * beneath it. Twelve runs puts Creator at Rs 41.6 and restores the ladder:
 * 41.6 -> 40.6 -> 38.9, falling at every step. It still covers the solo
 * creator band (10-16 runs), which is the segment it is for.
 *
 * THE LAUNCH PROMO IS A FLAT 20%, not the old tiered 30/40/50. At rupee prices
 * the tiered version took Max to roughly 30% worst case, which is too thin for
 * a tier whose per-run costs are real. One rate is also one sentence to
 * explain. The code is LAUNCH20.
 *
 * ALLOWANCES ARE SIZED TO REAL HUMAN USAGE, NOT TO THE MARGIN CEILING.
 * This is the important design rule and it is easy to get wrong. An allowance
 * far above what a segment can physically consume is not generosity — it is a
 * broken ladder, because nobody ever has a reason to upgrade. Measured usage:
 *
 *   Solo creator, 1 channel, posts 1-2x/week      10-16 runs a month
 *   Serious creator, 1-3 channels, posts 3x/week  28-44 runs a month
 *   Power user, many channels at once             85-140 runs a month
 *
 * Creator's 12 fits a solo creator and runs out the moment they take on a
 * second channel. Studio's 32 covers a serious creator and runs out well before
 * power-user volume. Max's 90 reaches into the power-user band. Each tier ends
 * inside the next segment's floor, which is what makes the ladder real rather
 * than decorative.
 *
 * RAISING AN ALLOWANCE WITHOUT RAISING ITS PRICE BREAKS THE LADDER, not just
 * the margin — and on this ladder it also breaks the "best value" badge, which
 * is checked by a test rather than trusted.
 *
 * FREE costs real money too: every free run is spend on somebody who may never
 * pay. Three runs a month on the mini model is about Rs 20 per signup per
 * month — cheap enough to leave recurring rather than one-time, which keeps
 * people in the product long enough to convert.
 *
 * THE DAILY CAP IS DELIBERATELY BELOW runs/3, so a month cannot be drained in
 * under three days. It is a spend guard, not a burst limit.
 * ---------------------------------------------------------------------------
 * THE USD LADDER, PRESERVED FOR THE SWITCH BACK.
 *
 * When International Payments or Reference Transactions is approved, restore:
 *
 *   Creator  $19  20 runs  100 videos/run   5/day
 *   Studio   $49  60 runs  150 videos/run  40 posts  15/day
 *   Max      $89  150 runs 200 videos/run  60 posts  35/day
 *
 * Those allowances are affordable at USD prices and were sized by the same
 * method. Switching back means this file, `formatMoney`, the currency sent by
 * `scripts/create-razorpay-plan.mjs`, and six new Razorpay plan objects.
 * ---------------------------------------------------------------------------
 */

export type PlanKey = "free" | "creator" | "studio" | "agency";

/** How often a paid plan is charged. Two Razorpay plans per tier, one product. */
export type BillingCycle = "monthly" | "yearly";

/**
 * Which model tier a plan runs on. A PLAN FEATURE, advertised on the pricing
 * page — not a silent downgrade. The mini model is genuinely fast and good;
 * the premium model reasons better on ambiguous niches, which is what the
 * higher tiers are paying for.
 */
export type ModelTier = "mini" | "premium";

/**
 * Capabilities a plan unlocks, beyond raw volume.
 *
 * Volume alone cannot carry a ladder whose allowances are sized to real usage
 * (see the note above), so these do the rest of the work. Each is a real thing
 * the customer either can or cannot do, checked at the route that performs it.
 */
export interface PlanFeatures {
  /** Instagram research. Gated: it costs 4-6x a YouTube run. */
  instagram: boolean;
  /** Whisper voice input. ~$0.003 a request, so paid tiers only. */
  voiceInput: boolean;
  /** Alternative title variants generated alongside each idea. */
  titleVariants: boolean;
  /** Thumbnail concepts generated alongside each idea. */
  thumbnailConcepts: boolean;
  /** Transcript extraction and summary. */
  transcripts: boolean;
  /** Per-run cost breakdown shown to the customer. */
  costBreakdown: boolean;
  /** Full agent and tool-call audit trail. */
  auditTrail: boolean;
  /** Priority support queue. */
  prioritySupport: boolean;
  /** Content calendar: schedule saved ideas onto dates. */
  contentCalendar: boolean;
  /** Cross-project hook library mined from outlier titles. */
  hookLibrary: boolean;
  /** Projects allowed. Null means unlimited. */
  maxProjects: number | null;
}

export interface Plan {
  key: PlanKey;
  name: string;
  /** One line under the name. Who this tier is actually for. */
  tagline: string;
  /** Dollars per month. 0 for free. */
  priceInr: number;
  /** Cents — what Razorpay actually charges. Money in the smallest unit only. */
  pricePaise: number;
  /** Billable runs included per month. */
  runs: number;
  /** Whether `runs` refills each month. True for every tier including free. */
  recurring: boolean;
  /** Videos pulled per YouTube run. */
  videosPerRun: number;
  /** Instagram posts pulled per run. Smaller because the data costs 4-6x. */
  postsPerRun: number;
  /** Runs allowed in a single day, so one afternoon cannot drain a month. */
  dailyCap: number;
  /** Which model generates ideas on this plan. Advertised, not hidden. */
  model: ModelTier;
  features: PlanFeatures;
}

export const PLANS: Record<PlanKey, Plan> = {
  free: {
    key: "free",
    name: "Scout",
    tagline: "See whether the scoring changes how you pick videos.",
    priceInr: 0,
    pricePaise: 0,
    runs: 3,
    recurring: true,
    videosPerRun: 50,
    postsPerRun: 0,
    // 2, not 1: the first thing a new user does is research a channel, and the
    // next thing the app asks them to do is generate ideas from it. With a cap
    // of 1 that second click was refused ("That is your 1 for today"), so no
    // one could finish the core loop on day one. Still below the 3 a month.
    dailyCap: 2,
    model: "mini",
    features: {
      instagram: false,
      voiceInput: false,
      titleVariants: false,
      thumbnailConcepts: false,
      transcripts: false,
      costBreakdown: false,
      auditTrail: false,
      prioritySupport: false,
      contentCalendar: false,
      hookLibrary: false,
      maxProjects: 1,
    },
  },
  creator: {
    key: "creator",
    name: "Creator",
    tagline: "One channel, posting every week.",
    priceInr: 499,
    pricePaise: 49900,
    runs: 12,
    recurring: true,
    videosPerRun: 100,
    postsPerRun: 0,
    dailyCap: 3,
    model: "mini",
    features: {
      instagram: false,
      voiceInput: true,
      titleVariants: true,
      thumbnailConcepts: true,
      transcripts: true,
      costBreakdown: false,
      auditTrail: false,
      prioritySupport: false,
      contentCalendar: false,
      hookLibrary: false,
      maxProjects: 3,
    },
  },
  studio: {
    key: "studio",
    name: "Studio",
    tagline: "A few channels, and you post like it is the job.",
    priceInr: 1299,
    pricePaise: 129900,
    runs: 32,
    recurring: true,
    videosPerRun: 150,
    postsPerRun: 40,
    dailyCap: 8,
    model: "premium",
    features: {
      instagram: true,
      voiceInput: true,
      titleVariants: true,
      thumbnailConcepts: true,
      transcripts: true,
      costBreakdown: true,
      auditTrail: false,
      prioritySupport: false,
      contentCalendar: true,
      hookLibrary: false,
      maxProjects: null,
    },
  },
  agency: {
    key: "agency",
    name: "Max",
    tagline: "Every channel you track, and a hook bank that keeps compounding.",
    priceInr: 3499,
    pricePaise: 349900,
    runs: 90,
    recurring: true,
    videosPerRun: 200,
    postsPerRun: 60,
    dailyCap: 22,
    model: "premium",
    features: {
      instagram: true,
      voiceInput: true,
      titleVariants: true,
      thumbnailConcepts: true,
      transcripts: true,
      costBreakdown: true,
      auditTrail: true,
      prioritySupport: true,
      contentCalendar: true,
      hookLibrary: true,
      maxProjects: null,
    },
  },
};

/** Paid tiers, in ladder order. The pricing page renders this. */
export const PAID_PLAN_KEYS = ["creator", "studio", "agency"] as const;
export type PaidPlanKey = (typeof PAID_PLAN_KEYS)[number];

export const PLAN_LIST: Plan[] = [
  PLANS.free,
  PLANS.creator,
  PLANS.studio,
  PLANS.agency,
];

/**
 * The tier the pricing page flags as the best deal.
 *
 * Studio, and it is engineered to be true rather than merely labelled: it is
 * the only step where the per-run price falls AND the feature set jumps
 * (Instagram, the premium model, unlimited projects, cost breakdown). Creator
 * is $0.95 a run, Studio $0.82, Max $0.59 — Max is cheaper per run but
 * only pays off at a volume most people cannot reach, which is exactly what
 * makes Studio the honest recommendation for almost everyone.
 */
export const HIGHLIGHTED_PLAN: PaidPlanKey = "studio";

/** Narrow an untrusted string to a plan key. Null if it is not one. */
export function toPlanKey(value: string): PlanKey | null {
  return value === "free" ||
    value === "creator" ||
    value === "studio" ||
    value === "agency"
    ? value
    : null;
}

/** Narrow an untrusted string to a PAID plan key. Null otherwise. */
export function toPaidPlanKey(value: string): PaidPlanKey | null {
  return value === "creator" || value === "studio" || value === "agency"
    ? value
    : null;
}

/**
 * The paid tiers STRICTLY ABOVE the one given, in ladder order.
 *
 * The single answer to "what can this person upgrade to?", so the workspace
 * upgrade panel and the sidebar's upgrade prompt cannot disagree about it.
 * Someone on Studio is offered Max and nothing else; someone on Max is offered
 * nothing and the panel hides itself rather than rendering an empty grid.
 *
 * Ladder position comes from PAID_PLAN_KEYS, not from price, because the array
 * is already the declared order and comparing dollars would silently reorder
 * the ladder the day two tiers are priced the same.
 *
 * A null plan means free (or an unknown row), which can reach every paid tier.
 * DOWNGRADES ARE NOT AN UPGRADE PATH: offering a cheaper tier here would create
 * a second mandate at a lower price rather than moving the existing one, so the
 * billing page sends those to cancel-then-resubscribe instead.
 */
export function plansAbove(current: PaidPlanKey | null): PaidPlanKey[] {
  if (current === null) return [...PAID_PLAN_KEYS];
  const index = PAID_PLAN_KEYS.indexOf(current);
  // An unrecognised tier is treated as the bottom of the ladder rather than
  // the top: showing every upgrade beats silently offering none.
  if (index === -1) return [...PAID_PLAN_KEYS];
  return PAID_PLAN_KEYS.slice(index + 1);
}

/**
 * The two ways to pay for any paid tier.
 *
 * Same product, same allowance, same features — only the billing period and
 * the price differ. Each tier-and-cycle pair maps to its OWN Razorpay plan
 * object, since a Razorpay plan hard-codes period, amount AND currency.
 *
 * YEARLY IS TWO MONTHS FREE: ten months' price for twelve months, a 17%
 * discount. That is the industry-standard framing and the easiest promise to
 * check.
 *
 * IT COSTS REAL MARGIN, and the discount comes straight out of it, because the
 * costs do not fall when someone prepays. What is bought is a year of cash up
 * front and a year without churn. Deepening the discount past two months free
 * starts eating the cushion that the first-year promo also draws on — and the
 * two stack, which is the thing to remember before touching either.
 */
export interface PlanPrice {
  cycle: BillingCycle;
  priceInr: number;
  pricePaise: number;
  /** Months covered by one charge. Drives every "per month" figure shown. */
  months: number;
  /** The env var holding this tier-and-cycle's Razorpay plan id. */
  envVar: string;
  /** Razorpay's `period` for the plan object. */
  razorpayPeriod: "monthly" | "yearly";
}

/** Months of subscription bought by one yearly charge. Ten paid, twelve given. */
export const YEARLY_MONTHS_CHARGED = 10;

function pricesFor(plan: Plan): Record<BillingCycle, PlanPrice> {
  const upper = plan.key.toUpperCase();
  return {
    monthly: {
      cycle: "monthly",
      priceInr: plan.priceInr,
      pricePaise: plan.pricePaise,
      months: 1,
      envVar: `RAZORPAY_PLAN_ID_${upper}_MONTHLY`,
      razorpayPeriod: "monthly",
    },
    yearly: {
      cycle: "yearly",
      priceInr: plan.priceInr * YEARLY_MONTHS_CHARGED,
      pricePaise: plan.pricePaise * YEARLY_MONTHS_CHARGED,
      months: 12,
      envVar: `RAZORPAY_PLAN_ID_${upper}_YEARLY`,
      razorpayPeriod: "yearly",
    },
  };
}

export const PLAN_PRICES: Record<PaidPlanKey, Record<BillingCycle, PlanPrice>> = {
  creator: pricesFor(PLANS.creator),
  studio: pricesFor(PLANS.studio),
  agency: pricesFor(PLANS.agency),
};

/** Narrow an untrusted string to a billing cycle. Null if it is not one. */
export function toBillingCycle(value: string): BillingCycle | null {
  return value === "monthly" || value === "yearly" ? value : null;
}

/** What one month works out at on this cycle — the honest comparison. */
export function perMonthInr(price: PlanPrice): number {
  return price.priceInr / price.months;
}

/** Dollars saved over a year by paying yearly rather than monthly. */
export function yearlySavingInr(key: PaidPlanKey): number {
  const prices = PLAN_PRICES[key];
  return prices.monthly.priceInr * 12 - prices.yearly.priceInr;
}

/** That saving as a percentage, for the "save 17%" badge. */
export function yearlySavingPercent(): number {
  return Math.round(((12 - YEARLY_MONTHS_CHARGED) / 12) * 100);
}

/** Runs a cycle buys in total. */
export function runsPerCycle(plan: Plan, price: PlanPrice): number {
  return plan.runs * price.months;
}

/** Rupees per run, for comparing tiers against each other. */
export function perRunInr(plan: Plan): number {
  return plan.runs === 0 ? 0 : plan.priceInr / plan.runs;
}

/**
 * Small numbers as words, for headline copy.
 *
 * The landing and pricing headlines are set in a display serif where "3 free
 * runs" reads like a spreadsheet and "Three free runs" reads like a sentence.
 * This exists so editorial voice does not require hardcoding the number in
 * prose — which is exactly how a page ends up promising ten while the plan
 * grants three.
 */
const WORDS = [
  "zero", "one", "two", "three", "four", "five", "six",
  "seven", "eight", "nine", "ten", "eleven", "twelve",
];

export function spellOut(value: number): string {
  return WORDS[value] ?? String(value);
}

/** Same, capitalised, for the start of a sentence. */
export function spellOutCapitalised(value: number): string {
  const word = spellOut(value);
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * "Rs 1,299" — one formatter, so no page invents its own currency spacing.
 *
 * `en-IN` grouping is deliberate: Indian digit grouping is 2,2,3 from the
 * right, so 29990 is "29,990" and 129900 would be "1,29,900". Formatting a
 * rupee price with en-US grouping is a small tell that the page was written
 * for somewhere else.
 *
 * The symbol is the rupee sign. It is written as an escape rather than pasted
 * so the file stays ASCII — this repo has already had a mojibake incident
 * where a pasted symbol reached a Razorpay plan name as "TubePulse Pro ?".
 */
const RUPEE = "\u20B9";

export function formatInr(amount: number): string {
  return Number.isInteger(amount)
    ? `${RUPEE}${amount.toLocaleString("en-IN")}`
    : `${RUPEE}${amount.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
}

/** Paise → rupees. Razorpay speaks the minor unit everywhere; humans do not. */
export function paiseToInr(paise: number): number {
  return paise / 100;
}

/**
 * Billing cycles requested when a subscription is created.
 *
 * Razorpay requires a finite `total_count`; there is no "until cancelled".
 * 100 monthly cycles is eight years, which is functionally forever for a
 * product this age, and stays inside Razorpay's per-period ceiling.
 */
export const PLAN_TOTAL_CYCLES: Record<BillingCycle, number> = {
  // 100 monthly cycles is eight years.
  monthly: 100,
  // Razorpay caps yearly plans far lower, and 10 years is well past the point
  // where anyone is still on the same price.
  yearly: 10,
};
