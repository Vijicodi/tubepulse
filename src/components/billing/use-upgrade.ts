"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { BillingCycle, PaidPlanKey } from "@/lib/billing/plans";
import { brandColour, loadRazorpay } from "./razorpay-checkout";

/**
 * The upgrade flow, in one place.
 *
 * Two buttons open Razorpay — the shadcn one on the billing page and the
 * magnetic one on the pricing page — and they must behave identically. The
 * Apify ingest already taught this project what happens when the same procedure
 * is written twice: the copies drift and only one machine reproduces the bug.
 * So the visuals differ and the logic does not.
 *
 * THE FLOW, and why each step exists:
 *
 *   1. POST /api/billing/checkout — the SERVER creates the subscription. The
 *      browser never states what it is paying for, or it would ask for ₹1.
 *   2. Razorpay's popup takes the autopay authorisation. No card or UPI detail
 *      touches this codebase, which is the whole point of using a gateway.
 *   3. POST /api/billing/sync on success. Their handler fires the moment the
 *      mandate is approved — usually before the webhook lands, and on localhost
 *      the webhook never lands at all. This is what makes the page say "Pro"
 *      straight away instead of looking broken.
 *
 * The success payload is deliberately not trusted to grant anything: it is a
 * message from a browser. Step 3 asks Razorpay's own API instead.
 */

export function useUpgrade(onDone?: () => void) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  /**
   * Razorpay hands its handler a payment id, subscription id and signature.
   * We take none of them. A browser saying "I paid" is not evidence, so this
   * asks Razorpay's own API through /api/billing/sync instead — which is also
   * the only path that works when the webhook cannot reach us.
   */
  async function confirm() {
    try {
      await fetch("/api/billing/sync", { method: "POST" });
      toast.success("You are on Pro. Autopay is set up and renews by itself.");
      onDone?.();
      router.refresh();
    } catch {
      toast.success(
        "Payment authorised. It may take a moment to appear — hit Refresh on the billing page.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function start(options: {
    plan: PaidPlanKey;
    cycle?: BillingCycle;
    promoCode?: string;
  }) {
    setBusy(true);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: options.plan,
          cycle: options.cycle ?? "monthly",
          promoCode: options.promoCode,
        }),
      });

      const data = (await response.json()) as {
        subscriptionId?: string;
        keyId?: string;
        planName?: string;
        cycle?: BillingCycle;
        email?: string;
        error?: string;
      };

      if (!response.ok || !data.subscriptionId || !data.keyId) {
        toast.error(data.error ?? "Could not start the upgrade.");
        setBusy(false);
        return;
      }

      const Razorpay = await loadRazorpay();

      const checkout = new Razorpay({
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: "TubePulse",
        description:
          data.cycle === "yearly"
            ? `${data.planName ?? "TubePulse"} — billed yearly, cancel any time`
            : `${data.planName ?? "TubePulse"} — billed monthly, cancel any time`,
        prefill: { email: data.email ?? "" },
        theme: { color: brandColour() },
        handler: () => {
          void confirm();
        },
        modal: {
          // Closing the popup is not a failure. The subscription stays in
          // 'created' at Razorpay and expires if it is never authorised.
          ondismiss: () => {
            setBusy(false);
            toast("Upgrade cancelled. Nothing was charged.");
          },
        },
      });

      checkout.on("payment.failed", (payload: unknown) => {
        setBusy(false);
        toast.error(describeFailure(payload));
      });

      checkout.open();
    } catch (error) {
      setBusy(false);
      toast.error(
        error instanceof Error ? error.message : "Could not open the payment window.",
      );
    }
  }

  return {
    busy,
    start: (options: {
      plan: PaidPlanKey;
      cycle?: BillingCycle;
      promoCode?: string;
    }) => void start(options),
  };
}

/** Razorpay's failure payload nests its human-readable reason three deep. */
function describeFailure(payload: unknown): string {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const error = (payload as { error: unknown }).error;
    if (typeof error === "object" && error !== null && "description" in error) {
      const description = (error as { description: unknown }).description;
      if (typeof description === "string" && description !== "") return description;
    }
  }
  return "The payment did not go through. Nothing was charged.";
}
