import { NextResponse } from "next/server";
import { z } from "zod";
import { PLANS, PLAN_PRICES, toBillingCycle, toPaidPlanKey } from "@/lib/billing/plans";
import { checkPromo, recordRedemption } from "@/lib/billing/promo-store";
import { billingStateFrom } from "@/lib/billing/status";
import { recordSubscription } from "@/lib/billing/store";
import { createSubscription, RazorpayError } from "@/lib/razorpay/client";
import { assertModeMatchesEnvironment } from "@/lib/env";
import { createServerClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/public-env";

/**
 * POST /api/billing/checkout — start a subscription on one of the paid tiers.
 *
 * Creates the subscription at Razorpay and returns its id. NOTHING IS CHARGED
 * HERE. The browser opens Razorpay's checkout with this id, the customer
 * authorises the autopay mandate there, and the webhook tells us it happened.
 *
 * Two guards, and both matter with live keys:
 *   1. Signed in. An anonymous checkout has no user to grant the tier to.
 *   2. Not already paying. Razorpay will cheerfully create a second mandate on
 *      the same card, and the customer would be charged twice a month.
 *
 * The body names a PLAN, a CYCLE and optionally a CODE. It never names a price
 * — the amount comes from the Razorpay plan object, and the discount is
 * re-validated here rather than trusted from whatever the preview told the
 * browser.
 */

export const runtime = "nodejs";

const bodySchema = z.object({
  plan: z.string().optional(),
  cycle: z.string().optional(),
  promoCode: z.string().max(64).optional(),
});

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to upgrade." }, { status: 401 });
  }

  // Fail loudly rather than take a payment that never becomes money.
  assertModeMatchesEnvironment();

  // An empty body used to be valid when there was one paid plan. With four,
  // guessing which tier someone meant would be guessing at their money.
  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  const planKey = toPaidPlanKey(body.success ? (body.data.plan ?? "") : "");

  if (!planKey) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }

  const cycle = toBillingCycle(body.success ? (body.data.cycle ?? "monthly") : "monthly");

  if (!cycle) {
    return NextResponse.json({ error: "Unknown billing cycle." }, { status: 400 });
  }

  const plan = PLANS[planKey];
  const price = PLAN_PRICES[planKey][cycle];

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  const state = billingStateFrom(existing ?? null);

  if (!state.canSubscribe) {
    return NextResponse.json(
      { error: "You already have an active plan. Nothing to pay." },
      { status: 409 },
    );
  }

  // Re-validate the code from scratch. The preview endpoint's answer is a
  // suggestion made to a browser; this is the one that decides what is charged.
  let offerId: string | null = null;
  let discountCents = 0;
  let appliedPromo:
    | { code: string; cycles: number; renewsAtCents: number | null }
    | undefined;
  const rawCode = body.success ? body.data.promoCode?.trim() : undefined;

  if (rawCode) {
    const promo = await checkPromo({
      rawCode,
      target: "subscription",
      cycle,
      // The tier decides the rate AND which Razorpay offer is attached. Without
      // it a tiered code would price every tier at its fallback percentage and
      // attach the wrong offer — the customer sees one price and is charged
      // another, which is the exact failure this whole module exists to avoid.
      planKey,
      amountCents: price.priceCents,
      ownerId: user.id,
    });

    if (!promo.ok) {
      // Refuse rather than quietly charging full price. Someone who typed a
      // code and saw a discount must not be silently billed the full amount.
      return NextResponse.json({ error: promo.reason }, { status: 400 });
    }

    offerId = promo.razorpayOfferId;
    discountCents = promo.discountCents;
    // Freeze the countdown's inputs at the moment of agreement. Reading them
    // back off the promo table later would let an edited code change what a
    // customer was told they would pay.
    if (promo.cyclesCovered !== null) {
      appliedPromo = {
        code: promo.code,
        cycles: promo.cyclesCovered,
        renewsAtCents: promo.renewsAtCents,
      };
    }
  }

  let subscription;
  try {
    subscription = await createSubscription({
      ownerId: user.id,
      email: user.email ?? null,
      planKey,
      cycle,
      offerId,
      notes: rawCode ? { promo_code: rawCode.toUpperCase() } : {},
    });
  } catch (error) {
    // Razorpay's own description is far more useful than anything we could
    // invent — "Subscriptions is not enabled for this account", for instance.
    const message =
      error instanceof RazorpayError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not reach Razorpay.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Record it BEFORE the popup opens. If the customer authorises and the
  // webhook cannot reach us — which is every local dev machine — the polling
  // fallback still has a subscription id to ask Razorpay about.
  try {
    await recordSubscription(user.id, subscription, planKey, cycle, appliedPromo);
  } catch {
    // A failure here must not block a checkout that is otherwise fine. The
    // webhook upserts the same row anyway.
  }

  // The redemption is recorded now rather than on payment, because a
  // subscription's discount is applied by Razorpay's offer at charge time and
  // there is no later moment we are guaranteed to see. The trade-off is that
  // abandoning the popup still consumes the code — accepted deliberately, since
  // the alternative is a code that can be re-used indefinitely by opening
  // checkout and closing it.
  if (rawCode && discountCents > 0) {
    try {
      await recordRedemption({
        promoCode: rawCode,
        ownerId: user.id,
        target: "subscription",
        discountCents,
        reference: subscription.id,
      });
    } catch {
      // Never block a paid upgrade on bookkeeping.
    }
  }

  return NextResponse.json({
    subscriptionId: subscription.id,
    keyId: publicEnv.razorpayKeyId,
    amount: price.priceCents - discountCents,
    planKey,
    planName: plan.name,
    cycle,
    email: user.email ?? "",
  });
}
