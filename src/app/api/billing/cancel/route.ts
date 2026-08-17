import { NextResponse } from "next/server";
import { billingStateFrom, formatDate } from "@/lib/billing/status";
import { markCancelling, recordSubscription } from "@/lib/billing/store";
import { cancelSubscription, RazorpayError } from "@/lib/razorpay/client";
import { createServerClient } from "@/lib/supabase/server";

/**
 * POST /api/billing/cancel — stop the autopay mandate.
 *
 * The order of operations is the whole point. Razorpay is cancelled FIRST, and
 * only if that succeeds is the local row updated. Doing it the other way round
 * produces the worst possible bug in a billing system: an app that says
 * "cancelled" while the customer's UPI mandate keeps taking ₹499 every month.
 *
 * Cancellation is at the end of the paid cycle, not immediate. The pricing page
 * promises "you keep Pro until the period you already paid for runs out", and
 * cutting access on the 2nd for a month billed on the 1st would be taking money
 * for nothing.
 */

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { data: row } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  const state = billingStateFrom(row ?? null);

  if (!row || !state.razorpaySubscriptionId) {
    return NextResponse.json(
      { error: "There is no subscription to cancel." },
      { status: 404 },
    );
  }

  if (!state.canCancel) {
    return NextResponse.json(
      {
        error: state.cancelAtPeriodEnd
          ? "This subscription is already set to cancel."
          : "This subscription is not active.",
      },
      { status: 409 },
    );
  }

  let cancelled;
  try {
    cancelled = await cancelSubscription(state.razorpaySubscriptionId);
  } catch (error) {
    const message =
      error instanceof RazorpayError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not reach Razorpay.";
    return NextResponse.json(
      { error: `Razorpay refused the cancellation: ${message}` },
      { status: 502 },
    );
  }

  // Razorpay has stopped the mandate. Now our row can safely agree.
  const endsAt = cancelled.current_end ?? row.current_period_end;
  await recordSubscription(user.id, cancelled);
  await markCancelling(user.id, endsAt);

  return NextResponse.json({
    ok: true,
    endsAt,
    message: endsAt
      ? `Cancelled. Autopay is off and you keep Pro until ${formatDate(endsAt)}.`
      : "Cancelled. Autopay is off at Razorpay.",
  });
}
