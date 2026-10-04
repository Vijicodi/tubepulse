import {
  PLANS,
  formatInr,
  paiseToInr,
  toPaidPlanKey,
  type PaidPlanKey,
  type PlanKey,
} from "@/lib/billing/plans";
import type { BillingCycleValue, SubscriptionRow, SubscriptionStatus } from "@/lib/supabase/types";

/**
 * Turning a subscription row into the two things the app actually asks:
 * "which plan is this person on?" and "what do I put on the screen?".
 *
 * Pure — no database, no network — so the rules that decide who gets paid
 * features are unit tested rather than inferred from a page render.
 *
 * THE RULE THAT MATTERS: access is not the same as status. Someone who cancels
 * on the 2nd has paid through the 30th and keeps their tier until then. The
 * pricing page promises exactly that, so access checks the period end, not the
 * word "cancelled".
 *
 * WHICH TIER, NOT WHETHER PAID. The old version answered a boolean, which was
 * enough when there was one paid plan. With four, every quota and feature check
 * needs the actual key, so `planKey` is the primary output and `isPaid` is
 * derived from it.
 */

/** Statuses where Razorpay is successfully taking money. */
const PAYING: readonly SubscriptionStatus[] = ["active", "authenticated"];

/** Statuses that keep access alive only while the paid period has not lapsed. */
const GRACE: readonly SubscriptionStatus[] = ["cancelled", "completed", "pending"];

/** How long past its period end a paying row keeps access while a renewal lands. */
export const RENEWAL_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export interface BillingState {
  /** The plan whose features should be unlocked right now. */
  planKey: PlanKey;
  /** True for any paid tier. Derived — never store this as the source. */
  isPaid: boolean;
  /**
   * The tier on the row, even if it was never paid for or has lapsed — a
   * checkout opened and closed leaves one here. Use `ownedTier` for anything
   * that says "your plan" or decides what can be bought.
   */
  subscribedTier: PaidPlanKey | null;
  /** The tier that is genuinely theirs right now (paid or in grace). Null if none. */
  ownedTier: PaidPlanKey | null;
  status: SubscriptionStatus | "none";
  /** Monthly or yearly. Meaningless unless isPaid. */
  cycle: BillingCycleValue;
  /** ISO timestamp the paid tier runs out, when that is known. */
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  razorpaySubscriptionId: string | null;
  /** Which gateway charges this subscription. Decides where a cancel goes. */
  provider: "razorpay" | "paypal";
  /** PayPal's subscription id, when this is a PayPal row. */
  paypalSubscriptionId: string | null;
  /** True when the user can start a fresh checkout. */
  canSubscribe: boolean;
  /** True when there is something to cancel. */
  canCancel: boolean;
  /** One sentence for the billing page. Written for a human, not a log. */
  headline: string;
  /**
   * The live discount, when one is running. Null when there is none.
   *
   * Derived from the subscription's own frozen columns rather than from the
   * promo table, because the promo knows the RULE and this customer knows
   * WHERE THEY ARE IN IT — and because a code edited after the fact must never
   * retroactively change what somebody was told they would pay.
   */
  promo: ActivePromo | null;
}

/** A discount currently running on a subscription. */
export interface ActivePromo {
  code: string;
  /** Discounted invoices still to come, including the current one. */
  cyclesRemaining: number;
  cyclesTotal: number;
  /** What it costs once the discount ends, in cents. */
  renewsAtCents: number | null;
  /** One sentence for the billing page. Never silent about the rise. */
  notice: string;
}

export const FREE_STATE: BillingState = {
  planKey: "free",
  isPaid: false,
  subscribedTier: null,
  ownedTier: null,
  status: "none",
  cycle: "monthly",
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  razorpaySubscriptionId: null,
  provider: "razorpay",
  paypalSubscriptionId: null,
  canSubscribe: true,
  canCancel: false,
  headline: "You are on Scout, the free plan.",
  promo: null,
};

/**
 * Whether the paid tier on this row is currently usable.
 *
 * Unchanged in spirit from the two-tier version — what changed is that the
 * caller then asks WHICH tier, rather than assuming there is only one.
 */
export function hasPaidAccess(
  row: Pick<SubscriptionRow, "status" | "current_period_end">,
  now: Date = new Date(),
): boolean {
  if (PAYING.includes(row.status)) {
    // A paying row whose period ended more than the grace window ago means a
    // renewal or halt event never reached us. Without this date check a lost
    // webhook was paid access forever. The grace covers Razorpay's retry of a
    // failed renewal; the billing page re-syncs such rows on load.
    if (!row.current_period_end) return true;
    return new Date(row.current_period_end).getTime() + RENEWAL_GRACE_MS > now.getTime();
  }

  if (GRACE.includes(row.status) && row.current_period_end) {
    return new Date(row.current_period_end) > now;
  }

  // 'created' (never authorised), 'halted' (payments failed), 'expired'.
  return false;
}

