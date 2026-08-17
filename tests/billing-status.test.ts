import { describe, expect, it } from "vitest";
import { billingStateFrom, hasProAccess } from "@/lib/billing/status";
import {
  PLANS,
  PRO_PRICES,
  PRO_TOTAL_CYCLES,
  TOPUP_LIST,
  formatRupees,
  perMonthRupees,
  perScrapeRupees,
  scrapesPerCycle,
  toBillingCycle,
  toTopupKey,
  yearlySavingPercent,
} from "@/lib/billing/plans";
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
    plan_key: "pro",
    razorpay_subscription_id: "sub_test123",
    razorpay_customer_id: "cust_test123",
    razorpay_plan_id: "plan_test123",
    status: "active",
    billing_cycle: "monthly",
    current_period_end: NEXT_MONTH,
    cancel_at_period_end: false,
    cancelled_at: null,
    created_at: LAST_MONTH,
    updated_at: LAST_MONTH,
    ...overrides,
  };
}

describe("hasProAccess", () => {
  it("grants access while active", () => {
    expect(hasProAccess(row({ status: "active" }), NOW)).toBe(true);
  });

  it("grants access once the mandate is authenticated but not yet charged", () => {
    // Razorpay sits in 'authenticated' between mandate approval and the first
    // debit. Locking someone out during that window means paying and then
    // being told you have not.
    expect(hasProAccess(row({ status: "authenticated" }), NOW)).toBe(true);
  });

  it("keeps access after cancelling, until the paid period ends", () => {
    expect(
      hasProAccess(row({ status: "cancelled", current_period_end: NEXT_MONTH }), NOW),
    ).toBe(true);
  });

  it("removes access once the cancelled period has lapsed", () => {
    expect(
      hasProAccess(row({ status: "cancelled", current_period_end: LAST_MONTH }), NOW),
    ).toBe(false);
  });

  it("denies access on 'created' — the mandate was never authorised", () => {
    // This is the one that matters. A subscription row exists the moment
    // checkout starts, so treating its mere presence as Pro would hand the
    // paid tier to anyone who opened the popup and closed it.
    expect(
      hasProAccess(row({ status: "created", current_period_end: NEXT_MONTH }), NOW),
    ).toBe(false);
  });

  it("denies access on 'halted' even inside a paid period", () => {
    // Halted means the retries were exhausted; the money did not arrive.
    expect(
      hasProAccess(row({ status: "halted", current_period_end: NEXT_MONTH }), NOW),
    ).toBe(false);
  });

  it("denies access on 'expired'", () => {
    expect(
      hasProAccess(row({ status: "expired", current_period_end: NEXT_MONTH }), NOW),
    ).toBe(false);
  });

  it("denies access when a grace status has no period end to lean on", () => {
    expect(
      hasProAccess(row({ status: "cancelled", current_period_end: null }), NOW),
    ).toBe(false);
  });
});

describe("billingStateFrom", () => {
  it("treats a missing row as the free plan", () => {
    const state = billingStateFrom(null, NOW);
    expect(state.isPro).toBe(false);
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
    expect(state.isPro).toBe(true);
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
    expect(hasProAccess(row({ status: toSubscriptionStatus("nonsense") }), NOW)).toBe(
      false,
    );
  });
});

/** Margin after Razorpay's 2% + 18% GST, assuming every scrape is used. */
function marginOf(
  item: { priceRupees: number; scrapes: number },
  costPerScrape = 12,
): number {
  const gatewayFee = item.priceRupees * 0.02 * 1.18;
  const profit = item.priceRupees - gatewayFee - item.scrapes * costPerScrape;
  return profit / item.priceRupees;
}

describe("the plan catalogue", () => {
  it("keeps paise and rupees in step", () => {
    // The pricing page shows rupees; Razorpay charges paise. A mismatch here
    // bills a different number from the one advertised.
    expect(PLANS.pro.pricePaise).toBe(PLANS.pro.priceRupees * 100);
    expect(PLANS.free.pricePaise).toBe(0);
  });

  it("stays profitable at the worst-case cost per scrape", () => {
    // ₹12 a scrape is gpt-4o plus Apify plus Firecrawl — the expensive model.
    // Razorpay takes 2% plus 18% GST on that fee. If this ever fails, the
    // subscription is losing money and the price must move before shipping.
    //
    // 20 scrapes at ₹499 leaves 49%. That is the floor this test defends:
    // every extra scrape costs ₹12 and earns nothing, so raising the allowance
    // without raising the price walks straight into a loss.
    expect(marginOf(PLANS.pro)).toBeGreaterThan(0.45);
  });

  it("keeps a cushion even if the model cost doubles", () => {
    // The point of pricing against gpt-4o rather than a mini tier: a model
    // swap should never be a pricing emergency.
    expect(marginOf(PLANS.pro, 18)).toBeGreaterThan(0.2);
  });

  it("keeps the daily cap below scrapes/3, so the month cannot be drained fast", () => {
    // This is the invariant, not just "cap < month". A cap of 7 against 20 was
    // tried and reverted: three enthusiastic days exceeded the allowance, which
    // made the cap a burst limit rather than a guard against a surprise API
    // bill. Below scrapes/3 the month always takes at least four days to spend.
    expect(PLANS.pro.dailyCap * 3).toBeLessThan(PLANS.pro.scrapes);
    expect(PLANS.free.dailyCap).toBeLessThan(PLANS.free.scrapes);
  });

  it("keeps the free tier's give-away cost modest", () => {
    // Every free scrape is spend on someone who may never pay. At 50 videos a
    // scrape costs roughly ₹7, so this is the acquisition budget per signup.
    const FREE_SCRAPE_COST = 7;
    expect(PLANS.free.scrapes * FREE_SCRAPE_COST).toBeLessThanOrEqual(40);
  });

  it("gives Pro more depth per scrape than free", () => {
    expect(PLANS.pro.videosPerScrape).toBeGreaterThan(PLANS.free.videosPerScrape);
  });

  it("requests a finite but effectively endless billing cycle count", () => {
    // Razorpay has no "until cancelled"; total_count is mandatory.
    expect(PRO_TOTAL_CYCLES.monthly).toBeGreaterThanOrEqual(60);
    expect(PRO_TOTAL_CYCLES.monthly).toBeLessThanOrEqual(100);
    // Yearly needs far fewer cycles to cover the same span.
    expect(PRO_TOTAL_CYCLES.yearly).toBeGreaterThanOrEqual(5);
  });

  it("formats rupees the Indian way", () => {
    expect(formatRupees(499)).toBe("₹499");
    expect(formatRupees(0)).toBe("₹0");
  });
});

