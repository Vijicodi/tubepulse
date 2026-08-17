import { z } from "zod";

/**
 * Razorpay's responses, at the trust boundary.
 *
 * Same rule as the Apify schemas: nothing from an external API reaches the
 * database without passing through zod first. See docs/decisions/0003.
 *
 * `.nullish()` rather than `.optional()` on the soft fields, for the reason
 * already written down about Apify — a JSON API that omits a key today will
 * send you an explicit `null` tomorrow, and `.optional()` rejects it.
 */

/** Unix seconds → ISO string, or null. Razorpay dates are all epoch seconds. */
export const epochSeconds = z
  .number()
  .int()
  .nullish()
  .transform((value) =>
    value === null || value === undefined ? null : new Date(value * 1000).toISOString(),
  );

export const razorpaySubscriptionSchema = z.object({
  id: z.string().min(1),
  entity: z.literal("subscription").optional(),
  plan_id: z.string().nullish(),
  customer_id: z.string().nullish(),
  status: z.string().min(1),
  current_start: epochSeconds,
  current_end: epochSeconds,
  ended_at: epochSeconds,
  charge_at: epochSeconds,
  short_url: z.string().nullish(),
  notes: z.record(z.string(), z.unknown()).nullish(),
});

export type RazorpaySubscription = z.infer<typeof razorpaySubscriptionSchema>;

export const razorpayPlanSchema = z.object({
  id: z.string().min(1),
  period: z.string(),
  interval: z.number().int(),
  item: z.object({
    name: z.string(),
    amount: z.number().int(),
    currency: z.string(),
  }),
});

/**
 * A one-off order — the refill packs.
 *
 * `amount` is in paise and is checked against our catalogue before any credit
 * is granted. Razorpay echoes back what it was asked for, but the amount is the
 * thing that decides how many scrapes someone gets, so it is verified rather
 * than trusted.
 */
export const razorpayOrderSchema = z.object({
  id: z.string().min(1),
  entity: z.literal("order").optional(),
  amount: z.number().int(),
  amount_paid: z.number().int().nullish(),
  currency: z.string(),
  status: z.string(),
  receipt: z.string().nullish(),
  notes: z.record(z.string(), z.unknown()).nullish(),
});

export type RazorpayOrder = z.infer<typeof razorpayOrderSchema>;

export const razorpayPaymentSchema = z.object({
  id: z.string().min(1),
  entity: z.literal("payment").optional(),
  order_id: z.string().nullish(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.string(),
  email: z.string().nullish(),
  notes: z.record(z.string(), z.unknown()).nullish(),
});

export type RazorpayPayment = z.infer<typeof razorpayPaymentSchema>;

/**
 * The webhook envelope.
 *
 * Only the subscription entity is read. Razorpay nests entities under
 * `payload.<entity>.entity`, which reads like a typo but is genuinely the
 * shape: `payload.subscription.entity` is the subscription itself.
 */
export const razorpayWebhookSchema = z.object({
  event: z.string().min(1),
  created_at: z.number().int().nullish(),
  payload: z.object({
    subscription: z
      .object({ entity: razorpaySubscriptionSchema })
      .nullish(),
    payment: z.object({ entity: razorpayPaymentSchema }).nullish(),
    order: z.object({ entity: razorpayOrderSchema }).nullish(),
  }),
});

export type RazorpayWebhook = z.infer<typeof razorpayWebhookSchema>;

/**
 * Razorpay's status strings, narrowed to the enum the database accepts.
 *
 * Anything unrecognised becomes 'created' rather than throwing: an unknown
 * status must not be able to take down the webhook, and 'created' is the one
 * value that grants no access.
 */
const KNOWN = [
  "created",
  "authenticated",
  "active",
  "pending",
  "halted",
  "cancelled",
  "completed",
  "expired",
] as const;

export type KnownSubscriptionStatus = (typeof KNOWN)[number];

export function toSubscriptionStatus(raw: string): KnownSubscriptionStatus {
  const found = KNOWN.find((status) => status === raw.toLowerCase());
  return found ?? "created";
}
