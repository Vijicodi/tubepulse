import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PLANS,
  PLAN_PRICES,
  toBillingCycle,
  toPaidPlanKey,
  type BillingCycle,
  type PaidPlanKey,
} from "@/lib/billing/plans";
import {
  countryFromHeaders,
  paypalPlanEnvVar,
  providerForCountry,
  type PaymentProvider,
} from "@/lib/billing/provider";
import {
  createSubscription as createPaypalSubscription,
  PayPalError,
  type PayPalSubscription,
} from "@/lib/paypal/client";
import { recordPaypalSubscription } from "@/lib/billing/store";
import { checkPromo, recordRedemption } from "@/lib/billing/promo-store";
import { billingStateFrom } from "@/lib/billing/status";
import { recordPendingSwitch, recordSubscription } from "@/lib/billing/store";
import { cancelSubscription, createSubscription, RazorpayError } from "@/lib/razorpay/client";
import { assertModeMatchesEnvironment, serverEnv } from "@/lib/env";
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
  /**
   * Which provider the pricing page actually offered. Sent so the button the
   * customer pressed is the one that runs, rather than a geo lookup silently
   * disagreeing with what was on screen. Narrowed, never trusted.
   */
  provider: z.string().optional(),
});

/**
 * Start a PayPal subscription and hand back its approval link.
 *
 * Mirrors the Razorpay path deliberately: nothing is charged here, the row is
 * recorded before the customer leaves, and the webhook is what grants the tier.
 * The difference is the customer is REDIRECTED to PayPal rather than opening a
 * modal, so this returns a URL instead of a subscription id for a popup.
 */
async function startPaypalCheckout({
  userId,
  planKey,
  cycle,
  rawCode,
}: {
  userId: string;
  planKey: PaidPlanKey;
  cycle: BillingCycle;
  rawCode: string | undefined;
}): Promise<NextResponse> {
  if (rawCode) {
    // Refuse loudly. The launch codes are Razorpay Offer objects; there is no
    // PayPal equivalent, so the only honest options are "refuse" or "charge
    // full price after showing a discount". This is the first one.
    return NextResponse.json(
      {
        error:
          "Discount codes are not available on international checkout yet. " +
          "Remove the code to continue.",
      },
      { status: 400 },
    );
  }

  const env = serverEnv();
  const envVar = paypalPlanEnvVar(planKey, cycle);
  const planId = (env as unknown as Record<string, string>)[envVar] ?? "";

  if (planId === "") {
    // Names the variable rather than failing at PayPal with "resource not
    // found", which says nothing about which of six ids is missing.
    return NextResponse.json(
      { error: `International checkout is not configured: ${envVar} is not set.` },
      { status: 503 },
    );
  }

  let subscription: PayPalSubscription;
  try {
    subscription = await createPaypalSubscription({
      planId,
      ownerId: userId,
      returnUrl: `${env.APP_URL}/billing?paypal=return`,
      cancelUrl: `${env.APP_URL}/pricing?paypal=cancelled`,
      // Idempotency: a retried create must not produce a second mandate on the
      // same card. Scoped to the user and the exact thing being bought.
      requestId: `sub-${userId}-${planKey}-${cycle}`,
    });
  } catch (error) {
    const message =
      error instanceof PayPalError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not reach PayPal.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const approveUrl = subscription.links?.find((link) => link.rel === "approve")?.href;

  if (!approveUrl) {
    // Without this the customer has a subscription they can never authorise.
    return NextResponse.json(
      { error: "PayPal did not return an approval link." },
      { status: 502 },
    );
  }

  // Recorded BEFORE the redirect, exactly as on the Razorpay path: if the
  // webhook cannot reach us, the sync route still has an id to ask about.
  try {
    await recordPaypalSubscription(userId, subscription, planKey, cycle);
  } catch {
    // Must not block an otherwise fine checkout — the webhook upserts anyway.
  }

  return NextResponse.json({ provider: "paypal", approveUrl });
}

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
  // An over-long promo code fails the schema; say so instead of "Unknown plan".
  if (!body.success && body.error.issues.some((issue) => issue.path[0] === "promoCode")) {
    return NextResponse.json({ error: "That promo code is not valid." }, { status: 400 });
  }
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

  /**
   * A PLAN SWITCH. Someone already paying on Razorpay picks a different tier
   * or cycle. Razorpay cannot re-price a UPI mandate, so this creates a NEW
   * subscription and parks it in switch_subscription_id; the current plan is
   * untouched until the new one is paid, and then completeSwitch cancels the
   * old one and refunds its unused days. See lib/billing/switch.ts.
   */
  const switching =
    !state.canSubscribe &&
    state.isPaid &&
    existing?.provider === "razorpay" &&
    Boolean(existing?.razorpay_subscription_id);

  if (!state.canSubscribe && !switching) {
    return NextResponse.json(
      { error: "You already have an active plan. Nothing to pay." },
      { status: 409 },
    );
  }

  /**
   * WHICH PROVIDER CHARGES THIS CUSTOMER.
   *
   * India goes to Razorpay, everyone else to PayPal, and neither can do the
   * other's half — see `provider.ts` for why that is forced rather than chosen.
   * The body may name a provider (the pricing page sends what it displayed, so
   * the button pressed is the one that runs); otherwise it is derived from the
   * platform's geo header.
   *
   * Nothing security-relevant rests on this. It picks a payment method, not an
   * entitlement — the tier always arrives from a verified webhook.
   */
  const requestedProvider = body.success ? body.data.provider : undefined;
  // A switch stays on the gateway the customer already pays through.
  const provider: PaymentProvider = switching
    ? "razorpay"
    : requestedProvider === "paypal" || requestedProvider === "razorpay"
      ? requestedProvider
      : providerForCountry(countryFromHeaders(request.headers));

  if (switching) {
    if (existing?.plan_key === planKey && existing?.billing_cycle === cycle) {
      return NextResponse.json({ error: "You are already on this plan." }, { status: 409 });
    }
    if (body.success && body.data.promoCode?.trim()) {
      return NextResponse.json(
        { error: "Promo codes are for a first subscription, not a plan switch." },
        { status: 400 },
      );
    }
  }

  if (provider === "paypal") {
    return startPaypalCheckout({
      userId: user.id,
      planKey,
      cycle,
      // PayPal is refused a promo code rather than ignoring one: the discounts
      // are implemented as Razorpay Offer objects and have no PayPal
      // equivalent, so honouring the code is impossible and silently dropping
      // it would charge full price to someone who was shown a discount.
      rawCode: body.success ? body.data.promoCode?.trim() : undefined,
    });
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
      amountCents: price.pricePaise,
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
  if (switching) {
    // MUST succeed: without it, the paid switch could not be matched to this
    // customer's current plan. Refuse before the popup opens instead.
    try {
      await recordPendingSwitch(user.id, subscription.id);
    } catch (error) {
      await cancelSubscription(subscription.id, { immediately: true }).catch(() => undefined);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not start the switch." },
        { status: 500 },
      );
    }
  } else {
    try {
      await recordSubscription(user.id, subscription, planKey, cycle, appliedPromo);
    } catch {
      // A failure here must not block a checkout that is otherwise fine. The
      // webhook upserts the same row anyway.
    }
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
    amount: price.pricePaise - discountCents,
    planKey,
    planName: plan.name,
    cycle,
    email: user.email ?? "",
    switching,
  });
}
