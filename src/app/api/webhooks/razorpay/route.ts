import { NextResponse } from "next/server";
import { TOPUPS, toTopupKey } from "@/lib/billing/plans";
import {
  claimEvent,
  grantTopupCredits,
  recordSubscription,
  resolveOwnerId,
} from "@/lib/billing/store";
import { requireBillingEnv } from "@/lib/env";
import { verifyWebhookSignature } from "@/lib/razorpay/signature";
import {
  razorpayWebhookSchema,
  type RazorpayPayment,
  type RazorpaySubscription,
} from "@/lib/razorpay/schemas";

/**
 * POST /api/webhooks/razorpay — where Razorpay reports what it did.
 *
 * A PUBLIC url that decides who is a paying customer, which makes it the most
 * security-sensitive route in the app. Four rules, all implemented below:
 *
 *   1. VERIFY BEFORE PARSING. The signature is an HMAC of the RAW body, so the
 *      body is read as text and only parsed after the check passes. Calling
 *      request.json() first and re-stringifying changes the bytes and the
 *      signature can never match — the single most common Razorpay bug.
 *   2. NEVER TRUST THE BODY FOR IDENTITY. Which user gets Pro comes from the
 *      `notes.owner_id` we stamped at creation, or from a lookup of an id we
 *      already stored. A user id sent to us by a stranger is a free upgrade for
 *      anyone who can guess a uuid.
 *   3. BE SAFE TO RUN TWICE. Razorpay retries on any non-2xx and can duplicate
 *      deliveries. Every event id is claimed once; replays return 200 and do
 *      nothing. Credits have a second guard on top — a unique payment id in the
 *      ledger — because granting a refill twice is giving money away.
 *   4. RETURN 200 ONCE THE SIGNATURE IS GOOD, even if our own work failed —
 *      otherwise Razorpay retries for 24 hours. Real failures are logged, and
 *      the user can force a reconcile from the billing page.
 *
 * Two product families arrive here. `subscription.*` events decide Pro;
 * `order.paid` grants a refill pack. They share the signature check, the replay
 * guard and the identity rule, and nothing else.
 */

export const runtime = "nodejs";

/** Events that change whether someone may use Pro. */
const SUBSCRIPTION_EVENTS = new Set([
  "subscription.authenticated",
  "subscription.activated",
  "subscription.charged",
  "subscription.pending",
  "subscription.halted",
  "subscription.cancelled",
  "subscription.completed",
  "subscription.paused",
  "subscription.resumed",
  "subscription.updated",
]);

export async function POST(request: Request) {
  // Rule 1: raw text, verified, and only then parsed.
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  let webhookSecret: string;
  try {
    webhookSecret = requireBillingEnv().webhookSecret;
  } catch {
    // Billing is not configured on this deploy. Refuse rather than 200 — a
    // silent success here would look like a working webhook.
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  }

  const parsed = razorpayWebhookSchema.safeParse(safeJson(rawBody));
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed payload." }, { status: 400 });
  }

  const { event, payload } = parsed.data;
  const subscription = payload.subscription?.entity;
  const payment = payload.payment?.entity;

  try {
    if (subscription && SUBSCRIPTION_EVENTS.has(event)) {
      return await handleSubscription(request, event, subscription, parsed.data);
    }

    // `order.paid` carries the payment entity alongside the order, and the
    // payment is what holds the notes we stamped. `payment.captured` fires for
    // subscription charges too, so only order.paid is treated as a refill.
    if (payment && event === "order.paid") {
      return await handleTopup(request, event, payment, parsed.data);
    }
  } catch (error) {
    // Rule 4. Logged rather than retried into a loop.
    console.error("[razorpay webhook]", event, error);
    return NextResponse.json({ ok: true, failed: true });
  }

  // Something we do not act on. 200 so Razorpay stops retrying.
  return NextResponse.json({ ok: true, ignored: event });
}

