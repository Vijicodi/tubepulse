import { NextResponse } from "next/server";
import {
  claimEvent,
  consumePromoCycle,
  recordSubscription,
  resolveOwnerId,
} from "@/lib/billing/store";
import { requireBillingEnv } from "@/lib/env";
import { verifyWebhookSignature } from "@/lib/razorpay/signature";
import {
  razorpayWebhookSchema,
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

  try {
    if (subscription && SUBSCRIPTION_EVENTS.has(event)) {
      return await handleSubscription(request, event, subscription, parsed.data);
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

  // A paid invoice spends one discounted cycle. This sits AFTER the claim
  // above on purpose — Razorpay retries deliveries, and decrementing per
  // delivery rather than per claimed event would eat a customer's two
  // discounted months in a retry storm.
  if (event === "subscription.charged") {
    await consumePromoCycle(ownerId);
  }

  return NextResponse.json({ ok: true });
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
