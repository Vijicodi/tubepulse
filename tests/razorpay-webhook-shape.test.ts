import { describe, expect, it } from "vitest";
import {
  razorpayOrderSchema,
  razorpayPaymentSchema,
  razorpaySubscriptionSchema,
  razorpayWebhookSchema,
} from "@/lib/razorpay/schemas";

/**
 * Razorpay serialises an EMPTY `notes` as `[]`, not `{}` (a PHP-ism). Their own
 * documented `subscription.charged` sample does it on the payment entity, and a
 * payment almost never carries notes — so every real charge looked like this.
 *
 * Until 2026-10-04 the schema accepted only an object, and every first charge
 * and renewal was answered "400 Malformed payload". Razorpay retries for a day
 * and then DISABLES the webhook, which silently takes halted/cancelled with it.
 */
const chargedSample = {
  entity: "event",
  account_id: "acc_test",
  event: "subscription.charged",
  contains: ["subscription", "payment"],
  payload: {
    subscription: {
      entity: {
        id: "sub_test",
        entity: "subscription",
        plan_id: "plan_test",
        customer_id: "cust_test",
        status: "active",
        current_start: 1_759_570_000,
        current_end: 1_762_248_400,
        ended_at: null,
        quantity: 1,
        notes: { owner_id: "00000000-0000-0000-0000-000000000000", plan_key: "creator" },
        charge_at: 1_762_248_400,
        start_at: 1_759_570_000,
        end_at: 2_051_222_400,
        auth_attempts: 0,
        total_count: 120,
        paid_count: 1,
        customer_notify: true,
        created_at: 1_759_569_900,
        expire_by: null,
        short_url: null,
        has_scheduled_changes: false,
        change_scheduled_at: null,
        source: "api",
        offer_id: null,
        remaining_count: 119,
      },
    },
    payment: {
      entity: {
        id: "pay_test",
        entity: "payment",
        amount: 49_900,
        currency: "INR",
        status: "captured",
        order_id: "order_test",
        invoice_id: "inv_test",
        international: false,
        method: "upi",
        amount_refunded: 0,
        refund_status: null,
        captured: true,
        description: "Recurring Payment via Subscription",
        card_id: null,
        bank: null,
        wallet: null,
        vpa: "someone@upi",
        email: "someone@example.com",
        contact: "+919999999999",
        customer_id: "cust_test",
        token_id: "token_test",
        notes: [],
        fee: 998,
        tax: 152,
        error_code: null,
        error_description: null,
        acquirer_data: { rrn: "123" },
        created_at: 1_759_570_010,
      },
    },
  },
  created_at: 1_759_570_011,
};

describe("Razorpay sends empty notes as []", () => {
  it("accepts Razorpay's own subscription.charged shape", () => {
    const parsed = razorpayWebhookSchema.safeParse(chargedSample);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.payload.payment?.entity.notes).toEqual({});
    expect(parsed.data?.payload.subscription?.entity.notes).toMatchObject({ plan_key: "creator" });
  });

  it.each([
    ["subscription", razorpaySubscriptionSchema, { id: "sub_x", status: "active" }],
    ["payment", razorpayPaymentSchema, { id: "pay_x", amount: 1, currency: "INR", status: "captured" }],
    ["order", razorpayOrderSchema, { id: "order_x", amount: 1, currency: "INR", status: "paid" }],
  ] as const)("%s: [] becomes {}, null stays null, objects pass through", (_name, schema, base) => {
    expect(schema.parse({ ...base, notes: [] }).notes).toEqual({});
    expect(schema.parse({ ...base, notes: null }).notes).toBeNull();
    expect(schema.parse({ ...base, notes: { a: "1" } }).notes).toEqual({ a: "1" });
  });

  it("still rejects a non-empty array — that is not a notes object", () => {
    expect(
      razorpayPaymentSchema.safeParse({
        id: "pay_x", amount: 1, currency: "INR", status: "captured", notes: ["x"],
      }).success,
    ).toBe(false);
  });
});
