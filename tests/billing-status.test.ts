import { describe, expect, it } from "vitest";
import {
  HIGHLIGHTED_PLAN,
  PAID_PLAN_KEYS,
  PLANS,
  PLAN_LIST,
  PLAN_PRICES,
  PLAN_TOTAL_CYCLES,
  formatInr,
  perMonthInr,
  perRunInr,
  toPaidPlanKey,
  yearlySavingPercent,
  yearlySavingInr,
  type PaidPlanKey,
  type Plan,
} from "@/lib/billing/plans";
import { billingStateFrom, hasPaidAccess, tierOf } from "@/lib/billing/status";
import { toSubscriptionStatus } from "@/lib/razorpay/schemas";
import type { SubscriptionRow, SubscriptionStatus } from "@/lib/supabase/types";

/**
 * The rules that decide who gets paid features, tested away from any database.
 *
 * Two failure directions, and they are not equally bad:
 *   - denying access to someone who paid is a support ticket
 *   - granting access to someone who did not is lost money, silently, forever
 * So the "must be false" cases below outnumber the others on purpose.
 */

const NOW = new Date("2026-08-17T12:00:00.000Z");
const NEXT_MONTH = "2026-09-17T12:00:00.000Z";
const LAST_MONTH = "2026-07-17T12:00:00.000Z";

function row(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    owner_id: "00000000-0000-0000-0000-0000000000aa",
    plan_key: "studio",
    // Existing rows are Razorpay's; PayPal ids are null on them, which is what
    // the 0016 constraint requires.
    provider: "razorpay",
    paypal_subscription_id: null,
    paypal_plan_id: null,
    paypal_payer_id: null,
    razorpay_subscription_id: "sub_test123",
    razorpay_customer_id: "cust_test123",
    razorpay_plan_id: "plan_test123",
    status: "active",
    billing_cycle: "monthly",
    current_period_end: NEXT_MONTH,
    cancel_at_period_end: false,
    promo_code: null,
    promo_cycles_total: null,
    promo_cycles_remaining: null,
    promo_renews_at_cents: null,
    switch_subscription_id: null,
    cancelled_at: null,
    created_at: LAST_MONTH,
    updated_at: LAST_MONTH,
    ...overrides,
  };
}

describe("hasProAccess", () => {
  it("grants access while active", () => {
    expect(hasPaidAccess(row({ status: "active" }), NOW)).toBe(true);
  });

  it("grants access once the mandate is authenticated but not yet charged", () => {
    // Razorpay sits in 'authenticated' between mandate approval and the first
    // debit. Locking someone out during that window means paying and then
    // being told you have not.
    expect(hasPaidAccess(row({ status: "authenticated" }), NOW)).toBe(true);
  });

  it("keeps access after cancelling, until the paid period ends", () => {
    expect(
      hasPaidAccess(row({ status: "cancelled", current_period_end: NEXT_MONTH }), NOW),
    ).toBe(true);
  });

  it("removes access once the cancelled period has lapsed", () => {
    expect(
      hasPaidAccess(row({ status: "cancelled", current_period_end: LAST_MONTH }), NOW),
    ).toBe(false);
  });

  it("denies access on 'created' — the mandate was never authorised", () => {
    // This is the one that matters. A subscription row exists the moment
    // checkout starts, so treating its mere presence as Pro would hand the
    // paid tier to anyone who opened the popup and closed it.
    expect(
      hasPaidAccess(row({ status: "created", current_period_end: NEXT_MONTH }), NOW),
    ).toBe(false);
  });

  it("denies access on 'halted' even inside a paid period", () => {
    // Halted means the retries were exhausted; the money did not arrive.
    expect(
      hasPaidAccess(row({ status: "halted", current_period_end: NEXT_MONTH }), NOW),
    ).toBe(false);
  });

  it("denies access on 'expired'", () => {
    expect(
      hasPaidAccess(row({ status: "expired", current_period_end: NEXT_MONTH }), NOW),
    ).toBe(false);
  });

  it("denies access when a grace status has no period end to lean on", () => {
    expect(
      hasPaidAccess(row({ status: "cancelled", current_period_end: null }), NOW),
    ).toBe(false);
  });
});

