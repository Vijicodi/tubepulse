import "server-only";
import { requireBillingEnv } from "@/lib/env";
import type { BillingCycle, PaidPlanKey } from "@/lib/billing/plans";
import { PLANS, PLAN_PRICES, PLAN_TOTAL_CYCLES } from "@/lib/billing/plans";
import {
  razorpayPaymentSchema,
  razorpaySubscriptionSchema,
  type RazorpayPayment,
  type RazorpaySubscription,
} from "./schemas";

/**
 * The Razorpay REST client.
 *
 * Deliberately `fetch` and zod rather than the official `razorpay` npm package.
 * The package is CommonJS with loose types, and we would still be validating
 * its output at the boundary — so it would add a dependency and change nothing
 * about the safety. Four endpoints do not justify that.
 *
 * Auth is HTTP Basic: key id as the username, key secret as the password. The
 * secret is read through requireBillingEnv() and never touches a client bundle;
 * `server-only` at the top makes that a build error rather than a leak.
 */

const API_BASE = "https://api.razorpay.com/v1";

export class RazorpayError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RazorpayError";
  }
}

async function call(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<unknown> {
  const { keyId, keySecret } = requireBillingEnv();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const response = await fetch(`${API_BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    // Money state is never cacheable, and Next caches fetch by default.
    cache: "no-store",
  });

  const text = await response.text();
  const json: unknown = text === "" ? null : safeParse(text);

  if (!response.ok) {
    throw new RazorpayError(describeError(json, response.status), response.status);
  }

  return json;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Razorpay errors arrive as `{ error: { description, code, reason } }`. The
 * description is written for humans and is worth surfacing — "Subscriptions is
 * not enabled for this account" tells you far more than "502".
 */
function describeError(json: unknown, status: number): string {
  if (
    typeof json === "object" &&
    json !== null &&
    "error" in json &&
    typeof (json as { error: unknown }).error === "object" &&
    (json as { error: Record<string, unknown> }).error !== null
  ) {
    const error = (json as { error: Record<string, unknown> }).error;
    const description = error.description;
    if (typeof description === "string" && description !== "") return description;
  }
  return `Razorpay returned ${status}.`;
}

/**
 * Create a subscription with autopay, on either billing cycle.
 *
 * This does NOT charge anyone. It returns an id the browser hands to Razorpay's
 * checkout, where the customer authorises the mandate (UPI Autopay, card, or
 * e-mandate). Money only moves once they approve, and the `subscription.charged`
 * webhook is what tells us it did.
 *
 * `total_count` is required — Razorpay has no "until cancelled".
 *
 * ON `offerId`: a Razorpay plan hard-codes its amount, so a discounted
 * subscription cannot be created by sending a smaller number. The only
 * supported route is an Offer, created in the Razorpay dashboard, referenced
 * here. The promo layer refuses a subscription code that has no offer behind
 * it, rather than showing a discount and charging full price.
 */
export async function createSubscription({
  ownerId,
  email,
  planKey,
  cycle = "monthly",
  offerId = null,
  notes = {},
}: {
  ownerId: string;
  email: string | null;
  planKey: PaidPlanKey;
  cycle?: BillingCycle;
  offerId?: string | null;
  notes?: Record<string, string>;
}): Promise<RazorpaySubscription> {
  const env = requireBillingEnv();
  const price = PLAN_PRICES[planKey][cycle];

  // The plan object's env var name is declared in plans.ts beside its price, so
  // this never hard-codes which variable belongs to which tier.
  const planId = env.planIds[price.envVar] ?? "";

  if (planId === "") {
    throw new RazorpayError(
      cycle === "yearly"
        ? `Annual billing is not set up for ${PLANS[planKey].name}: ${price.envVar} ` +
          `is missing from .env.local. Run "npm run razorpay:plan" to create it.`
        : `${price.envVar} is missing from .env.local.`,
      500,
    );
  }

  const json = await call("/subscriptions", {
    method: "POST",
    body: {
      plan_id: planId,
      total_count: PLAN_TOTAL_CYCLES[cycle],
      quantity: 1,
      // Let Razorpay send its own payment emails. Ours would be a second,
      // worse copy of a receipt they already send.
      customer_notify: 1,
      ...(offerId ? { offer_id: offerId } : {}),
      // The webhook arrives with no session. These notes are how a Razorpay
      // subscription is traced back to a TubePulse user — without them the only
      // link would be an email address, which people change.
      notes: {
        ...notes,
        owner_id: ownerId,
        email: email ?? "",
        billing_cycle: cycle,
        // WHICH TIER. The webhook arrives with only a plan_id, which is opaque
        // — mapping it back would mean six env lookups and a wrong answer the
        // moment a plan is recreated. The note is the reliable link.
        plan_key: planKey,
      },
    },
  });

  return razorpaySubscriptionSchema.parse(json);
}

export async function fetchSubscription(
  subscriptionId: string,
): Promise<RazorpaySubscription> {
  const json = await call(`/subscriptions/${subscriptionId}`, { method: "GET" });
  return razorpaySubscriptionSchema.parse(json);
}

/**
 * Cancel, and stop the autopay mandate at Razorpay's end.
 *
 * `cancel_at_cycle_end: 1` is the default here on purpose. The pricing page
 * says you keep Pro until the period you already paid for runs out, and
 * cancelling immediately would take away time that has been paid for.
 */
export async function cancelSubscription(
  subscriptionId: string,
  { immediately = false }: { immediately?: boolean } = {},
): Promise<RazorpaySubscription> {
  const json = await call(`/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    body: { cancel_at_cycle_end: immediately ? 0 : 1 },
  });
  return razorpaySubscriptionSchema.parse(json);
}

/**
 * Ask Razorpay about a payment.
 *
 * The confirm route calls this rather than believing the browser's success
 * payload — a signature proves the message was not forged, but only Razorpay
 * can say whether the money was actually captured.
 */
export async function fetchPayment(paymentId: string): Promise<RazorpayPayment> {
  const json = await call(`/payments/${paymentId}`, { method: "GET" });
  return razorpayPaymentSchema.parse(json);
}
