import "server-only";
import { requireBillingEnv } from "@/lib/env";
import type { BillingCycle, Topup } from "@/lib/billing/plans";
import { PRO_PRICES, PRO_TOTAL_CYCLES } from "@/lib/billing/plans";
import {
  razorpayOrderSchema,
  razorpayPaymentSchema,
  razorpaySubscriptionSchema,
  type RazorpayOrder,
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
export async function createProSubscription({
  ownerId,
  email,
  cycle = "monthly",
  offerId = null,
  notes = {},
}: {
  ownerId: string;
  email: string | null;
  cycle?: BillingCycle;
  offerId?: string | null;
  notes?: Record<string, string>;
}): Promise<RazorpaySubscription> {
  const env = requireBillingEnv();
  const price = PRO_PRICES[cycle];

  const planId = cycle === "yearly" ? env.proYearlyPlanId : env.proPlanId;

  if (planId === "") {
    throw new RazorpayError(
      cycle === "yearly"
        ? `Annual billing is not set up: ${price.envVar} is missing from .env.local. ` +
          `Run "npm run razorpay:plan" to create the yearly plan.`
        : `${price.envVar} is missing from .env.local.`,
      500,
    );
  }

  const json = await call("/subscriptions", {
    method: "POST",
    body: {
      plan_id: planId,
      total_count: PRO_TOTAL_CYCLES[cycle],
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
 * Create a one-off order for a refill pack.
 *
 * Orders, not Subscriptions — a pack is paid once and sets up no mandate. The
 * amount comes from the catalogue on the SERVER; a browser that could name its
 * own price would buy fifteen scrapes for ₹1.
 *
 * The receipt is the caller's idempotency handle. Razorpay does not enforce
 * uniqueness on it, so it is for human tracing rather than deduplication —
 * the real guard is the unique `razorpay_payment_id` in the ledger.
 */
export async function createTopupOrder({
  topup,
  ownerId,
  email,
  amountPaise,
  promoCode = null,
}: {
  topup: Topup;
  ownerId: string;
  email: string | null;
  /** What to actually charge. Below the list price when a promo applied. */
  amountPaise?: number;
  promoCode?: string | null;
}): Promise<RazorpayOrder> {
  // Refills are Orders, so a discount is simply a smaller amount — no Razorpay
  // Offer needed. The caller computes it; this never trusts a browser figure.
  const charge = amountPaise ?? topup.pricePaise;

  const json = await call("/orders", {
    method: "POST",
    body: {
      amount: charge,
      currency: "INR",
      receipt: `tp_${topup.key}_${Date.now()}`,
      // As with subscriptions, this note is how a payment is traced back to a
      // TubePulse user when the webhook arrives with no session.
      notes: {
        owner_id: ownerId,
        email: email ?? "",
        topup_key: topup.key,
        scrapes: String(topup.scrapes),
        ...(promoCode ? { promo_code: promoCode } : {}),
        // The webhook checks the paid amount against the pack price. When a
        // promo applied, THIS is the figure it must compare against, not the
        // catalogue one — otherwise every discounted refill looks underpaid.
        charged_paise: String(charge),
      },
    },
  });

  return razorpayOrderSchema.parse(json);
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