describe("billingStateFrom", () => {
  it("treats a missing row as the free plan", () => {
    const state = billingStateFrom(null, NOW);
    expect(state.isPaid).toBe(false);
    expect(state.status).toBe("none");
    expect(state.canSubscribe).toBe(true);
    expect(state.canCancel).toBe(false);
  });

  it("does not offer checkout to someone already paying", () => {
    // Razorpay would happily create a second mandate on the same card and
    // charge ₹998 a month.
    expect(billingStateFrom(row({ status: "active" }), NOW).canSubscribe).toBe(false);
  });

  it("offers checkout again after a halted subscription", () => {
    expect(billingStateFrom(row({ status: "halted" }), NOW).canSubscribe).toBe(true);
  });

  /*
   * THE LOCKOUT. `subscribedTier` is set on ANY row — including a checkout
   * that was opened and closed ('created'). The pricing and billing pages
   * used it to mean "the plan you own", so one abandoned popup labelled that
   * card "Your plan" and disabled every upgrade button for good. `ownedTier`
   * is the one the UI must use: set only while the tier is really theirs.
   */
  it("owns no tier after an abandoned checkout, a failure or a lapse", () => {
    for (const status of ["created", "expired", "halted"] as const) {
      const state = billingStateFrom(row({ status }), NOW);
      expect(state.ownedTier, status).toBeNull();
      expect(state.canSubscribe, status).toBe(true);
    }
    const lapsed = billingStateFrom(
      row({ status: "cancelled", current_period_end: LAST_MONTH }),
      NOW,
    );
    expect(lapsed.ownedTier).toBeNull();
    expect(lapsed.canSubscribe).toBe(true);
  });

  it("owns the tier while paying, and while a cancelled period still runs", () => {
    expect(billingStateFrom(row({ status: "active" }), NOW).ownedTier).toBe("studio");
    expect(billingStateFrom(row({ status: "authenticated" }), NOW).ownedTier).toBe("studio");
    expect(
      billingStateFrom(row({ status: "cancelled", current_period_end: NEXT_MONTH }), NOW)
        .ownedTier,
    ).toBe("studio");
  });

  it("offers cancel only on a live subscription that is not already cancelling", () => {
    expect(billingStateFrom(row({ status: "active" }), NOW).canCancel).toBe(true);
    expect(
      billingStateFrom(row({ status: "active", cancel_at_period_end: true }), NOW)
        .canCancel,
    ).toBe(false);
    expect(billingStateFrom(row({ status: "halted" }), NOW).canCancel).toBe(false);
  });

  it("cannot offer cancel without a razorpay id to cancel", () => {
    expect(
      billingStateFrom(row({ status: "active", razorpay_subscription_id: null }), NOW)
        .canCancel,
    ).toBe(false);
  });

  it("says 'cancelling', not 'cancelled', while the paid period runs", () => {
    const state = billingStateFrom(
      row({ status: "active", cancel_at_period_end: true }),
      NOW,
    );
    expect(state.isPaid).toBe(true);
    expect(state.headline).toMatch(/cancelling/i);
    expect(state.headline).toMatch(/No further charges/i);
  });

  it("writes a headline for every status without falling through", () => {
    const statuses: SubscriptionStatus[] = [
      "created",
      "authenticated",
      "active",
      "pending",
      "halted",
      "cancelled",
      "completed",
      "expired",
    ];

    for (const status of statuses) {
      const headline = billingStateFrom(row({ status }), NOW).headline;
      expect(headline.length).toBeGreaterThan(10);
      expect(headline).not.toMatch(/undefined|null|NaN/);
    }
  });
});

describe("toSubscriptionStatus", () => {
  it("passes through the statuses Razorpay documents", () => {
    expect(toSubscriptionStatus("active")).toBe("active");
    expect(toSubscriptionStatus("HALTED")).toBe("halted");
  });

  it("falls back to 'created' for anything unrecognised", () => {
    // An unknown status must not throw inside the webhook, and must not grant
    // access. 'created' is the only value that satisfies both.
    expect(toSubscriptionStatus("paused_for_reasons")).toBe("created");
    expect(hasPaidAccess(row({ status: toSubscriptionStatus("nonsense") }), NOW)).toBe(
      false,
    );
  });
});