describe("refill packs", () => {
  it("keeps paise and rupees in step", () => {
    for (const pack of TOPUP_LIST) {
      expect(pack.pricePaise).toBe(pack.priceRupees * 100);
    }
  });

  it("costs MORE per scrape than the subscription", () => {
    // The whole argument of the pricing page. A refill that undercuts the plan
    // teaches people to cancel the plan, so this is a business rule, not a
    // preference — and it is the one most likely to be broken by someone
    // "rounding the prices nicely" later.
    const proRate = perScrapeRupees(PLANS.pro);

    for (const pack of TOPUP_LIST) {
      expect(perScrapeRupees(pack)).toBeGreaterThan(proRate);
    }
  });

  it("does not make the bigger pack a worse deal than the smaller one", () => {
    // Premium over the plan is intended; punishing someone for buying more is
    // not. The two packs should land at roughly the same rate.
    const [small, large] = TOPUP_LIST;
    expect(perScrapeRupees(large)).toBeLessThanOrEqual(perScrapeRupees(small) * 1.05);
  });

  it("is profitable at the worst-case cost per scrape", () => {
    for (const pack of TOPUP_LIST) {
      expect(marginOf(pack)).toBeGreaterThan(0.45);
    }
  });

  it("narrows an untrusted pack key", () => {
    // The topup route takes this string straight from a request body. If it
    // ever let something through, the catalogue lookup would be undefined and
    // the price would come from nowhere.
    expect(toTopupKey("topup_small")).toBe("topup_small");
    expect(toTopupKey("topup_large")).toBe("topup_large");
    expect(toTopupKey("pro")).toBeNull();
    expect(toTopupKey("")).toBeNull();
    expect(toTopupKey("__proto__")).toBeNull();
  });
});

describe("annual billing", () => {
  it("keeps paise and rupees in step on both cycles", () => {
    for (const price of Object.values(PRO_PRICES)) {
      expect(price.pricePaise).toBe(price.priceRupees * 100);
    }
  });

  it("is genuinely cheaper per month than paying monthly", () => {
    // The entire claim the toggle makes. If this inverts, the page is lying.
    expect(perMonthRupees(PRO_PRICES.yearly)).toBeLessThan(
      perMonthRupees(PRO_PRICES.monthly),
    );
  });

  it("is two months free, and says so honestly", () => {
    expect(PRO_PRICES.yearly.priceRupees).toBe(PRO_PRICES.monthly.priceRupees * 10);
    expect(yearlySavingPercent()).toBe(17);
  });

  it("stays profitable across a whole prepaid year", () => {
    // The discount comes straight out of the margin — costs do not fall when
    // someone prepays. 240 scrapes at ₹12 against ₹4,990 leaves about 40%,
    // which is the floor being defended here. Deepening the annual discount
    // walks into the thirties, so this test is the tripwire.
    const scrapes = scrapesPerCycle(PRO_PRICES.yearly);
    expect(scrapes).toBe(240);
    expect(marginOf({ priceRupees: PRO_PRICES.yearly.priceRupees, scrapes })).toBeGreaterThan(
      0.35,
    );
  });

  it("earns more per subscriber-year than monthly does, despite the discount", () => {
    // Sanity check on the trade: a year of annual should still beat nothing,
    // and the gap to twelve monthly charges should be exactly the discount.
    const monthlyYear = PRO_PRICES.monthly.priceRupees * 12;
    expect(monthlyYear - PRO_PRICES.yearly.priceRupees).toBe(998);
  });

  it("narrows an untrusted cycle string", () => {
    // The checkout route takes this straight from a request body.
    expect(toBillingCycle("monthly")).toBe("monthly");
    expect(toBillingCycle("yearly")).toBe("yearly");
    expect(toBillingCycle("weekly")).toBeNull();
    expect(toBillingCycle("")).toBeNull();
  });
});
