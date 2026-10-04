/**
 * Switching plans — the money rule, kept pure so it can be tested.
 *
 * Razorpay cannot change the plan on a UPI mandate (and UPI is most of India),
 * so a switch is: start a NEW subscription for the new plan, and once it is
 * paid, cancel the old one immediately and refund the part of its last
 * payment that has not been used yet. The customer pays for exactly the days
 * they had each plan — no waiting for the period to end, nothing charged
 * twice for the same day.
 */

/** Below ₹1 a refund costs more attention than it returns. */
export const MIN_REFUND_PAISE = 100;

/**
 * The unused part of a payment, in paise, rounded DOWN (never refund more
 * than was paid). Zero when the period is over or the inputs make no sense.
 */
export function unusedRefundPaise({
  amountPaidPaise,
  periodStart,
  periodEnd,
  now,
}: {
  amountPaidPaise: number;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}): number {
  const total = periodEnd.getTime() - periodStart.getTime();
  const left = periodEnd.getTime() - Math.max(now.getTime(), periodStart.getTime());
  if (!(amountPaidPaise > 0) || !(total > 0) || !(left > 0)) return 0;

  const refund = Math.floor((amountPaidPaise * Math.min(left, total)) / total);
  return refund >= MIN_REFUND_PAISE ? refund : 0;
}

export type SubscriptionEventAction =
  | "complete-switch"
  | "drop-switch"
  | "wait"
  | "ignore-superseded"
  | "cancel-stray"
  | "record";

/**
 * What a Razorpay subscription event may do to the customer's row.
 *
 *   - The pending switch's subscription: complete it once paid, drop it if
 *     it failed, otherwise wait. The current plan is never touched by it.
 *   - A subscription that is NOT the row's current one (the old plan after a
 *     switch, an abandoned checkout): ignored. Without this, the old plan's
 *     "cancelled" event — which the switch itself causes — would cancel the
 *     customer's brand-new plan.
 *   - Otherwise: record it as before.
 */
export function actionForSubscriptionEvent(
  row: { razorpay_subscription_id: string | null; switch_subscription_id: string | null } | null,
  subscriptionId: string,
  status: string,
): SubscriptionEventAction {
  if (row?.switch_subscription_id === subscriptionId) {
    if (status === "authenticated" || status === "active") return "complete-switch";
    if (status === "created" || status === "pending") return "wait";
    return "drop-switch";
  }
  if (row?.razorpay_subscription_id && row.razorpay_subscription_id !== subscriptionId) {
    // Not the current plan and not the pending switch, yet PAID: an abandoned
    // switch or checkout authorised later from an old tab. Left alone it is a
    // mandate charging every month with no plan behind it — cancel and refund.
    if (status === "authenticated" || status === "active") return "cancel-stray";
    return "ignore-superseded";
  }
  return "record";
}