/** Margin after Razorpay's 2% + 18% GST, assuming every scrape is used. */
/**
 * Worst-case margin for a tier, as a fraction of revenue.
 *
 * "Worst case" is NOT the monthly price. It is the yearly price with the
 * first-year promo applied, spread over twelve months — the least this tier
 * will ever earn for a month of usage. Sizing an allowance against the sticker
 * price is how a discount quietly turns a plan into a loss.
 */
/**
 * Worst-case cost of one run, IN RUPEES, by the model the tier runs on.
 *
 * Everything is rupees now — prices, costs and fees — so there is no currency
 * conversion in this file at all. The previous version multiplied by a
 * USD_PER_INR rate because the catalogue was priced in dollars while the costs
 * below were measured in rupees; with both in the same unit that step is not
 * merely unnecessary, it would be wrong.
 */
function costPerRun(plan: Plan, llmRupees?: number): number {
  const llm = llmRupees ?? (plan.model === "premium" ? 6 : 0.4);
  // Apify 4.50 + Firecrawl 1.50 + the model, plus Whisper on half of runs.
  return 4.5 + 1.5 + llm + 0.13;
}

/**
 * Razorpay DOMESTIC: 2% plus 18% GST on that fee.
 *
 * Lower than the 3.54% the international path cost. Selling only in India is
 * cheaper to collect, and the allowances are sized against this number.
 */
const GATEWAY_FEE = 0.02 * 1.18;

/** The launch promo: a flat 20% off, on annual plans only. See LAUNCH20. */
const PROMO = 0.2;

function marginOf(plan: Plan, llmRupees?: number): number {
  const yearly = PLAN_PRICES[plan.key as PaidPlanKey].yearly.priceInr;
  const effectiveMonthly = (yearly * (1 - PROMO)) / 12;

  const fee = effectiveMonthly * GATEWAY_FEE;
  const cost = plan.runs * costPerRun(plan, llmRupees);

  return (effectiveMonthly - fee - cost) / effectiveMonthly;
}

