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
 * CURRENCY IS USD, GLOBALLY. There is no regional pricing.
 *
 * This was considered and rejected. INR pricing that Indian customers would
 * actually pay (₹499) cannot fund US-level allowances — at ₹499 for 50 runs on
 * a promoted annual the margin is NEGATIVE 12%. Regional pricing therefore
 * means regional allowances, i.e. two different products wearing the same tier
 * names. One global price is the simpler, more honest thing, and it is what
 * this file implements. Indian customers will find $19 expensive; that is a
 * known and accepted trade.
 * ---------------------------------------------------------------------------
 * THE ECONOMICS. Do not "improve" these numbers without redoing this sum.
 * `tests/billing-status.test.ts` fails if any of it stops holding.
 *
 * WHAT ONE UNIT OF THE ALLOWANCE BUYS. `runs` counts every billable action: a
 * channel scrape, a generation of ideas from a channel already scraped, or a
 * transcript extraction. All cost real money per press, so all spend a unit —
 * see BILLABLE_JOB_KINDS in quota.ts.
 *
 * COST PER RUN depends on the model tier, which is now a PLAN FEATURE:
 *
 *   Mini-tier model (Scout, Creator)
 *     Apify        ₹4.50
 *     Firecrawl    ₹1.50
 *     LLM          ₹0.40
 *     ----------------------------------------------------------------
 *     Total        ₹6.40   ≈ $0.073 at ₹88/$
 *
 *   Premium model (Studio, Max)
 *     Apify        ₹4.50
 *     Firecrawl    ₹1.50
 *     LLM          ₹6.00
 *     ----------------------------------------------------------------
 *     Total        ₹12.00  ≈ $0.136 at ₹88/$
 *
 * An INSTAGRAM run costs about ₹9.50 in Apify alone — 4-6x YouTube's rate,
 * measured at $0.0027 an item. That is why `postsPerRun` is smaller than
 * `videosPerRun`, and why Instagram is gated to Studio and above: the depth
 * moves and the tier moves, the price does not.
 *
 * Whisper voice transcription adds ~$0.003 per voice-initiated request. Assumed
 * at 50% of runs in the sums below, which is generous.
 *
 * Razorpay international takes ~3% plus 18% GST — 3.54% of whatever is charged.
 * This is HIGHER than the 2.36% domestic rate the old INR pricing assumed.
 *
 * THE WORST CASE IS NOT THE MONTHLY PRICE. It is the yearly price with the
 * 30%-off first-year promo applied, spread across twelve months — that is the
 * least revenue a month of usage will ever earn. Every allowance below is
 * sized against THAT number, not the sticker price:
 *
 *   Creator  $19/mo → $133/yr promoted → $11.08/mo effective → 83% margin
 *   Studio   $49/mo → $343/yr promoted → $28.58/mo effective → 68% margin
 *   Max      $89/mo → $623/yr promoted → $51.92/mo effective → 57% margin
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
 * So each tier's allowance sits just above its own segment's ceiling and below
 * the next segment's floor. Creator's 20 comfortably fits a solo creator and
 * runs out the moment they scale to three channels. Studio's 60 fits a serious
 * creator and runs out at power-user volume. That is what makes the ladder
 * real rather than decorative.
 *
 * RAISING AN ALLOWANCE WITHOUT RAISING ITS PRICE BREAKS THE LADDER, not just
 * the margin. If Creator gave 50 runs, no solo creator would ever need Studio,
 * and the middle tier would exist only to be ignored.
 *
 * FREE costs real money too: every free run is spend on somebody who may never
 * pay. Three runs a month on the mini model is about $0.22 per signup per
 * month — cheap enough to leave recurring rather than one-time, which keeps
 * people in the product long enough to convert.
 *
 * THE DAILY CAP IS DELIBERATELY BELOW runs/3, so a month cannot be drained in
 * under three days. It is a spend guard, not a burst limit.
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
  priceUsd: number;
  /** Cents — what Razorpay actually charges. Money in the smallest unit only. */
  priceCents: number;
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
    priceUsd: 0,
    priceCents: 0,
    runs: 3,
    recurring: true,
    videosPerRun: 50,
    postsPerRun: 0,
    dailyCap: 1,
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
    priceUsd: 19,
    priceCents: 1_900,
    runs: 20,
    recurring: true,
    videosPerRun: 100,
    postsPerRun: 0,
    dailyCap: 5,
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
    priceUsd: 49,
    priceCents: 4_900,
    runs: 60,
    recurring: true,
    videosPerRun: 150,
    postsPerRun: 40,
    dailyCap: 15,
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
    priceUsd: 89,
    priceCents: 8_900,
    runs: 150,
    recurring: true,
    videosPerRun: 200,
    postsPerRun: 60,
    dailyCap: 35,
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
  priceUsd: number;
  priceCents: number;
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
      priceUsd: plan.priceUsd,
      priceCents: plan.priceCents,
      months: 1,
      envVar: `RAZORPAY_PLAN_ID_${upper}_MONTHLY`,
      razorpayPeriod: "monthly",
    },
    yearly: {
      cycle: "yearly",
      priceUsd: plan.priceUsd * YEARLY_MONTHS_CHARGED,
      priceCents: plan.priceCents * YEARLY_MONTHS_CHARGED,
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
export function perMonthUsd(price: PlanPrice): number {
  return price.priceUsd / price.months;
}

/** Dollars saved over a year by paying yearly rather than monthly. */
export function yearlySavingUsd(key: PaidPlanKey): number {
  const prices = PLAN_PRICES[key];
  return prices.monthly.priceUsd * 12 - prices.yearly.priceUsd;
}

/** That saving as a percentage, for the "save 17%" badge. */
export function yearlySavingPercent(): number {
  return Math.round(((12 - YEARLY_MONTHS_CHARGED) / 12) * 100);
}

/** Runs a cycle buys in total. */
export function runsPerCycle(plan: Plan, price: PlanPrice): number {
  return plan.runs * price.months;
}

/** Dollars per run, for comparing tiers against each other. */
export function perRunUsd(plan: Plan): number {
  return plan.runs === 0 ? 0 : plan.priceUsd / plan.runs;
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

/** "$19" — one formatter, so no page invents its own currency spacing. */
export function formatUsd(amount: number): string {
  return Number.isInteger(amount)
    ? `$${amount.toLocaleString("en-US")}`
    : `$${amount.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
}

/** Cents → dollars. Razorpay speaks the minor unit everywhere; humans do not. */
export function centsToUsd(cents: number): number {
  return cents / 100;
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
