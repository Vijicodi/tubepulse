import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  verifyCheckoutSignature,
  verifyOrderSignature,
  verifyWebhookSignature,
} from "@/lib/razorpay/signature";

/**
 * These tests guard the door to the paid tier.
 *
 * The webhook is a public URL whose payload decides who is a paying customer.
 * If verification is ever broken — a refactor, a "cleanup" that swaps the
 * constant-time compare for `===`, a raw-body change — anyone who can POST to
 * the endpoint can grant themselves Pro. That failure would be silent in every
 * other check, because the app would work perfectly.
 */

const WEBHOOK_SECRET = "whsec_test_value_not_a_real_secret";
const KEY_SECRET = "key_secret_test_value";

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

describe("verifyWebhookSignature", () => {
  const body = JSON.stringify({
    event: "subscription.activated",
    payload: { subscription: { entity: { id: "sub_test123", status: "active" } } },
  });

  it("accepts a body signed with the webhook secret", () => {
    expect(verifyWebhookSignature(body, sign(body, WEBHOOK_SECRET), WEBHOOK_SECRET)).toBe(
      true,
    );
  });

  it("rejects a body that was altered after signing", () => {
    const signature = sign(body, WEBHOOK_SECRET);
    const tampered = body.replace("sub_test123", "sub_attacker");
    expect(verifyWebhookSignature(tampered, signature, WEBHOOK_SECRET)).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    expect(
      verifyWebhookSignature(body, sign(body, "some_other_secret"), WEBHOOK_SECRET),
    ).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyWebhookSignature(body, null, WEBHOOK_SECRET)).toBe(false);
  });

  it("rejects everything when the secret is unset", () => {
    // A deploy without RAZORPAY_WEBHOOK_SECRET must fail closed. Signing an
    // empty-secret HMAC is trivial, so "" can never be treated as valid.
    expect(verifyWebhookSignature(body, sign(body, ""), "")).toBe(false);
  });

  it("is not fooled by a truncated signature", () => {
    const signature = sign(body, WEBHOOK_SECRET);
    expect(verifyWebhookSignature(body, signature.slice(0, 32), WEBHOOK_SECRET)).toBe(
      false,
    );
  });

  it("is sensitive to whitespace, because the raw body is what is signed", () => {
    // The reason the webhook route reads request.text() and never re-stringifies
    // a parsed object: JSON.stringify(JSON.parse(body)) is a different string.
    const reformatted = JSON.stringify(JSON.parse(body), null, 2);
    expect(
      verifyWebhookSignature(reformatted, sign(body, WEBHOOK_SECRET), WEBHOOK_SECRET),
    ).toBe(false);
  });
});

describe("verifyCheckoutSignature", () => {
  const paymentId = "pay_test456";
  const subscriptionId = "sub_test123";
  const correct = sign(`${paymentId}|${subscriptionId}`, KEY_SECRET);

  it("accepts payment|subscription signed with the api secret", () => {
    expect(
      verifyCheckoutSignature({ paymentId, subscriptionId }, correct, KEY_SECRET),
    ).toBe(true);
  });

  it("rejects the reversed order", () => {
    // Razorpay uses order_id|payment_id for one-off orders and
    // payment_id|subscription_id for subscriptions. Swapping them is the
    // classic bug and looks exactly like a wrong secret.
    const reversed = sign(`${subscriptionId}|${paymentId}`, KEY_SECRET);
    expect(
      verifyCheckoutSignature({ paymentId, subscriptionId }, reversed, KEY_SECRET),
    ).toBe(false);
  });

  it("rejects a signature for a different subscription", () => {
    expect(
      verifyCheckoutSignature(
        { paymentId, subscriptionId: "sub_somebody_else" },
        correct,
        KEY_SECRET,
      ),
    ).toBe(false);
  });

  it("rejects everything when the secret is unset", () => {
    expect(verifyCheckoutSignature({ paymentId, subscriptionId }, correct, "")).toBe(
      false,
    );
  });
});

describe("verifyOrderSignature — the refill packs", () => {
  const orderId = "order_test789";
  const paymentId = "pay_test456";
  const correct = sign(`${orderId}|${paymentId}`, KEY_SECRET);

  it("accepts order|payment signed with the api secret", () => {
    expect(verifyOrderSignature({ orderId, paymentId }, correct, KEY_SECRET)).toBe(true);
  });

  it("rejects the subscription argument order", () => {
    // Orders are order|payment; subscriptions are payment|subscription. The two
    // flows sit next to each other in this codebase, so proving they are not
    // interchangeable is the point of this test.
    const swapped = sign(`${paymentId}|${orderId}`, KEY_SECRET);
    expect(verifyOrderSignature({ orderId, paymentId }, swapped, KEY_SECRET)).toBe(false);
  });

  it("rejects a signature belonging to a different order", () => {
    // Otherwise a ₹149 refill's signature could be replayed to claim a ₹449 one.
    expect(
      verifyOrderSignature({ orderId: "order_someone_else", paymentId }, correct, KEY_SECRET),
    ).toBe(false);
  });

  it("rejects a signature belonging to a different payment", () => {
    expect(
      verifyOrderSignature({ orderId, paymentId: "pay_other" }, correct, KEY_SECRET),
    ).toBe(false);
  });

  it("rejects everything when the secret is unset", () => {
    expect(verifyOrderSignature({ orderId, paymentId }, correct, "")).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(verifyOrderSignature({ orderId, paymentId }, null, KEY_SECRET)).toBe(false);
  });
});