describe("the plan catalogue", () => {
  it("keeps cents and dollars in step", () => {
    // The pricing page shows dollars; Razorpay charges the minor unit. A
    // mismatch here bills a different number from the one advertised.
    for (const plan of PLAN_LIST) {
      expect(plan.pricePaise).toBe(plan.priceInr * 100);
    }
    expect(PLANS.free.pricePaise).toBe(0);
  });

  it("stays profitable on every paid tier at the WORST case", () => {
    // Worst case = annual, with the 30% first-year promo, at that tier's own
    // model. If this fails, a tier is losing money and the price or the
    // allowance must move before shipping.
    for (const key of PAID_PLAN_KEYS) {
      expect(marginOf(PLANS[key])).toBeGreaterThan(0.45);
    }
  });

  it("survives a tripled model cost on every tier, though not comfortably", () => {
    // A model price rise should not be an emergency. It is not — but the
    // cushion is NOT uniform, and that is worth knowing before anyone reprices:
    //
    //   at Rs 18 a run (triple)   Creator 71%   Studio 8%   Max 5%
    //
    // READ THAT AGAIN BEFORE REPRICING. At rupee prices the premium tiers do
    // NOT have a comfortable cushion against a model price rise — they survive
    // it and little more, because they already run the expensive model AND
    // carry the most runs, so cost scales hardest exactly where margin is
    // thinnest. This asserts only that they stay PROFITABLE.
    //
    // If OpenAI raises prices materially, Studio and Max move first, and the
    // answer is the PRICE, not the allowance — cutting runs would break the
    // per-run ladder that the "best value" badge depends on.
    for (const key of PAID_PLAN_KEYS) {
      expect(marginOf(PLANS[key], 18)).toBeGreaterThan(0);
    }

    // Note `18` REPLACES the model cost, it does not triple it — so this is
    // Creator running the PREMIUM model at three times its price, a scenario
    // far worse than anything that would actually happen to a mini-model tier.
    // It still clears 10%.
    expect(marginOf(PLANS.creator, 18)).toBeGreaterThan(0.1);

    // Against a realistic tripling of its OWN model cost, Creator is untouched.
    expect(marginOf(PLANS.creator, 1.2)).toBeGreaterThan(0.65);
  });

  it("keeps every daily cap below runs/3, so a month cannot be drained fast", () => {
    // The invariant, not just "cap < month". Below runs/3 the month always
    // takes at least three days to spend, which is what makes it a spend guard
    // rather than a burst limit.
    for (const key of PAID_PLAN_KEYS) {
      expect(PLANS[key].dailyCap * 3).toBeLessThan(PLANS[key].runs);
    }
    expect(PLANS.free.dailyCap).toBeLessThan(PLANS.free.runs);
  });

  it("keeps the free tier's give-away cost modest", () => {
    // Every free run is spend on someone who may never pay. Scout runs the
    // cheap model, so this is the monthly acquisition budget per signup.
    // IN RUPEES now, not dollars. Three runs on the mini model is about
    // Rs 20 a month per signup — the old threshold of 0.5 was half a DOLLAR,
    // which in rupees would demand a give-away twelve times smaller than the
    // one that was already agreed.
    const monthlyCost = PLANS.free.runs * costPerRun(PLANS.free);
    expect(monthlyCost).toBeLessThanOrEqual(25);
  });

  it("makes each tier deeper than the one below it", () => {
    expect(PLANS.creator.videosPerRun).toBeGreaterThan(PLANS.free.videosPerRun);
    expect(PLANS.studio.videosPerRun).toBeGreaterThan(PLANS.creator.videosPerRun);
    expect(PLANS.agency.videosPerRun).toBeGreaterThan(PLANS.studio.videosPerRun);
  });

  it("sizes allowances to real usage, so the ladder actually forces upgrades", () => {
    // THE RULE THAT MATTERS. An allowance far above what a segment can
    // physically consume is not generosity — it is a broken ladder, because
    // nobody ever has a reason to move up. Measured monthly usage:
    //   solo creator 10-16, serious creator 28-44, power user 85-140.
    // Each tier must fit its own segment and run out for the next one.
    // RUPEE PRICES BUY SMALLER ALLOWANCES, so each tier now sits INSIDE its
    // segment rather than at the top of it. Creator's 12 covers the middle of
    // the solo band and runs out on a second channel; Studio's 32 covers a
    // serious creator; Max's 90 reaches into power-user territory. The rule
    // being protected is the SHAPE — each tier must fit its own segment and
    // run out before the next one's ceiling — not the exact numbers, which
    // move with the currency.
    expect(PLANS.creator.runs).toBeGreaterThanOrEqual(10);
    expect(PLANS.creator.runs).toBeLessThan(28);

    expect(PLANS.studio.runs).toBeGreaterThanOrEqual(28);
    expect(PLANS.studio.runs).toBeLessThan(85);

    expect(PLANS.agency.runs).toBeGreaterThanOrEqual(85);

    // And the ladder must be strictly increasing, whatever the currency.
    expect(PLANS.studio.runs).toBeGreaterThan(PLANS.creator.runs);
    expect(PLANS.agency.runs).toBeGreaterThan(PLANS.studio.runs);
  });

  it("requests a finite but effectively endless billing cycle count", () => {
    // Razorpay has no "until cancelled"; total_count is mandatory.
    expect(PLAN_TOTAL_CYCLES.monthly).toBeGreaterThanOrEqual(60);
    expect(PLAN_TOTAL_CYCLES.monthly).toBeLessThanOrEqual(100);
    expect(PLAN_TOTAL_CYCLES.yearly).toBeGreaterThanOrEqual(5);
  });

  it("formats rupees with Indian digit grouping", () => {
    // en-IN groups 2,2,3 from the right, so 34990 is "34,990" and 129900 is
    // "1,29,900". Using en-US grouping here is a small tell that the page was
    // written for somewhere else.
    expect(formatInr(499)).toBe("₹499");
    expect(formatInr(0)).toBe("₹0");
    expect(formatInr(34990)).toBe("₹34,990");
    expect(formatInr(129900)).toBe("₹1,29,900");
  });

  it("narrows untrusted plan keys, and refuses anything else", () => {
    expect(toPaidPlanKey("studio")).toBe("studio");
    expect(toPaidPlanKey("free")).toBeNull();
    expect(toPaidPlanKey("pro")).toBeNull();
    expect(toPaidPlanKey("")).toBeNull();
    expect(toPaidPlanKey("__proto__")).toBeNull();
  });
});

