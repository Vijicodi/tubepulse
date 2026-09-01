import type { BillingCycle, PlanKey } from "@/lib/billing/plans";

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
 * A Razorpay plan hard-codes its amount, and a subscription bills that plan —
 * there is no "charge $105 this once" parameter. The only supported route is a
 * Razorpay **Offer**, created in their dashboard, whose `offer_id` is passed
 * when the subscription is created.
 *
 * So a subscription promo needs TWO things that must agree: a row here, and an
 * offer in the Razorpay dashboard. `razorpayOfferId` is what links them, and a
 * subscription promo without one is rejected loudly rather than silently
 * charging full price after showing a discount. Being told "this code cannot be
 * used yet" is survivable; being charged $150 after seeing $105 is not.
 * ---------------------------------------------------------------------------
 * THE FIRST-YEAR TRAP. Read this before creating any launch code.
 *
 * A Razorpay Offer attached to a subscription applies to EVERY billing cycle of
 * that subscription unless the offer itself is created with a cycle limit. The
 * dashboard does not warn you. So the obvious way to build "30% off your first
 * year" produces "30% off every year, forever" — and nobody notices until the
 * second renewal, by which time the discount is a contractual expectation.
 *
 * `appliesToCycles` records what the offer was actually configured with. It is
 * NOT a thing this code enforces — it cannot, the enforcement lives at Razorpay
 * — it is a written-down claim about the offer, so that:
 *
 *   1. The checkout page can honestly say "renews at $150/yr after the first
 *      year" rather than staying quiet about it.
 *   2. A code whose author never thought about renewals is rejected instead of
 *      quietly becoming a lifetime discount.
 *
 * A `firstCycleOnly` code REQUIRES a `renewsAtPaise` so the disclosure has a
 * number to show. That pairing is the whole safety mechanism.
 * ---------------------------------------------------------------------------
 */

export type PromoKind = "percent" | "flat";

/**
 * What a code may be spent on.
 *
 * `subscription_yearly` exists because the launch promo is annual-only: a 30%
 * code that also fired on monthly plans would discount the cheapest commitment
 * we sell, which is the opposite of what an annual incentive is for.
 */
export type PromoScope =
  | "subscription"
  | "subscription_yearly"
  | "subscription_monthly"
  | "topup"
  | "both";

/** How many billing cycles the linked Razorpay offer discounts. */
export type PromoDuration =
  | "first_cycle_only"
  | "first_two_cycles"
  | "forever";

/**
 * How many cycles each duration actually covers. Used for the disclosure and
 * the countdown, so both read from one place rather than each guessing.
 */
export const CYCLES_COVERED: Record<PromoDuration, number | null> = {
  first_cycle_only: 1,
  first_two_cycles: 2,
  forever: null,
};

export interface PromoCode {
  code: string;
  kind: PromoKind;
  /** Percent (1-100) or cents off, depending on `kind`. */
  value: number;
  scope: PromoScope;
  /** Ceiling on a percentage discount, in cents. Null for no cap. */
  maxDiscountCents: number | null;
  /** Smallest order this code applies to, in cents. */
  minAmountCents: number;
  /** Razorpay offer id. REQUIRED for anything touching the subscription. */
  razorpayOfferId: string | null;
  /**
   * Percent off per plan key, when one code discounts tiers differently.
   * Overrides `value` for a tier that appears here. Null for flat-rate codes.
   */
  tierPercents: Record<string, number> | null;
  /**
   * Razorpay offer id per plan key, paired with `tierPercents`.
   *
   * Three percentages cannot be one offer — an Offer carries a fixed discount
   * — so a tiered code needs one per tier, and each MUST be created with a
   * two-cycle limit or it discounts every renewal forever.
   */
  tierOfferIds: Record<string, string> | null;
  /**
   * What the linked offer was configured to do. See THE FIRST-YEAR TRAP above.
   * This is a record of Razorpay's configuration, not an enforcement of it.
   */
  appliesToCycles: PromoDuration;
  /**
   * What the customer pays once the discount stops, in cents. Required when
   * `appliesToCycles` is "first_cycle_only" — it is what the disclosure shows.
   */
  renewsAtCents: number | null;
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
  discountCents: number;
  finalCents: number;
  /** Null for one-off orders; the offer Razorpay must apply for subscriptions. */
  razorpayOfferId: string | null;
  label: string;
  /**
   * The sentence the checkout MUST show when this discount does not last.
   * Null when the price never changes. Never suppress this to tidy a layout —
   * an undisclosed renewal price is how a promo becomes a chargeback.
   */
  renewalNotice: string | null;
  /**
   * How many billing cycles the discount covers. Null means forever.
   * The checkout countdown reads this rather than re-deriving it.
   */
  cyclesCovered: number | null;
  /** What the customer pays once the discount stops, in cents. */
  renewsAtCents: number | null;
}

