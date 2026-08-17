import { NextResponse } from "next/server";
import { z } from "zod";
import { TOPUPS, toTopupKey, type Topup } from "@/lib/billing/plans";
import { getCreditBalance, grantTopupCredits } from "@/lib/billing/store";
import { recordRedemption } from "@/lib/billing/promo-store";
import { requireBillingEnv } from "@/lib/env";
import { fetchPayment, RazorpayError } from "@/lib/razorpay/client";
import { verifyOrderSignature } from "@/lib/razorpay/signature";
import { createServerClient } from "@/lib/supabase/server";

/**
 * POST /api/billing/topup/confirm — grant a refill the browser says was paid.
 *
 * This is the polling twin for one-off packs: the `order.paid` webhook is the
 * authority in production, but it cannot reach localhost, and a customer who
 * has just paid should not have to wait or refresh. So the browser reports
 * back — and is then disbelieved, twice:
 *
 *   1. THE SIGNATURE. `order_id|payment_id`, HMAC'd with the API secret, which
 *      only Razorpay and this server know. Note the argument order is the
 *      reverse of the subscription flow; that is Razorpay's API, not a typo.
 *   2. RAZORPAY ITSELF. A valid signature proves the message was not forged. It
 *      does NOT prove the money arrived — so the payment is fetched and its
 *      status and amount are checked against our catalogue before any credit
 *      is granted.
 *
 * Only then does the ledger get a row, and the unique payment id there means a
 * webhook arriving a second later grants nothing extra.
 */

export const runtime = "nodejs";

const bodySchema = z.object({
  pack: z.string().min(1),
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  signature: z.string().min(1),
});

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Malformed confirmation." }, { status: 400 });
  }

  const key = toTopupKey(body.data.pack);
  if (!key) {
    return NextResponse.json({ error: "No such refill pack." }, { status: 400 });
  }

  const topup: Topup = TOPUPS[key];
  const { keySecret } = requireBillingEnv();

  // Guard 1: the message is genuinely from Razorpay's checkout.
  const genuine = verifyOrderSignature(
    { orderId: body.data.orderId, paymentId: body.data.paymentId },
    body.data.signature,
    keySecret,
  );

  if (!genuine) {
    return NextResponse.json({ error: "That payment could not be verified." }, { status: 400 });
  }

  // Guard 2: the money actually arrived, and it was the right amount.
  let payment;
  try {
    payment = await fetchPayment(body.data.paymentId);
  } catch (error) {
    const message =
      error instanceof RazorpayError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not reach Razorpay.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (payment.status !== "captured" && payment.status !== "authorized") {
    return NextResponse.json(
      { error: `Razorpay reports this payment as ${payment.status}.` },
      { status: 409 },
    );
  }

  // What this order should have been paid at. `charged_paise` is stamped on
  // the order at creation and is BELOW the list price whenever a promo applied,
  // so it — not the catalogue figure — is what a discounted payment is measured
  // against. Missing or nonsensical notes fall back to the list price, which is
  // the safe direction: a human looks at it rather than a pack being granted
  // for a rupee.
  const expected = expectedPaise(payment.notes?.charged_paise, topup.pricePaise);

  if (payment.amount < expected) {
    return NextResponse.json(
      { error: "The amount paid does not match this pack." },
      { status: 409 },
    );
  }

  if (payment.order_id && payment.order_id !== body.data.orderId) {
    return NextResponse.json({ error: "That payment belongs to another order." }, { status: 400 });
  }

  const granted = await grantTopupCredits({
    ownerId: user.id,
    topup,
    orderId: body.data.orderId,
    paymentId: body.data.paymentId,
    amountPaise: payment.amount,
  });

  // Only count the promo once the pack is actually granted, and only on the
  // call that did the granting. The insert is idempotent; the redemption count
  // is not, so a webhook arriving afterwards must not count a second use.
  if (granted) {
    const promoCode = payment.notes?.promo_code;
    if (typeof promoCode === "string" && promoCode !== "") {
      await recordRedemption({
        promoCode,
        ownerId: user.id,
        target: "topup",
        discountPaise: Math.max(0, topup.pricePaise - payment.amount),
        reference: payment.id,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    // False means the webhook beat us to it, which is a success, not an error.
    granted,
    scrapes: topup.scrapes,
    balance: await getCreditBalance(),
  });
}

/** See the note at the call site. */
function expectedPaise(note: unknown, listPricePaise: number): number {
  if (typeof note !== "string") return listPricePaise;
  const parsed = Number.parseInt(note, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return listPricePaise;
  return Math.min(parsed, listPricePaise);
}