describe("the upgrade ladder reads as a deal", () => {
  it("makes the highlighted tier cheaper per run than the one below it", () => {
    // The badge has to be TRUE, not just printed. Studio must beat Creator on
    // per-run price, or "best value" is a claim the arithmetic contradicts.
    expect(perRunInr(PLANS.studio)).toBeLessThan(perRunInr(PLANS.creator));
  });

  it("gives the highlighted tier a feature jump, not just more volume", () => {
    // Volume alone cannot carry a ladder whose allowances are sized to real
    // usage. Studio has to unlock something Creator does not.
    expect(PLANS.creator.features.instagram).toBe(false);
    expect(PLANS[HIGHLIGHTED_PLAN].features.instagram).toBe(true);
    expect(PLANS[HIGHLIGHTED_PLAN].model).toBe("premium");
  });
});

describe("annual billing", () => {
  it("keeps cents and dollars in step on both cycles", () => {
    for (const key of PAID_PLAN_KEYS) {
      for (const cycle of ["monthly", "yearly"] as const) {
        const price = PLAN_PRICES[key][cycle];
        expect(price.pricePaise).toBe(price.priceInr * 100);
      }
    }
  });

  it("is genuinely cheaper per month than paying monthly", () => {
    for (const key of PAID_PLAN_KEYS) {
      expect(perMonthInr(PLAN_PRICES[key].yearly)).toBeLessThan(
        PLAN_PRICES[key].monthly.priceInr,
      );
    }
  });

  it("is exactly two months free, which is what the badge claims", () => {
    for (const key of PAID_PLAN_KEYS) {
      expect(PLAN_PRICES[key].yearly.priceInr).toBe(
        PLAN_PRICES[key].monthly.priceInr * 10,
      );
    }
    expect(yearlySavingPercent()).toBe(17);
  });

  it("saves two months of the monthly price", () => {
    for (const key of PAID_PLAN_KEYS) {
      expect(yearlySavingInr(key)).toBe(PLAN_PRICES[key].monthly.priceInr * 2);
    }
  });

  it("gives every tier its own plan id variable, since a plan is per-cycle", () => {
    // A Razorpay plan hard-codes period AND amount AND currency, so every
    // tier-and-cycle pair is a separate object. Two tiers sharing an env var
    // would bill one price for both.
    const vars = new Set<string>();
    for (const key of PAID_PLAN_KEYS) {
      for (const cycle of ["monthly", "yearly"] as const) {
        vars.add(PLAN_PRICES[key][cycle].envVar);
      }
    }
    expect(vars.size).toBe(PAID_PLAN_KEYS.length * 2);
  });
});

describe("which tier a subscription row is for", () => {
  it("reads the stored plan key", () => {
    expect(tierOf({ plan_key: "agency" })).toBe("agency");
  });

  it("refuses a key we no longer sell rather than guessing", () => {
    // A row written before four-tier pricing says "pro". Guessing which of the
    // four that meant would be inventing a price somebody is charged.
    expect(tierOf({ plan_key: "pro" })).toBeNull();
    expect(tierOf({ plan_key: "" })).toBeNull();
  });

  it("drops an unrecognised tier to free rather than throwing", () => {
    const state = billingStateFrom(row({ status: "active", plan_key: "pro" }), NOW);
    // Access is refused, but the page still renders — refusing to draw the
    // billing screen is a worse failure than showing the free tier.
    expect(state.planKey).toBe("free");
    expect(state.isPaid).toBe(false);
  });

  it("unlocks the tier that was actually bought", () => {
    const state = billingStateFrom(row({ status: "active", plan_key: "agency" }), NOW);
    expect(state.planKey).toBe("agency");
    expect(state.isPaid).toBe(true);
    expect(state.headline).toContain(PLANS.agency.name);
  });
});


/**
 * THE DISCOUNT COUNTDOWN.
 *
 * Shown to a customer partway through a two-month promo. It has to be right in
 * both directions: silent about a coming price rise is a chargeback, and
 * claiming a discount that has ended is a lie the next invoice exposes.
 */
