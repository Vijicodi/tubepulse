import { describe, expect, it } from "vitest";
import {
  MIN_CHARGEABLE_PAISE,
  describe as describePromo,
  discountFor,
  evaluatePromo,
  normaliseCode,
  type PromoCode,
} from "@/lib/billing/promo";
import { PRO_PRICES, TOPUPS } from "@/lib/billing/plans";

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
    maxDiscountPaise: null,
    minAmountPaise: 0,
    razorpayOfferId: "offer_test123",
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
    expect(discountFor(promo({ kind: "percent", value: 20 }), 49_900)).toBe(9_980);
  });

  it("takes a flat amount in paise", () => {
    expect(discountFor(promo({ kind: "flat", value: 10_000 }), 49_900)).toBe(10_000);
  });

  it("respects a cap on a percentage discount", () => {
    // "50% off" against an annual plan is ₹2,495 without a cap. The cap is what
    // stops a code written for a ₹499 charge from taking a fortune off ₹4,990.
    const capped = promo({ kind: "percent", value: 50, maxDiscountPaise: 50_000 });
    expect(discountFor(capped, PRO_PRICES.yearly.pricePaise)).toBe(50_000);
  });

  it("never discounts more than the thing costs", () => {
    // A flat ₹500 code against a ₹149 refill must not produce a negative total.
    const generous = promo({ kind: "flat", value: 50_000 });
    const discount = discountFor(generous, TOPUPS.topup_small.pricePaise);
    expect(discount).toBeLessThanOrEqual(TOPUPS.topup_small.pricePaise);
    expect(TOPUPS.topup_small.pricePaise - discount).toBeGreaterThanOrEqual(
      MIN_CHARGEABLE_PAISE,
    );
  });

  it("leaves at least Razorpay's minimum chargeable amount", () => {
    // Razorpay rejects an order below ₹1, so a 100% code cannot be expressed as
    // a payment at all. Clamping is what keeps the order creatable.
    const free = promo({ kind: "percent", value: 100 });
    expect(discountFor(free, 49_900)).toBe(49_900 - MIN_CHARGEABLE_PAISE);
  });

  it("returns whole paise", () => {
    // A fractional paise makes Razorpay reject the order outright.
    const odd = promo({ kind: "percent", value: 33 });
    expect(Number.isInteger(discountFor(odd, 14_900))).toBe(true);
  });
});

describe("evaluatePromo", () => {
  const amount = PRO_PRICES.monthly.pricePaise;

  it("accepts a good code and prices it", () => {
    const result = evaluatePromo({ promo: promo(), target: "subscription", amountPaise: amount, now: NOW });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.discountPaise).toBe(9_980);
      expect(result.finalPaise).toBe(amount - 9_980);
      expect(result.razorpayOfferId).toBe("offer_test123");
    }
  });

  it("rejects a code that does not exist", () => {
    const result = evaluatePromo({ promo: null, target: "topup", amountPaise: amount, now: NOW });
    expect(result.ok).toBe(false);
  });

  it("rejects an inactive code", () => {
    const result = evaluatePromo({
      promo: promo({ active: false }),
      target: "subscription",
      amountPaise: amount,
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
      amountPaise: amount,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/expired/i);
  });

  it("rejects a code that has not started yet", () => {
    const result = evaluatePromo({
      promo: promo({ startsAt: TOMORROW }),
      target: "subscription",
      amountPaise: amount,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not live yet/i);
  });

  it("rejects a code that is fully claimed", () => {
    const result = evaluatePromo({
      promo: promo({ maxRedemptions: 50, redemptionCount: 50 }),
      target: "subscription",
      amountPaise: amount,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/claimed/i);
  });

  it("rejects a second use by the same person", () => {
    const result = evaluatePromo({
      promo: promo(),
      target: "subscription",
      amountPaise: amount,
      alreadyRedeemed: true,
      now: NOW,
    });
    expect(result.ok).toBe(false);
  });

  it("allows a second use when the code is repeatable", () => {
    const result = evaluatePromo({
      promo: promo({ repeatable: true }),
      target: "subscription",
      amountPaise: amount,
      alreadyRedeemed: true,
      now: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it("enforces scope in both directions", () => {
    const topupOnly = promo({ scope: "topup" });
    expect(
      evaluatePromo({ promo: topupOnly, target: "subscription", amountPaise: amount, now: NOW }).ok,
    ).toBe(false);
    expect(
      evaluatePromo({
        promo: topupOnly,
        target: "topup",
        amountPaise: TOPUPS.topup_small.pricePaise,
        now: NOW,
      }).ok,
    ).toBe(true);
  });

  it("REFUSES a subscription code with no Razorpay offer behind it", () => {
    // The most important case in this file. A Razorpay plan is fixed-amount, so
    // a subscription discount without an offer would show a reduced price and
    // then charge full. Being told the code cannot be used is survivable;
    // being charged ₹499 after seeing ₹399 is not.
    const result = evaluatePromo({
      promo: promo({ razorpayOfferId: null }),
      target: "subscription",
      amountPaise: amount,
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
      amountPaise: TOPUPS.topup_large.pricePaise,
      now: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it("enforces a minimum spend", () => {
    const result = evaluatePromo({
      promo: promo({ minAmountPaise: 100_000 }),
      target: "topup",
      amountPaise: TOPUPS.topup_small.pricePaise,
      now: NOW,
    });
    expect(result.ok).toBe(false);
  });

  it("never produces a negative or zero charge", () => {
    const result = evaluatePromo({
      promo: promo({ kind: "flat", value: 10_000_000 }),
      target: "topup",
      amountPaise: TOPUPS.topup_small.pricePaise,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.finalPaise).toBeGreaterThanOrEqual(MIN_CHARGEABLE_PAISE);
  });
});

describe("describe", () => {
  it("labels both kinds for the badge", () => {
    expect(describePromo(promo({ kind: "percent", value: 20 }))).toBe("20% off");
    expect(describePromo(promo({ kind: "flat", value: 10_000 }))).toBe("₹100 off");
  });
});
