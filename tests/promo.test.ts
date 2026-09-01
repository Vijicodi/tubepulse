import { describe, expect, it } from "vitest";
import {
  CYCLES_COVERED,
  MIN_CHARGEABLE_CENTS,
  describe as describePromo,
  discountFor,
  evaluatePromo,
  normaliseCode,
  offerIdFor,
  percentFor,
  renewalNoticeFor,
  type PromoCode,
} from "@/lib/billing/promo";
import { PLAN_PRICES, type PlanKey } from "@/lib/billing/plans";

/**
 * Promo codes are wrong in two directions, and both cost money.
 *
 * Too small a discount overcharges someone who was shown a price — a refund and
 * an apology. Too large a discount gives the product away to anyone who guesses
 * a word, silently, until somebody reads the ledger. Neither shows up in a
 * typecheck, so the arithmetic and the rules are tested directly.
 */

const NOW = new Date("2026-08-17T12:00:00.000Z");
const YESTERDAY = "2026-08-16T12:00:00.000Z";
const TOMORROW = "2026-08-18T12:00:00.000Z";

function promo(overrides: Partial<PromoCode> = {}): PromoCode {
  return {
    code: "LAUNCH20",
    kind: "percent",
    value: 20,
    scope: "both",
    maxDiscountCents: null,
    minAmountCents: 0,
    razorpayOfferId: "offer_test123",
    tierPercents: null,
    tierOfferIds: null,
    appliesToCycles: "forever" as const,
    renewsAtCents: null,
    active: true,
    startsAt: null,
    expiresAt: null,
    maxRedemptions: null,
    redemptionCount: 0,
    repeatable: false,
    description: null,
    ...overrides,
  };
}

describe("normaliseCode", () => {
  it("upper-cases and strips whitespace, because nobody types exactly", () => {
    expect(normaliseCode(" launch20 ")).toBe("LAUNCH20");
    expect(normaliseCode("Launch 20")).toBe("LAUNCH20");
  });
});

describe("discountFor", () => {
  it("takes a percentage of the amount", () => {
    expect(discountFor(promo({ kind: "percent", value: 20 }), 4_900)).toBe(980);
  });

  it("takes a flat amount in paise", () => {
    expect(discountFor(promo({ kind: "flat", value: 1_000 }), 4_900)).toBe(1_000);
  });

  it("respects a cap on a percentage discount", () => {
    // "50% off" against an annual plan is $245 without a cap. The cap is what
    // stops a code written for a $49 monthly charge from taking a fortune off
    // the $490 annual one.
    const capped = promo({ kind: "percent", value: 50, maxDiscountCents: 2_500 });
    expect(discountFor(capped, PLAN_PRICES.studio.yearly.priceCents)).toBe(2_500);
  });

  it("never discounts more than the thing costs", () => {
    // A flat $500 code against a $149 refill must not produce a negative total.
    const generous = promo({ kind: "flat", value: 50_000 });
    const discount = discountFor(generous, 1_500);
    expect(discount).toBeLessThanOrEqual(1_500);
    expect(1_500 - discount).toBeGreaterThanOrEqual(
      MIN_CHARGEABLE_CENTS,
    );
  });

  it("leaves at least Razorpay's minimum chargeable amount", () => {
    // Razorpay rejects an order below $1, so a 100% code cannot be expressed as
    // a payment at all. Clamping is what keeps the order creatable.
    const free = promo({ kind: "percent", value: 100 });
    expect(discountFor(free, 4_900)).toBe(4_900 - MIN_CHARGEABLE_CENTS);
  });

  it("returns whole paise", () => {
    // A fractional paise makes Razorpay reject the order outright.
    const odd = promo({ kind: "percent", value: 33 });
    expect(Number.isInteger(discountFor(odd, 1_500))).toBe(true);
  });
});

