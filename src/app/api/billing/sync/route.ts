import { NextResponse } from "next/server";
import { billingStateFrom } from "@/lib/billing/status";
import { recordSubscription } from "@/lib/billing/store";
import { fetchSubscription } from "@/lib/razorpay/client";
import { createServerClient } from "@/lib/supabase/server";

/**
 * POST /api/billing/sync — ask Razorpay directly what the subscription is doing.
 *
 * The polling half of the same pattern the Apify scrape uses, and it exists for
 * the same reason: webhooks need a publicly reachable URL, and localhost is not
 * one. Without this, authorising autopay on a dev machine would leave the
 * billing page saying "free" forever, and the first assumption would be that
 * the payment failed.
 *
 * It is also the recovery path in production. If a webhook is missed — bad
 * deploy, dropped delivery — the user clicking "Refresh" fixes their own
 * account without anyone touching the database.
 *
 * Safe to call repeatedly: it reads from Razorpay and upserts, exactly like the
 * webhook, through the same shared function.
 *
 * See docs/decisions/0004-webhook-plus-polling.md.
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

  // Nothing was ever started, so there is nothing to reconcile. Not an error —
  // the billing page calls this on load.
  if (!row?.razorpay_subscription_id) {
    return NextResponse.json({ state: billingStateFrom(row ?? null), synced: false });
  }

  try {
    const subscription = await fetchSubscription(row.razorpay_subscription_id);
    await recordSubscription(user.id, subscription);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not reach Razorpay.",
        state: billingStateFrom(row),
      },
      { status: 502 },
    );
  }

  const { data: fresh } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  return NextResponse.json({ state: billingStateFrom(fresh ?? null), synced: true });
}