export type PromoResult = PromoFailure | PromoSuccess;

/**
 * Razorpay will not accept an order below the smallest chargeable unit, so a
 * 100% discount cannot be expressed as a payment. Anything that would go under
 * this is clamped, and a genuinely free grant is a support action rather than a
 * checkout.
 */
export const MIN_CHARGEABLE_CENTS = 50;

/** Codes are matched case- and space-insensitively. Nobody types them exactly. */
export function normaliseCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * The discount itself, in cents.
 *
 * Integer cents throughout — a rounded dollar somewhere in the middle is how a
 * total ends up a cent off and Razorpay rejects the order.
 */
export function discountFor(
  promo: PromoCode,
  amountCents: number,
  planKey?: PlanKey,
): number {
  const percent = percentFor(promo, planKey);

  const raw =
    promo.kind === "percent"
      ? Math.round((amountCents * percent) / 100)
      : promo.value;

  const capped =
    promo.kind === "percent" && promo.maxDiscountCents !== null
      ? Math.min(raw, promo.maxDiscountCents)
      : raw;

  // Never discount more than the thing costs, and never below Razorpay's floor.
  return Math.max(0, Math.min(capped, amountCents - MIN_CHARGEABLE_CENTS));
}

/**
 * The percentage this code gives on this tier.
 *
 * A tiered code discounts Creator, Studio and Max differently from one code, so
 * the rate cannot be read from `value` alone. `value` remains the fallback —
 * for flat-rate codes, and for any tier a tiered code does not name.
 */
export function percentFor(promo: PromoCode, planKey?: PlanKey): number {
  if (promo.kind !== "percent") return promo.value;
  if (!planKey || !promo.tierPercents) return promo.value;
  return promo.tierPercents[planKey] ?? promo.value;
}

/**
 * The Razorpay offer to attach for this tier.
 *
 * Falls back to the single `razorpayOfferId` for codes that are not tiered.
 * Returns null when a tiered code has no offer for the tier being bought,
 * which `evaluatePromo` treats as "not set up yet" rather than proceeding —
 * showing a discount and then charging full price is the failure this avoids.
 */
export function offerIdFor(promo: PromoCode, planKey?: PlanKey): string | null {
  if (planKey && promo.tierOfferIds) {
    const perTier = promo.tierOfferIds[planKey];
    if (perTier) return perTier;
    // A tiered code that names a percent for this tier but no offer is
    // misconfigured. Do NOT fall back to the generic id — it carries the
    // wrong discount.
    if (promo.tierPercents && promo.tierPercents[planKey] !== undefined) {
      return null;
    }
  }
  return promo.razorpayOfferId;
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
  cycle,
  planKey,
  amountCents,
  alreadyRedeemed = false,
  now = new Date(),
}: {
  promo: PromoCode | null;
  target: PromoTarget;
  /** Which cycle is being bought. Required for subscriptions, ignored otherwise. */
  cycle?: BillingCycle;
  /** Which tier is being bought. Drives the per-tier rate on a tiered code. */
  planKey?: PlanKey;
  amountCents: number;
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

  const scopeFailure = checkScope(promo, target, cycle);
  if (scopeFailure) return scopeFailure;

  if (amountCents < promo.minAmountCents) {
    return { ok: false, reason: "That code does not apply to this purchase." };
  }

  // The rule from the file header: a subscription discount is impossible
  // without a Razorpay offer behind it, so refuse rather than quietly charge
  // full price after showing a discounted total.
  const offerId = offerIdFor(promo, planKey);

  if (target === "subscription" && !offerId) {
    return {
      ok: false,
      reason: "That code is not set up for subscriptions yet.",
    };
  }

  /**
   * What this purchase renews at once the discount stops.
   *
   * For a subscription that is `amountCents` — the UNDISCOUNTED price of the
   * exact tier and cycle being bought, which the caller derived from the plan
   * catalogue. That is always right, per tier, with nothing to keep in sync.
   *
   * `promo.renewsAtCents` remains the fallback for a non-subscription target,
   * where there is no plan price to read.
   */
  const renewsAt =
    target === "subscription" ? amountCents : promo.renewsAtCents;

  // THE FIRST-YEAR TRAP, enforced. A code whose discount ends but which cannot
  // say what comes next would put an undisclosed renewal price in front of a
  // customer. Refuse rather than ship that.
  if (
    target === "subscription" &&
    promo.appliesToCycles !== "forever" &&
    renewsAt === null
  ) {
    return {
      ok: false,
      reason: "That code is not fully configured yet.",
    };
  }

  const discountCents = discountFor(promo, amountCents, planKey);

  if (discountCents <= 0) {
    return { ok: false, reason: "That code would not change this price." };
  }

  return {
    ok: true,
    code: promo.code,
    discountCents,
    finalCents: amountCents - discountCents,
    razorpayOfferId: offerId,
    label: describe(promo, planKey),
    renewalNotice: renewalNoticeFor(promo, target, renewsAt),
    cyclesCovered: CYCLES_COVERED[promo.appliesToCycles],
    renewsAtCents: renewsAt,
  };
}