/**
 * The tier a row is for, or null when the stored key is not one we sell.
 *
 * `plan_key` is a plain text column rather than an enum, so an old row (or a
 * hand-edited one) can hold anything. An unrecognised value drops to free
 * rather than throwing: refusing to render the billing page is a worse failure
 * than showing someone the free tier and letting them re-subscribe.
 */
export function tierOf(row: Pick<SubscriptionRow, "plan_key">): PaidPlanKey | null {
  return toPaidPlanKey(row.plan_key);
}

export function billingStateFrom(
  row: SubscriptionRow | null,
  now: Date = new Date(),
): BillingState {
  if (!row) return FREE_STATE;

  const tier = tierOf(row);
  const active = hasPaidAccess(row, now) && tier !== null;
  const endsOn = row.current_period_end;

  return {
    planKey: active && tier ? tier : "free",
    isPaid: active,
    subscribedTier: tier,
    ownedTier: active || PAYING.includes(row.status) ? tier : null,
    status: row.status,
    cycle: row.billing_cycle,
    currentPeriodEnd: endsOn,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    razorpaySubscriptionId: row.razorpay_subscription_id,
    provider: row.provider ?? "razorpay",
    paypalSubscriptionId: row.paypal_subscription_id ?? null,
    // Never offer checkout to someone already paying — either provider would
    // happily create a second mandate and charge them twice.
    canSubscribe: !active && !PAYING.includes(row.status),
    /**
     * EITHER provider's id counts. Checking only the Razorpay one meant a
     * PayPal customer saw no cancel button at all — a subscription they could
     * not stop from inside the product, which is the exact reputation this
     * page exists to avoid.
     */
    canCancel:
      PAYING.includes(row.status) &&
      !row.cancel_at_period_end &&
      Boolean(row.razorpay_subscription_id ?? row.paypal_subscription_id),
    headline: headlineFor(row, active, tier, endsOn),
    promo: activePromoFrom(row, active),
  };
}

/**
 * The discount countdown, or null.
 *
 * Only for a subscription that is actually active — a lapsed or cancelled row
 * showing "2 discounted months left" would be advertising something the
 * customer no longer has.
 *
 * A remaining count of 0 also returns null: the discount is over, and the
 * billing page's ordinary renewal line is now the truthful one.
 */
export function activePromoFrom(
  row: SubscriptionRow,
  active: boolean,
): ActivePromo | null {
  if (!active) return null;
  if (!row.promo_code) return null;

  const remaining = row.promo_cycles_remaining;
  const total = row.promo_cycles_total;
  if (remaining === null || total === null || remaining <= 0) return null;

  const unit = row.billing_cycle === "yearly" ? "year" : "month";
  const count = `${remaining} ${remaining === 1 ? unit : `${unit}s`}`;
  const price =
    row.promo_renews_at_cents !== null
      ? formatInr(paiseToInr(row.promo_renews_at_cents))
      : null;

  return {
    code: row.promo_code,
    cyclesRemaining: remaining,
    cyclesTotal: total,
    renewsAtCents: row.promo_renews_at_cents,
    notice: price
      ? `${count} of your discount left. After that it renews at ${price}/${unit}.`
      : `${count} of your discount left.`,
  };
}


function headlineFor(
  row: SubscriptionRow,
  active: boolean,
  tier: PaidPlanKey | null,
  endsOn: string | null,
): string {
  const until = endsOn ? ` until ${formatDate(endsOn)}` : "";
  // Name the tier they actually bought. "Pro is active" was fine with one paid
  // plan; with four, a customer on Max should not read the word Studio.
  const name = tier ? PLANS[tier].name : "Your plan";

  switch (row.status) {
    case "active":
    case "authenticated": {
      const cadence = row.billing_cycle === "yearly" ? "yearly" : "monthly";
      return row.cancel_at_period_end
        ? `${name}, cancelling${until || " at the end of this period"}. No further charges.`
        : `${name} is active. Renews ${cadence}${endsOn ? `, on ${formatDate(endsOn)}` : ""}.`;
    }
    case "created":
      return "Autopay was never confirmed. Start the upgrade again to finish it.";
    case "pending":
      return "The last payment did not go through. Razorpay is retrying it.";
    case "halted":
      return "Payments failed too many times and the subscription stopped. Subscribe again to continue.";
    case "cancelled":
      return active
        ? `Cancelled. You keep ${name}${until}, then move to Scout.`
        : "Cancelled. You are on Scout, the free plan.";
    case "completed":
      return active ? `Your plan has run its course${until}.` : "Your plan has ended.";
    case "expired":
      return "The upgrade timed out before autopay was authorised.";
    default:
      return "You are on Scout, the free plan.";
  }
}

/** "12 September 2026" — the billing page reads as prose, not as a table. */
export function formatDate(iso: string): string {
  // "3 Nov 2026", in India time — the same style as the rest of the app. It
  // used to read "November 3, 2026" in the server's UTC, beside a sidebar
  // saying "resets 4 Nov" for the same moment.
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}
