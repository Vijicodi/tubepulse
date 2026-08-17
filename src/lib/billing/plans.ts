/**
 * The plan catalogue — the ONE place any pricing number is written down.
 *
 * The pricing page, the billing page, the Razorpay plan-creation script and the
 * quota checks (when they land) all read from here. Previously these numbers
 * lived only in the marketing copy, which is how a page ends up promising 30
 * scrapes while the plan charges for 15.
 *
 * Pure module, no imports, no environment. Safe from a client component.
 *
 * ---------------------------------------------------------------------------
 * THE ECONOMICS. Do not "improve" these numbers without redoing this sum.
 * `tests/billing-status.test.ts` fails if any of it stops holding.
 *
 * WHAT ONE UNIT OF THE ALLOWANCE BUYS. `scrapes` counts two billable actions,
 * not one: a channel scrape, or a generation of ideas from a channel already
 * scraped. Both cost real money per press, so both spend a unit — see
 * BILLABLE_JOB_KINDS in quota.ts. The name stayed `scrapes` because that is the
 * word on the pricing page and in the plan the customer bought.
 *
 * A YouTube scrape of 100 videos costs roughly:
 *   Apify        ₹4.50
 *   Firecrawl    ₹1.50
 *   ------------------------------------------------------------
 *   Total        ₹6
 *
 * An INSTAGRAM scrape of 40 posts costs roughly:
 *   Apify        ₹9.50   (measured: $0.0027 an item, 4-6x YouTube's rate)
 *   ------------------------------------------------------------
 *   Total        ₹9.50
 *
 * That rate is why `postsPerScrape` is 40 and not 100. At 100 posts an
 * Instagram scrape is ₹24, and an allowance spent entirely on them would cost
 * ₹480 against ₹499 of revenue. The depth moves, not the price.
 *
 * An idea generation costs roughly:
 *   Firecrawl    ₹1.50
 *   OpenAI       ₹6.00 on gpt-4o, ₹0.40 on a mini-tier model
 *   ------------------------------------------------------------
 *   Total        ₹7.50 worst case, ₹2 best case
 *
 * So the worst case for ANY single unit is about ₹7.50. The sums below keep
 * using ₹12 — the old bundled figure — deliberately: it is now a comfortable
 * over-estimate, and a margin proved against a cost higher than the real one
 * cannot be wrong in the direction that hurts.
 *
 * Razorpay takes 2% plus 18% GST on that fee — 2.36% of whatever is charged.
 *
 * PRO at ₹499 for 20 scrapes, assuming a subscriber burns every single one:
 *   Revenue                    ₹499
 *   Razorpay fee               −₹12
 *   20 scrapes on gpt-4o      −₹240
 *   ------------------------------------------------------------
 *   Profit                     ₹247  — a 49% margin on the EXPENSIVE model
 *                                      (74% on a mini-tier model)
 *
 * 20 scrapes is the ceiling at this price. Every extra scrape costs ₹12 and
 * earns nothing, so 25 would drop the worst case to 37% and 30 to 25%. If more
 * scrapes are wanted, the price moves — not the allowance.
 *
 * REFILLS are deliberately priced ABOVE the Pro per-scrape rate:
 *   Pro          ₹499 / 20  =  ₹24.95 a scrape
 *   Refill       ₹149 /  5  =  ₹29.80 a scrape
 *   Big refill   ₹449 / 15  =  ₹29.93 a scrape
 *
 * Both packs sit at about ₹30 against the plan's ₹25, which is a story a
 * customer can verify in their head: refills cost more per scrape, so the
 * subscription is always the better deal. A refill that undercuts the plan
 * teaches people to cancel the plan.
 *
 * They also carry a BETTER margin than the subscription (57% each on gpt-4o),
 * because they are bought by the people already getting value from it.
 *
 * FREE costs real money too: every free scrape is spend on somebody who may
 * never pay. At 5 scrapes of 50 videos that is about ₹35 per signup — halved
 * from an earlier 10, which was ₹70 of acquisition budget per tyre-kicker. Five
 * is still enough to judge whether median scoring changes how you pick videos,
 * which is the only job the free tier has.
 *
 * THE DAILY CAP IS 5, AND IT IS DELIBERATELY BELOW scrapes/3. At 7 a day, three
 * enthusiastic days exhausted the whole monthly 20 and the cap protected
 * nothing — it was a burst limit wearing a spend guard's clothes. At 5 the month
 * cannot be drained in under four days, which is what makes it an actual
 * guarantee against a surprise API bill.
 * ---------------------------------------------------------------------------
 */

