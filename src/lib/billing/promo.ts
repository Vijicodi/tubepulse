/**
 * Promo codes — the arithmetic and the rules, with no database in sight.
 *
 * Pure module, unit tested, because discount code bugs are expensive in both
 * directions: too little and a customer is overcharged after being promised a
 * price, too much and you are giving the product away to anyone who guesses a
 * word. Neither shows up in a typecheck.
 *
 * ---------------------------------------------------------------------------
 * THE AWKWARD PART, and it is Razorpay's design rather than ours.
 *
 * A discount on a REFILL is easy: refills are Orders, and an order is created
 * for whatever amount we say. We compute the discounted amount server-side and
 * that is the end of it.
 *
 * A discount on the SUBSCRIPTION is not. A Razorpay plan hard-codes its amount,
 * and a subscription bills that plan — there is no "charge ₹399 this once"
 * parameter. The only supported route is a Razorpay **Offer**, created in their
 * dashboard, whose `offer_id` is passed when the subscription is created.
 *
 * So a subscription promo needs TWO things that must agree: a row here, and an
 * offer in the Razorpay dashboard. `razorpayOfferId` is what links them, and a
 * subscription promo without one is rejected loudly rather than silently
 * charging full price after showing a discount. Being told "this code cannot be
 * used yet" is survivable; being charged ₹499 after seeing ₹399 is not.
 * ---------------------------------------------------------------------------
 */

export type PromoKind = "percent" | "flat";
/** What a code may be spent on. Deliberately explicit — see the note above. */
export type PromoScope = "subscription" | "topup" | "both";

export interface PromoCode {
  code: string;
  kind: PromoKind;
  /** Percent (1-100) or paise off, depending on `kind`. */
  value: number;
  scope: PromoScope;
  /** Ceiling on a percentage discount, in paise. Null for no cap. */
  maxDiscountPaise: number | null;
  /** Smallest order this code applies to, in paise. */
  minAmountPaise: number;
  /** Razorpay offer id. REQUIRED for anything touching the subscription. */
  razorpayOfferId: string | null;
  active: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  /** Total uses allowed across all users. Null for unlimited. */
  maxRedemptions: number | null;
  redemptionCount: number;
  /** True if one person may use it more than once. Almost always false. */
  repeatable: boolean;
  description: string | null;
}

export type PromoTarget = "subscription" | "topup";

export interface PromoFailure {
  ok: false;
  /** Written for the person typing the code, not for a log. */
  reason: string;
}

export interface PromoSuccess {
  ok: true;
  code: string;
  discountPaise: number;
  finalPaise: number;
  /** Null for refills; the offer Razorpay must apply for subscriptions. */
  razorpayOfferId: string | null;
  label: string;
}

export type PromoResult = PromoFailure | PromoSuccess;

/**
 * Razorpay will not accept an order below ₹1, so a 100% discount cannot be
 * expressed as a payment. Anything that would go under this is clamped, and
 * a genuinely free grant is a support action rather than a checkout.
 */
export const MIN_CHARGEABLE_PAISE = 100;

/** Codes are matched case- and space-insensitively. Nobody types them exactly. */
export function normaliseCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * The discount itself, in paise.
 *
 * Integer paise throughout — a rounded rupee somewhere in the middle is how a
 * total ends up a paisa off and Razorpay rejects the order.
 */
export function discountFor(promo: PromoCode, amountPaise: number): number {
  const raw =
    promo.kind === "percent"
      ? Math.round((amountPaise * promo.value) / 100)
      : promo.value;

  const capped =
    promo.kind === "percent" && promo.maxDiscountPaise !== null
      ? Math.min(raw, promo.maxDiscountPaise)
      : raw;

  // Never discount more than the thing costs, and never below Razorpay's floor.
  return Math.max(0, Math.min(capped, amountPaise - MIN_CHARGEABLE_PAISE));
}

/**
 * Can this code be used, here, now, by this person?
 *
 * Every rejection returns a sentence the user can act on. "Invalid code" for
 * an expired one sends people to support; "that code expired on 1 September"
 * does not.
 */
export function evaluatePromo({
  promo,
  target,
  amountPaise,
  alreadyRedeemed = false,
  now = new Date(),
}: {
  promo: PromoCode | null;
  target: PromoTarget;
  amountPaise: number;
  alreadyRedeemed?: boolean;
  now?: Date;
}): PromoResult {
  if (!promo) {
    return { ok: false, reason: "That code does not exist." };
  }

  if (!promo.active) {
    return { ok: false, reason: "That code is no longer active." };
  }

  if (promo.startsAt && new Date(promo.startsAt) > now) {
    return { ok: false, reason: "That code is not live yet." };
  }

  if (promo.expiresAt && new Date(promo.expiresAt) <= now) {
    return { ok: false, reason: "That code has expired." };
  }

  if (
    promo.maxRedemptions !== null &&
    promo.redemptionCount >= promo.maxRedemptions
  ) {
    return { ok: false, reason: "That code has been fully claimed." };
  }

  if (alreadyRedeemed && !promo.repeatable) {
    return { ok: false, reason: "You have already used that code." };
  }

  if (promo.scope !== "both" && promo.scope !== target) {
    return {
      ok: false,
      reason:
        promo.scope === "topup"
          ? "That code only applies to refill packs."
          : "That code only applies to the subscription.",
    };
  }

  if (amountPaise < promo.minAmountPaise) {
    return { ok: false, reason: "That code does not apply to this purchase." };
  }

  // The rule from the file header: a subscription discount is impossible
  // without a Razorpay offer behind it, so refuse rather than quietly charge
  // full price after showing a discounted total.
  if (target === "subscription" && !promo.razorpayOfferId) {
    return {
      ok: false,
      reason: "That code is not set up for subscriptions yet.",
    };
  }

  const discountPaise = discountFor(promo, amountPaise);

  if (discountPaise <= 0) {
    return { ok: false, reason: "That code would not change this price." };
  }

  return {
    ok: true,
    code: promo.code,
    discountPaise,
    finalPaise: amountPaise - discountPaise,
    razorpayOfferId: promo.razorpayOfferId,
    label: describe(promo),
  };
}

/** "20% off" / "₹100 off" — what the badge next to the field says. */
export function describe(promo: PromoCode): string {
  return promo.kind === "percent"
    ? `${promo.value}% off`
    : `₹${(promo.value / 100).toLocaleString("en-IN")} off`;
}
