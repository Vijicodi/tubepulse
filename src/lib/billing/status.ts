import type { BillingCycleValue, SubscriptionRow, SubscriptionStatus } from "@/lib/supabase/types";

/**
 * Turning a subscription row into the two things the app actually asks:
 * "may this person use Pro?" and "what do I put on the screen?".
 *
 * Pure — no database, no network — so the rules that decide who gets paid
 * features are unit tested rather than inferred from a page render.
 *
 * THE RULE THAT MATTERS: access is not the same as status. Someone who cancels
 * on the 2nd has paid through the 30th and keeps Pro until then. The pricing
 * page promises exactly that, so `hasProAccess` checks the period end, not the
 * word "cancelled".
 */

/** Statuses where Razorpay is successfully taking money. */
const PAYING: readonly SubscriptionStatus[] = ["active", "authenticated"];

/** Statuses that keep access alive only while the paid period has not lapsed. */
const GRACE: readonly SubscriptionStatus[] = ["cancelled", "completed", "pending"];

export interface BillingState {
  /** Whether Pro features should be unlocked right now. */
  isPro: boolean;
  status: SubscriptionStatus | "none";
  /** Monthly or yearly. Meaningless unless isPro. */
  cycle: BillingCycleValue;
  /** ISO timestamp Pro runs out, when that is known. */
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  razorpaySubscriptionId: string | null;
  /** True when the user can start a fresh checkout. */
  canSubscribe: boolean;
  /** True when there is something to cancel. */
  canCancel: boolean;
  /** One sentence for the billing page. Written for a human, not a log. */
  headline: string;
}

export const FREE_STATE: BillingState = {
  isPro: false,
  status: "none",
  cycle: "monthly",
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  razorpaySubscriptionId: null,
  canSubscribe: true,
  canCancel: false,
  headline: "You are on Scout, the free plan.",
};

export function hasProAccess(
  row: Pick<SubscriptionRow, "status" | "current_period_end">,
  now: Date = new Date(),
): boolean {
  if (PAYING.includes(row.status)) return true;

  if (GRACE.includes(row.status) && row.current_period_end) {
    return new Date(row.current_period_end) > now;
  }

  // 'created' (never authorised), 'halted' (payments failed), 'expired'.
  return false;
}

export function billingStateFrom(
  row: SubscriptionRow | null,
  now: Date = new Date(),
): BillingState {
  if (!row) return FREE_STATE;

  const isPro = hasProAccess(row, now);
  const endsOn = row.current_period_end;

  return {
    isPro,
    status: row.status,
    cycle: row.billing_cycle,
    currentPeriodEnd: endsOn,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    razorpaySubscriptionId: row.razorpay_subscription_id,
    // Never offer checkout to someone already paying — Razorpay would happily
    // create a second mandate and charge them twice.
    canSubscribe: !isPro && !PAYING.includes(row.status),
    canCancel:
      PAYING.includes(row.status) && !row.cancel_at_period_end && Boolean(row.razorpay_subscription_id),
    headline: headlineFor(row, isPro, endsOn),
  };
}

function headlineFor(
  row: SubscriptionRow,
  isPro: boolean,
  endsOn: string | null,
): string {
  const until = endsOn ? ` until ${formatDate(endsOn)}` : "";

  switch (row.status) {
    case "active":
    case "authenticated": {
      const cadence = row.billing_cycle === "yearly" ? "yearly" : "monthly";
      return row.cancel_at_period_end
        ? `Pro, cancelling${until || " at the end of this period"}. No further charges.`
        : `Pro is active. Renews ${cadence}${endsOn ? `, on ${formatDate(endsOn)}` : ""}.`;
    }
    case "created":
      return "Autopay was never confirmed. Start the upgrade again to finish it.";
    case "pending":
      return "The last payment did not go through. Razorpay is retrying it.";
    case "halted":
      return "Payments failed too many times and the subscription stopped. Subscribe again to continue.";
    case "cancelled":
      return isPro
        ? `Cancelled. You keep Pro${until}, then move to Scout.`
        : "Cancelled. You are on Scout, the free plan.";
    case "completed":
      return isPro ? `Your plan has run its course${until}.` : "Your plan has ended.";
    case "expired":
      return "The upgrade timed out before autopay was authorised.";
    default:
      return "You are on Scout, the free plan.";
  }
}

/** "12 September 2026" — the billing page reads as prose, not as a table. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