export type PlanKey = "free" | "pro";
export type TopupKey = "topup_small" | "topup_large";

/** How often Pro is charged. Two Razorpay plans, one product. */
export type BillingCycle = "monthly" | "yearly";

export interface Plan {
  key: PlanKey;
  name: string;
  /** Rupees per month. 0 for free. */
  priceRupees: number;
  /** Paise — what Razorpay actually charges. Money in the smallest unit only. */
  pricePaise: number;
  /** Scrapes included. For free this is a one-time grant, not monthly. */
  scrapes: number;
  /** Whether `scrapes` refills each month or is granted once, ever. */
  recurring: boolean;
  /** Videos pulled per scrape. The main lever between the two tiers. */
  videosPerScrape: number;
  /**
   * Instagram posts pulled per scrape. DELIBERATELY SMALLER than
   * `videosPerScrape`, and not for product reasons — Instagram data costs
   * $0.0027 an item against YouTube's roughly $0.00045, four to six times as
   * much. 40 posts is ₹9.5, which stays under the ₹12 the margin sums below
   * assume; 100 would be ₹24 and, spent across a whole allowance, would leave
   * ₹19 of profit on a ₹499 plan. 40 is ample for a stable median.
   */
  postsPerScrape: number;
  /** Scrapes allowed in a single day, so one afternoon cannot drain a month. */
  dailyCap: number;
}

export const PLANS: Record<PlanKey, Plan> = {
  free: {
    key: "free",
    name: "Scout",
    priceRupees: 0,
    pricePaise: 0,
    scrapes: 5,
    recurring: false,
    videosPerScrape: 50,
    postsPerScrape: 20,
    dailyCap: 2,
  },
  pro: {
    key: "pro",
    name: "Pro",
    priceRupees: 499,
    pricePaise: 49_900,
    scrapes: 20,
    recurring: true,
    videosPerScrape: 100,
    postsPerScrape: 40,
    dailyCap: 5,
  },
};

export const PRO = PLANS.pro;

/**
 * The two ways to pay for Pro.
 *
 * Same product, same 20 scrapes a month, same daily cap — only the billing
 * period and the price differ. Each maps to its OWN Razorpay plan object, since
 * a Razorpay plan hard-codes both period and amount.
 *
 * YEARLY IS TWO MONTHS FREE: ₹4,990 against ₹5,988 paid monthly, a 17%
 * discount. That is the industry-standard framing and the easiest promise to
 * check — twelve for the price of ten.
 *
 * IT ALSO COSTS REAL MARGIN, and this is the number to know before touching it:
 *
 *   Monthly, worst case   ₹499 − fee − (20 × ₹12)    = 49%
 *   Yearly,  worst case   ₹4,990 − fee − (240 × ₹12) = 40%
 *
 * The discount comes straight out of the margin, because the costs do not fall
 * when someone prepays. What is bought with those nine points is a year of cash
 * up front and a year without churn. That is a good trade, but it is a trade —
 * deepening the discount past two months free walks into the thirties.
 */
export interface PlanPrice {
  cycle: BillingCycle;
  priceRupees: number;
  pricePaise: number;
  /** Months covered by one charge. Drives every "per month" figure shown. */
  months: number;
  /** The env var holding this cycle's Razorpay plan id. */
  envVar: "RAZORPAY_PLAN_ID_PRO" | "RAZORPAY_PLAN_ID_PRO_YEARLY";
  /** Razorpay's `period` for the plan object. */
  razorpayPeriod: "monthly" | "yearly";
}

