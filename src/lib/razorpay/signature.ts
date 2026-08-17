import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay signature verification.
 *
 * Pure and dependency-free so it can be tested directly. The webhook route is
 * the only caller, and a route handler is awkward to unit test — exactly the
 * same reasoning as `lib/auth/messages.ts`.
 *
 * TWO DIFFERENT SIGNATURES, and mixing them up is the classic Razorpay bug:
 *
 *   verifyWebhookSignature  — proves a POST to our webhook came from Razorpay.
 *                             HMAC of the RAW request body, keyed by the
 *                             WEBHOOK secret.
 *   verifyCheckoutSignature — proves the success payload the BROWSER handed us
 *                             is genuine. HMAC of `payment_id|subscription_id`,
 *                             keyed by the API secret.
 *
 * There are in fact two flavours of the second kind, and their argument order
 * is REVERSED between them. This is not a typo, it is Razorpay's API:
 *
 *   subscriptions   payment_id | subscription_id
 *   orders          order_id   | payment_id      ← refill packs
 *
 * Getting either backwards fails every time and looks exactly like a bad
 * secret, which is why both directions are covered in the tests.
 */

/** Constant-time compare. Never `===` on a signature — that leaks by timing. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function hmacHex(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * @param rawBody The request body as the exact string Razorpay sent. Re-encoding
 *   a parsed object here changes the bytes and the signature will never match.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  webhookSecret: string,
): boolean {
  if (!signature || webhookSecret === "") return false;
  return safeEqual(hmacHex(rawBody, webhookSecret), signature);
}

export function verifyCheckoutSignature(
  {
    paymentId,
    subscriptionId,
  }: {
    paymentId: string;
    subscriptionId: string;
  },
  signature: string | null,
  keySecret: string,
): boolean {
  if (!signature || keySecret === "") return false;
  return safeEqual(hmacHex(`${paymentId}|${subscriptionId}`, keySecret), signature);
}

/**
 * Prove a one-off ORDER payment is genuine — the refill packs.
 *
 * Note `order|payment`, the reverse of the subscription case above. Razorpay
 * documents it this way and there is no reasoning to it beyond "that is what
 * the API does".
 */
export function verifyOrderSignature(
  {
    orderId,
    paymentId,
  }: {
    orderId: string;
    paymentId: string;
  },
  signature: string | null,
  keySecret: string,
): boolean {
  if (!signature || keySecret === "") return false;
  return safeEqual(hmacHex(`${orderId}|${paymentId}`, keySecret), signature);
}