async function handleSubscription(
  request: Request,
  event: string,
  subscription: RazorpaySubscription,
  fullPayload: unknown,
) {
  // Rule 2: identity from our own note, never from an arbitrary body field.
  const ownerId = await resolveOwnerId(subscription);
  const id = eventId(request, event, subscription.id, subscription.current_end);

  if (!ownerId) {
    // A subscription we have never seen — most likely created by hand in the
    // Razorpay dashboard. Record the event so it is not lost, then stop.
    await claimEvent({ id, event, ownerId: null, payload: fullPayload });
    return NextResponse.json({ ok: true, unmatched: subscription.id });
  }

  // Rule 3: first claim wins, replays fall out here.
  const isNew = await claimEvent({ id, event, ownerId, payload: fullPayload });
  if (!isNew) return NextResponse.json({ ok: true, replay: true });

  await recordSubscription(ownerId, subscription);
  return NextResponse.json({ ok: true });
}

async function handleTopup(
  request: Request,
  event: string,
  payment: RazorpayPayment,
  fullPayload: unknown,
) {
  const ownerId =
    typeof payment.notes?.owner_id === "string" && payment.notes.owner_id !== ""
      ? payment.notes.owner_id
      : null;

  const packKey =
    typeof payment.notes?.topup_key === "string"
      ? toTopupKey(payment.notes.topup_key)
      : null;

  const id = eventId(request, event, payment.id, null);

  // Not one of ours — a payment made outside the refill flow. Record and stop.
  if (!ownerId || !packKey) {
    await claimEvent({ id, event, ownerId, payload: fullPayload });
    return NextResponse.json({ ok: true, unmatched: payment.id });
  }

  const isNew = await claimEvent({ id, event, ownerId, payload: fullPayload });
  if (!isNew) return NextResponse.json({ ok: true, replay: true });

  const topup = TOPUPS[packKey];

  // The notes are ours, but the amount is the thing that decides what someone
  // receives, so it is checked rather than trusted.
  //
  // The figure to check against is `charged_paise`, stamped on the order when
  // it was created — NOT the catalogue price. A promo code makes a legitimate
  // payment smaller than the list price, and comparing against the list price
  // would reject every discounted refill as underpaid.
  const expected = expectedPaise(payment.notes?.charged_paise, topup.pricePaise);

  if (payment.amount < expected) {
    console.error(
      "[razorpay webhook] underpaid refill",
      payment.id,
      payment.amount,
      expected,
    );
    return NextResponse.json({ ok: true, underpaid: true });
  }

  // Idempotent on the unique payment id, so the confirm route beating us here
  // simply means this grants nothing.
  const granted = await grantTopupCredits({
    ownerId,
    topup,
    orderId: payment.order_id ?? null,
    paymentId: payment.id,
    amountPaise: payment.amount,
  });

  return NextResponse.json({ ok: true, granted });
}

/**
 * What this order should have been paid at.
 *
 * Falls back to the list price if the note is missing or nonsense — an order
 * created before this note existed, or tampered with. Falling back UP is the
 * safe direction: the worst case is a legitimate payment needing a human look,
 * rather than a pack granted for a rupee.
 */
function expectedPaise(note: unknown, listPricePaise: number): number {
  if (typeof note !== "string") return listPricePaise;
  const parsed = Number.parseInt(note, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return listPricePaise;
  return Math.min(parsed, listPricePaise);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * A stable id for this delivery.
 *
 * Razorpay sends `x-razorpay-event-id`, which is the correct key and is what is
 * used in practice. The fallback exists only for the case where that header is
 * missing, and it includes the billing period — `subscription.charged` fires
 * every month for the SAME subscription id, so a key of `event:entity` alone
 * would treat February's renewal as a replay of January's and silently skip it.
 */
function eventId(
  request: Request,
  event: string,
  entityId: string,
  period: string | null,
): string {
  return (
    request.headers.get("x-razorpay-event-id") ??
    `${event}:${entityId}:${period ?? "na"}`
  );
}