export const PRO_PRICES: Record<BillingCycle, PlanPrice> = {
  monthly: {
    cycle: "monthly",
    priceRupees: 499,
    pricePaise: 49_900,
    months: 1,
    envVar: "RAZORPAY_PLAN_ID_PRO",
    razorpayPeriod: "monthly",
  },
  yearly: {
    cycle: "yearly",
    priceRupees: 4_990,
    pricePaise: 499_000,
    months: 12,
    envVar: "RAZORPAY_PLAN_ID_PRO_YEARLY",
    razorpayPeriod: "yearly",
  },
};

/** Narrow an untrusted string to a billing cycle. Null if it is not one. */
export function toBillingCycle(value: string): BillingCycle | null {
  return value === "monthly" || value === "yearly" ? value : null;
}

/** What one month works out at on this cycle — the honest comparison. */
export function perMonthRupees(price: PlanPrice): number {
  return price.priceRupees / price.months;
}

/** Rupees saved over a year by paying yearly rather than monthly. */
export function yearlySavingRupees(): number {
  return PRO_PRICES.monthly.priceRupees * 12 - PRO_PRICES.yearly.priceRupees;
}

/** That saving as a percentage, for the "save 17%" badge. */
export function yearlySavingPercent(): number {
  const full = PRO_PRICES.monthly.priceRupees * 12;
  return Math.round((yearlySavingRupees() / full) * 100);
}

/** Scrapes a cycle buys in total — 20 monthly, 240 yearly. */
export function scrapesPerCycle(price: PlanPrice): number {
  return PRO.scrapes * price.months;
}

/**
 * One-off scrape packs.
 *
 * A DIFFERENT Razorpay product from the subscription: these are Orders, paid
 * once, with no mandate. That is why they get their own route, their own
 * webhook event and their own ledger table — see docs/decisions/0005.
 *
 * Credits never expire. They were bought outright, and expiring them would be
 * the kind of small print the pricing page is written against.
 */
export interface Topup {
  key: TopupKey;
  name: string;
  priceRupees: number;
  pricePaise: number;
  scrapes: number;
  /** The line under the name. Written here so the two pages cannot disagree. */
  blurb: string;
}

export const TOPUPS: Record<TopupKey, Topup> = {
  topup_small: {
    key: "topup_small",
    name: "Refill",
    priceRupees: 149,
    pricePaise: 14_900,
    scrapes: 5,
    blurb: "A few more channels before the month resets.",
  },
  topup_large: {
    key: "topup_large",
    name: "Big refill",
    priceRupees: 449,
    pricePaise: 44_900,
    scrapes: 15,
    blurb: "For the week a whole niche needs pulling apart.",
  },
};

export const TOPUP_LIST: Topup[] = [TOPUPS.topup_small, TOPUPS.topup_large];

/** Narrow an untrusted string to a topup key. Returns null if it is not one. */
export function toTopupKey(value: string): TopupKey | null {
  return value === "topup_small" || value === "topup_large" ? value : null;
}

/** Rupees per scrape, for comparing a pack against the plan. */
export function perScrapeRupees(item: { priceRupees: number; scrapes: number }): number {
  return item.scrapes === 0 ? 0 : item.priceRupees / item.scrapes;
}

/**
 * Small numbers as words, for headline copy.
 *
 * The landing and pricing headlines are set in a display serif where "5 free
 * scrapes" reads like a spreadsheet and "Five free scrapes" reads like a
 * sentence. This exists so that editorial voice does not require hardcoding the
 * number in prose — which is exactly how the page ended up promising ten while
 * the plan granted five.
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

/** "₹499" — one formatter, so no page invents its own rupee symbol spacing. */
export function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

/** Paise → rupees. Razorpay speaks paise everywhere; humans do not. */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/**
 * Billing cycles requested when a subscription is created.
 *
 * Razorpay requires a finite `total_count`; there is no "until cancelled".
 * 100 monthly cycles is eight years, which is functionally forever for a
 * product this age, and stays inside Razorpay's per-period ceiling.
 */
export const PRO_TOTAL_CYCLES: Record<BillingCycle, number> = {
  // 100 monthly cycles is eight years.
  monthly: 100,
  // Razorpay caps yearly plans far lower, and 10 years is well past the point
  // where anyone is still on the same price.
  yearly: 10,
};