describe("the discount countdown", () => {
  it("counts the discounted cycles left and names the price after", () => {
    const state = billingStateFrom(
      row({
        promo_code: "LAUNCH",
        promo_cycles_total: 2,
        promo_cycles_remaining: 2,
        promo_renews_at_cents: 4_900,
      }),
      NOW,
    );

    expect(state.promo).not.toBeNull();
    expect(state.promo?.cyclesRemaining).toBe(2);
    expect(state.promo?.notice).toContain("2 months");
    expect(state.promo?.notice).toContain("₹49");
  });

  it("says '1 month', not '1 months', on the last discounted cycle", () => {
    const state = billingStateFrom(
      row({
        promo_code: "LAUNCH",
        promo_cycles_total: 2,
        promo_cycles_remaining: 1,
        promo_renews_at_cents: 4_900,
      }),
      NOW,
    );
    expect(state.promo?.notice).toContain("1 month");
    expect(state.promo?.notice).not.toContain("1 months");
  });

  it("goes quiet once the discount is spent", () => {
    // At zero the ordinary renewal line is the truthful one. Continuing to
    // show "your discount" would contradict the next invoice.
    const state = billingStateFrom(
      row({
        promo_code: "LAUNCH",
        promo_cycles_total: 2,
        promo_cycles_remaining: 0,
        promo_renews_at_cents: 4_900,
      }),
      NOW,
    );
    expect(state.promo).toBeNull();
  });

  it("never advertises a discount on a lapsed subscription", () => {
    const state = billingStateFrom(
      row({
        status: "halted",
        current_period_end: LAST_MONTH,
        promo_code: "LAUNCH",
        promo_cycles_total: 2,
        promo_cycles_remaining: 2,
        promo_renews_at_cents: 4_900,
      }),
      NOW,
    );
    expect(state.isPaid).toBe(false);
    expect(state.promo).toBeNull();
  });

  it("is null for a subscription bought without a code", () => {
    expect(billingStateFrom(row(), NOW).promo).toBeNull();
  });

  it("still counts down when the renewal price was never recorded", () => {
    // Degraded but honest: say what is left, claim nothing about the price.
    const state = billingStateFrom(
      row({
        promo_code: "LAUNCH",
        promo_cycles_total: 2,
        promo_cycles_remaining: 1,
        promo_renews_at_cents: null,
      }),
      NOW,
    );
    expect(state.promo?.notice).toContain("1 month");
    expect(state.promo?.notice).not.toContain("$");
  });

  it("uses years for an annual subscription", () => {
    const state = billingStateFrom(
      row({
        billing_cycle: "yearly",
        promo_code: "ANNUAL",
        promo_cycles_total: 1,
        promo_cycles_remaining: 1,
        promo_renews_at_cents: 34_300,
      }),
      NOW,
    );
    expect(state.promo?.notice).toContain("1 year");
  });
});

describe("an 'active' row whose paid period is long over (found 2026-10-04)", () => {
  // If the halted/cancelled webhook is ever lost, the row stays 'active'
  // forever. Without a date check that was paid access forever, for free.
  const DAY = 24 * 60 * 60 * 1000;
  const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

  it("still grants access inside the renewal grace window", () => {
    expect(hasPaidAccess(row({ status: "active", current_period_end: ago(1) }), NOW)).toBe(true);
  });

  it("stops granting access once the grace window has passed", () => {
    expect(hasPaidAccess(row({ status: "active", current_period_end: ago(4) }), NOW)).toBe(false);
    expect(hasPaidAccess(row({ status: "active", current_period_end: LAST_MONTH }), NOW)).toBe(false);
  });

  it("keeps access when the period end is not known yet", () => {
    expect(hasPaidAccess(row({ status: "authenticated", current_period_end: null }), NOW)).toBe(true);
  });
});

describe("promo notice money", () => {
  it("is in rupees, never dollars", () => {
    const state = billingStateFrom(
      row({
        promo_code: "LAUNCH20",
        promo_cycles_total: 2,
        promo_cycles_remaining: 1,
        promo_renews_at_cents: 129_900,
      }),
      NOW,
    );
    expect(state.promo?.notice).toContain("₹1,299");
    expect(state.promo?.notice).not.toContain("$");
  });
});