describe("evaluatePromo", () => {
  const amount = PLAN_PRICES.studio.monthly.priceCents;

  it("accepts a good code and prices it", () => {
    const result = evaluatePromo({ promo: promo(), target: "subscription", amountCents: amount, now: NOW });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.discountCents).toBe(980);
      expect(result.finalCents).toBe(amount - 980);
      expect(result.razorpayOfferId).toBe("offer_test123");
    }
  });

  it("rejects a code that does not exist", () => {
    const result = evaluatePromo({ promo: null, target: "topup", amountCents: amount, now: NOW });
    expect(result.ok).toBe(false);
  });

  it("rejects an inactive code", () => {
    const result = evaluatePromo({
      promo: promo({ active: false }),
      target: "subscription",
      amountCents: amount,
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false });
  });

  it("rejects an expired code, and says so", () => {
    // "Invalid code" for an expired one sends people to support. The reason
    // has to be actionable.
    const result = evaluatePromo({
      promo: promo({ expiresAt: YESTERDAY }),
      target: "subscription",
      amountCents: amount,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/expired/i);
  });

  it("rejects a code that has not started yet", () => {
    const result = evaluatePromo({
      promo: promo({ startsAt: TOMORROW }),
      target: "subscription",
      amountCents: amount,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not live yet/i);
  });

  it("rejects a code that is fully claimed", () => {
    const result = evaluatePromo({
      promo: promo({ maxRedemptions: 50, redemptionCount: 50 }),
      target: "subscription",
      amountCents: amount,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/claimed/i);
  });

  it("rejects a second use by the same person", () => {
    const result = evaluatePromo({
      promo: promo(),
      target: "subscription",
      amountCents: amount,
      alreadyRedeemed: true,
      now: NOW,
    });
    expect(result.ok).toBe(false);
  });

  it("allows a second use when the code is repeatable", () => {
    const result = evaluatePromo({
      promo: promo({ repeatable: true }),
      target: "subscription",
      amountCents: amount,
      alreadyRedeemed: true,
      now: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it("enforces scope in both directions", () => {
    const topupOnly = promo({ scope: "topup" });
    expect(
      evaluatePromo({ promo: topupOnly, target: "subscription", amountCents: amount, now: NOW }).ok,
    ).toBe(false);
    expect(
      evaluatePromo({
        promo: topupOnly,
        target: "topup",
        amountCents: 1_500,
        now: NOW,
      }).ok,
    ).toBe(true);
  });

  it("REFUSES a subscription code with no Razorpay offer behind it", () => {
    // The most important case in this file. A Razorpay plan is fixed-amount, so
    // a subscription discount without an offer would show a reduced price and
    // then charge full. Being told the code cannot be used is survivable;
    // being charged $499 after seeing $399 is not.
    const result = evaluatePromo({
      promo: promo({ razorpayOfferId: null }),
      target: "subscription",
      amountCents: amount,
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not set up for subscriptions/i);
  });

  it("still allows that same code on a refill", () => {
    // Refills are Orders and are created for whatever amount we say, so they
    // need no offer at all.
    const result = evaluatePromo({
      promo: promo({ razorpayOfferId: null, scope: "topup" }),
      target: "topup",
      amountCents: 4_500,
      now: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it("enforces a minimum spend", () => {
    const result = evaluatePromo({
      promo: promo({ minAmountCents: 100_000 }),
      target: "topup",
      amountCents: 1_500,
      now: NOW,
    });
    expect(result.ok).toBe(false);
  });

  it("never produces a negative or zero charge", () => {
    const result = evaluatePromo({
      promo: promo({ kind: "flat", value: 1_000_000 }),
      target: "topup",
      amountCents: 1_500,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.finalCents).toBeGreaterThanOrEqual(MIN_CHARGEABLE_CENTS);
  });
});

describe("describe", () => {
  it("labels both kinds for the badge", () => {
    expect(describePromo(promo({ kind: "percent", value: 20 }))).toBe("20% off");
    expect(describePromo(promo({ kind: "flat", value: 1_000 }))).toBe("$10 off");
  });
});

describe("the first-year promo, and the trap underneath it", () => {
  // A Razorpay Offer attached to a subscription discounts EVERY billing cycle
  // unless the offer itself was created with a cycle limit. So the obvious way
  // to build "30% off your first year" quietly produces "30% off forever", and
  // nobody notices until the second renewal. These are the guards.

  const yearly = PLAN_PRICES.studio.yearly.priceCents;

  function launchCode(over: Partial<PromoCode> = {}): PromoCode {
    return promo({
      code: "LAUNCH30",
      value: 30,
      scope: "subscription_yearly",
      appliesToCycles: "first_cycle_only",
      renewsAtCents: yearly,
      ...over,
    });
  }

  it("takes 30% off an annual plan", () => {
    const result = evaluatePromo({
      promo: launchCode(),
      target: "subscription",
      cycle: "yearly",
      amountCents: yearly,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.discountCents).toBe(Math.round(yearly * 0.3));
    }
  });

  it("discloses the renewal price even when the code row does not carry one", () => {
    // The guard that matters is "never show an undisclosed renewal price", and
    // it is now satisfied by CONSTRUCTION rather than by refusing: the renewal
    // price is the undiscounted price of the tier being bought, which the
    // caller always knows. The code row's own column is no longer consulted
    // for a subscription — it could only ever hold one number, and a tiered
    // code has three.
    const result = evaluatePromo({
      promo: launchCode({ renewsAtCents: null }),
      target: "subscription",
      cycle: "yearly",
      amountCents: yearly,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.renewsAtCents).toBe(yearly);
      expect(result.renewalNotice).not.toBeNull();
    }
  });

  it("always carries the renewal disclosure when the discount is temporary", () => {
    const result = evaluatePromo({
      promo: launchCode(),
      target: "subscription",
      cycle: "yearly",
      amountCents: yearly,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // The UI renders this verbatim. It must name the real renewal price.
      expect(result.renewalNotice).toContain("Renews at");
      expect(result.renewalNotice).toContain("490");
    }
  });

  it("carries NO disclosure when the price genuinely never changes", () => {
    const result = evaluatePromo({
      promo: launchCode({ appliesToCycles: "forever", renewsAtCents: null }),
      target: "subscription",
      cycle: "yearly",
      amountCents: yearly,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.renewalNotice).toBeNull();
  });

  it("refuses an annual-only code on a monthly plan", () => {
    // An annual incentive that also fires on monthly discounts the cheapest
    // commitment we sell, which is the opposite of what it is for.
    const result = evaluatePromo({
      promo: launchCode(),
      target: "subscription",
      cycle: "monthly",
      amountCents: PLAN_PRICES.studio.monthly.priceCents,
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/annual/i);
  });

  it("still honours the window and the redemption cap", () => {
    // A launch offer that outlives its launch is just the price.
    const expired = evaluatePromo({
      promo: launchCode({ expiresAt: YESTERDAY }),
      target: "subscription",
      cycle: "yearly",
      amountCents: yearly,
      now: NOW,
    });
    expect(expired.ok).toBe(false);

    const claimed = evaluatePromo({
      promo: launchCode({ maxRedemptions: 100, redemptionCount: 100 }),
      target: "subscription",
      cycle: "yearly",
      amountCents: yearly,
      now: NOW,
    });
    expect(claimed.ok).toBe(false);
  });

  it("still refuses a subscription code with no Razorpay offer behind it", () => {
    // Unchanged rule, restated because the new fields must not have created a
    // path around it: showing a discount and charging full price is the worst
    // outcome available.
    const result = evaluatePromo({
      promo: launchCode({ razorpayOfferId: null }),
      target: "subscription",
      cycle: "yearly",
      amountCents: yearly,
      now: NOW,
    });

    expect(result.ok).toBe(false);
  });
});


/**
 * THE TIERED LAUNCH CODE — one code, a different percentage per tier.
 *
 * Creator 30%, Studio 40%, Max 50%, off the first two monthly cycles. This is
 * the most dangerous promo shape in the product: one wrong lookup and either a
 * customer is overcharged after seeing a price, or the deepest discount is
 * handed to the cheapest tier. Every branch is pinned here.
 */
function tiered(overrides: Partial<PromoCode> = {}): PromoCode {
  return promo({
    code: "LAUNCH",
    kind: "percent",
    value: 30,
    scope: "subscription_monthly",
    tierPercents: { creator: 30, studio: 40, agency: 50 },
    tierOfferIds: {
      creator: "offer_creator",
      studio: "offer_studio",
      agency: "offer_agency",
    },
    appliesToCycles: "first_two_cycles",
    renewsAtCents: 4_900,
    razorpayOfferId: null,
    ...overrides,
  });
}

describe("the tiered launch code", () => {
  it("gives each tier its own percentage from one code", () => {
    const p = tiered();
    expect(percentFor(p, "creator")).toBe(30);
    expect(percentFor(p, "studio")).toBe(40);
    expect(percentFor(p, "agency")).toBe(50);
  });

  it("discounts each tier's real monthly price correctly", () => {
    const p = tiered();
    // Creator $19 -> 30% -> $5.70 off
    expect(discountFor(p, 1_900, "creator")).toBe(570);
    // Studio $49 -> 40% -> $19.60 off
    expect(discountFor(p, 4_900, "studio")).toBe(1_960);
    // Max $89 -> 50% -> $44.50 off
    expect(discountFor(p, 8_900, "agency")).toBe(4_450);
  });

  it("picks the Razorpay offer that matches the tier being bought", () => {
    const p = tiered();
    expect(offerIdFor(p, "creator")).toBe("offer_creator");
    expect(offerIdFor(p, "studio")).toBe("offer_studio");
    expect(offerIdFor(p, "agency")).toBe("offer_agency");
  });

  it("REFUSES a tier whose offer is missing rather than using another one", () => {
    // The expensive bug: falling back to a generic offer would attach the
    // wrong discount, and the customer is charged a price nobody quoted.
    const p = tiered({
      tierOfferIds: { creator: "offer_creator", studio: "offer_studio" },
      razorpayOfferId: "offer_generic",
    });
    expect(offerIdFor(p, "agency")).toBeNull();

    const result = evaluatePromo({
      promo: p,
      target: "subscription",
      cycle: "monthly",
      planKey: "agency",
      amountCents: 8_900,
      now: NOW,
    });
    expect(result.ok).toBe(false);
  });

  it("falls back to `value` for a tier the code does not name", () => {
    const p = tiered({ tierPercents: { studio: 40 } });
    expect(percentFor(p, "creator")).toBe(30); // the code's own `value`
    expect(percentFor(p, "studio")).toBe(40);
  });

  it("never fires on an annual plan, where two cycles would be two YEARS", () => {
    const result = evaluatePromo({
      promo: tiered(),
      target: "subscription",
      cycle: "yearly",
      planKey: "studio",
      amountCents: 34_300,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("monthly");
  });

  it("succeeds end to end on a monthly Studio checkout", () => {
    const result = evaluatePromo({
      promo: tiered(),
      target: "subscription",
      cycle: "monthly",
      planKey: "studio",
      amountCents: 4_900,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.discountCents).toBe(1_960);
      expect(result.finalCents).toBe(2_940);
      expect(result.razorpayOfferId).toBe("offer_studio");
      expect(result.label).toBe("40% off");
      expect(result.cyclesCovered).toBe(2);
      expect(result.renewsAtCents).toBe(4_900);
    }
  });

  it("labels the badge with the tier's own rate, not the code's default", () => {
    expect(describePromo(tiered(), "agency")).toBe("50% off");
    expect(describePromo(tiered(), "creator")).toBe("30% off");
  });

  it("discloses the third-month price in months, never in years", () => {
    const notice = renewalNoticeFor(tiered(), "subscription");
    expect(notice).toContain("two months");
    expect(notice).toContain("third month");
    expect(notice).toContain("$49");
    expect(notice).not.toContain("year");
  });

  it("quotes EACH TIER its own renewal price, not one shared number", () => {
    // The bug this pins was found by driving the real endpoint, not by a unit
    // test: `renews_at_cents` is a single column, so every tier was quoted the
    // same figure. Creator was told it renews at $49 when it renews at $19,
    // and Max was told $49 when it renews at $89 — a wrong price shown at the
    // card step, which is the exact failure this module exists to prevent.
    const cases: [PlanKey, number, string][] = [
      ["creator", 1_900, "$19"],
      ["studio", 4_900, "$49"],
      ["agency", 8_900, "$89"],
    ];

    for (const [planKey, listCents, shown] of cases) {
      const result = evaluatePromo({
        promo: tiered({ renewsAtCents: null }),
        target: "subscription",
        cycle: "monthly",
        planKey,
        amountCents: listCents,
        now: NOW,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.renewsAtCents).toBe(listCents);
        expect(result.renewalNotice).toContain(shown);
      }
    }
  });

  it("knows how many cycles each duration covers", () => {
    expect(CYCLES_COVERED.first_cycle_only).toBe(1);
    expect(CYCLES_COVERED.first_two_cycles).toBe(2);
    expect(CYCLES_COVERED.forever).toBeNull();
  });

  it("still honours the redemption cap and the window", () => {
    const claimed = evaluatePromo({
      promo: tiered({ maxRedemptions: 25, redemptionCount: 25 }),
      target: "subscription",
      cycle: "monthly",
      planKey: "studio",
      amountCents: 4_900,
      now: NOW,
    });
    expect(claimed.ok).toBe(false);

    const notLive = evaluatePromo({
      promo: tiered({ startsAt: TOMORROW }),
      target: "subscription",
      cycle: "monthly",
      planKey: "studio",
      amountCents: 4_900,
      now: NOW,
    });
    expect(notLive.ok).toBe(false);

    const expired = evaluatePromo({
      promo: tiered({ expiresAt: YESTERDAY }),
      target: "subscription",
      cycle: "monthly",
      planKey: "studio",
      amountCents: 4_900,
      now: NOW,
    });
    expect(expired.ok).toBe(false);
  });

  it("keeps the deepest discount on the most expensive tier", () => {
    // A sanity check on the whole point of the ladder: the absolute saving
    // must rise with the tier, or the code argues against upgrading.
    const p = tiered();
    const creator = discountFor(p, 1_900, "creator");
    const studio = discountFor(p, 4_900, "studio");
    const max = discountFor(p, 8_900, "agency");
    expect(studio).toBeGreaterThan(creator);
    expect(max).toBeGreaterThan(studio);
  });
});