/**
 * Scope and cycle, checked together.
 *
 * Split out because there are now four scopes and two of them care about the
 * billing cycle, which made the inline version hard to read and easy to get
 * subtly wrong.
 */
function checkScope(
  promo: PromoCode,
  target: PromoTarget,
  cycle: BillingCycle | undefined,
): PromoFailure | null {
  if (promo.scope === "both") return null;

  if (promo.scope === "topup") {
    return target === "topup"
      ? null
      : { ok: false, reason: "That code only applies to one-off purchases." };
  }

  // Both remaining scopes are subscription-only.
  if (target !== "subscription") {
    return { ok: false, reason: "That code only applies to the subscription." };
  }

  if (promo.scope === "subscription_yearly" && cycle !== "yearly") {
    return {
      ok: false,
      reason: "That code only applies to annual plans.",
    };
  }

  // Monthly-only, and the reason is not symmetry. These codes discount a fixed
  // number of CYCLES — on an annual plan two cycles would be two YEARS.
  if (promo.scope === "subscription_monthly" && cycle !== "monthly") {
    return {
      ok: false,
      reason: "That code only applies to monthly plans.",
    };
  }

  return null;
}

/**
 * The disclosure sentence, or null when the price never changes.
 *
 * Shown at checkout beside the discounted total. This is not a nicety: card
 * networks treat an undisclosed renewal price as a chargeback risk, and a
 * customer who discovers a 43% rise on their second invoice is right to be
 * angry regardless of what the terms said.
 */
export function renewalNoticeFor(
  promo: PromoCode,
  target: PromoTarget,
  /**
   * What this purchase renews at, in cents.
   *
   * PASSED IN, not read from the promo row, and that is the whole point. A
   * tiered code has three renewal prices — Creator $19, Studio $49, Max $89 —
   * and a single `renews_at_cents` column can only hold one of them. Reading
   * it told every tier the same number: Creator was quoted $49 to renew at
   * $19, and Max was quoted $49 to renew at $89. A wrong price at the card
   * step is precisely the failure this module exists to prevent, so the
   * caller, which already knows the list price of the thing being bought,
   * supplies it.
   */
  renewsAtCents?: number | null,
): string | null {
  if (target !== "subscription") return null;
  if (promo.appliesToCycles === "forever") return null;

  const amount = renewsAtCents ?? promo.renewsAtCents;
  if (amount === null || amount === undefined) return null;

  const price = formatCents(amount);

  // Said in months for a monthly code, because "after the first year" on a
  // two-month discount would be a false statement about when money changes.
  if (promo.appliesToCycles === "first_two_cycles") {
    return `Your first two months are discounted. From the third month it renews at ${price}/mo, unless you cancel before then.`;
  }

  return `Renews at ${price} after the first year.`;
}

/** "30% off" / "$25 off" — what the badge next to the field says. */
export function describe(promo: PromoCode, planKey?: PlanKey): string {
  return promo.kind === "percent"
    ? `${percentFor(promo, planKey)}% off`
    : `${formatCents(promo.value)} off`;
}

/** Local formatter so this module stays free of imports it does not need. */
function formatCents(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars.toLocaleString("en-US")}`
    : `$${dollars.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
}
