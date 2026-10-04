import { describe, expect, it } from "vitest";
import { MIN_REFUND_PAISE, unusedRefundPaise } from "@/lib/billing/switch";

const start = new Date("2026-10-01T00:00:00Z");
const end = new Date("2026-10-31T00:00:00Z"); // 30 days

describe("unusedRefundPaise — refund the days not yet used", () => {
  it("refunds two thirds of a ₹499 month switched on day 10", () => {
    const now = new Date("2026-10-11T00:00:00Z");
    expect(unusedRefundPaise({ amountPaidPaise: 49_900, periodStart: start, periodEnd: end, now })).toBe(33_266);
  });

  it("refunds everything when switched the moment the period began", () => {
    expect(unusedRefundPaise({ amountPaidPaise: 49_900, periodStart: start, periodEnd: end, now: start })).toBe(49_900);
  });

  it("never refunds more than was paid, even with a clock before the period", () => {
    const early = new Date("2026-09-20T00:00:00Z");
    expect(unusedRefundPaise({ amountPaidPaise: 49_900, periodStart: start, periodEnd: end, now: early })).toBe(49_900);
  });

  it("refunds nothing once the period is over", () => {
    const after = new Date("2026-11-02T00:00:00Z");
    expect(unusedRefundPaise({ amountPaidPaise: 49_900, periodStart: start, periodEnd: end, now: after })).toBe(0);
  });

  it("skips refunds under ₹1", () => {
    const lastMinute = new Date(end.getTime() - 60_000);
    expect(unusedRefundPaise({ amountPaidPaise: 49_900, periodStart: start, periodEnd: end, now: lastMinute })).toBe(0);
    expect(MIN_REFUND_PAISE).toBe(100);
  });

  it("refunds nothing on nonsense input", () => {
    expect(unusedRefundPaise({ amountPaidPaise: 0, periodStart: start, periodEnd: end, now: start })).toBe(0);
    expect(unusedRefundPaise({ amountPaidPaise: 49_900, periodStart: end, periodEnd: start, now: start })).toBe(0);
  });
});

import { actionForSubscriptionEvent } from "@/lib/billing/switch";

describe("actionForSubscriptionEvent — which events may change a row", () => {
  const current = { razorpay_subscription_id: "sub_old", switch_subscription_id: "sub_new" };

  it("completes a switch once the new subscription is paid", () => {
    expect(actionForSubscriptionEvent(current, "sub_new", "authenticated")).toBe("complete-switch");
    expect(actionForSubscriptionEvent(current, "sub_new", "active")).toBe("complete-switch");
  });

  it("waits while the new subscription is still being set up", () => {
    expect(actionForSubscriptionEvent(current, "sub_new", "created")).toBe("wait");
    expect(actionForSubscriptionEvent(current, "sub_new", "pending")).toBe("wait");
  });

  it("drops a switch whose new subscription failed, keeping the current plan", () => {
    expect(actionForSubscriptionEvent(current, "sub_new", "halted")).toBe("drop-switch");
    expect(actionForSubscriptionEvent(current, "sub_new", "cancelled")).toBe("drop-switch");
  });

  it("cancels and refunds a PAID subscription that nothing references any more", () => {
    // An abandoned switch (or first checkout) authorised later from an old
    // tab: a live mandate charging every month with no plan behind it.
    const row = { razorpay_subscription_id: "sub_current", switch_subscription_id: "sub_newer" };
    expect(actionForSubscriptionEvent(row, "sub_forgotten", "authenticated")).toBe("cancel-stray");
    expect(actionForSubscriptionEvent(row, "sub_forgotten", "active")).toBe("cancel-stray");
  });

  it("NEVER lets the replaced plan's cancel event cancel the new plan", () => {
    const afterSwitch = { razorpay_subscription_id: "sub_new", switch_subscription_id: null };
    expect(actionForSubscriptionEvent(afterSwitch, "sub_old", "cancelled")).toBe("ignore-superseded");
  });

  it("ignores late events from an abandoned checkout", () => {
    const row = { razorpay_subscription_id: "sub_current", switch_subscription_id: null };
    expect(actionForSubscriptionEvent(row, "sub_abandoned", "created")).toBe("ignore-superseded");
  });

  it("records events for the current subscription, and for a first-ever one", () => {
    const row = { razorpay_subscription_id: "sub_current", switch_subscription_id: null };
    expect(actionForSubscriptionEvent(row, "sub_current", "charged")).toBe("record");
    expect(actionForSubscriptionEvent(null, "sub_first", "authenticated")).toBe("record");
  });
});
