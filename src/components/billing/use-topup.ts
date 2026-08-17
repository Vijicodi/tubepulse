"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { TopupKey } from "@/lib/billing/plans";
import { brandColour, loadRazorpay, type RazorpaySuccess } from "./razorpay-checkout";

/**
 * Buying a refill pack.
 *
 * Deliberately a sibling of useUpgrade() rather than a branch inside it. The
 * two flows are different Razorpay products — Orders here, Subscriptions there
 * — with different checkout options, a different signature format and a
 * different confirmation route. Merging them would produce one function full of
 * `if (isSubscription)`, which is how the wrong branch ends up taking someone's
 * money.
 *
 * THE FLOW
 *   1. POST /api/billing/topup — the SERVER creates the order at the catalogue
 *      price. The browser names a PACK, never an amount.
 *   2. Razorpay's popup takes the payment.
 *   3. POST /api/billing/topup/confirm with the signature Razorpay handed back.
 *      The server re-verifies it and asks Razorpay whether the money actually
 *      arrived before granting a single scrape.
 *
 * Step 3 is the polling twin of the `order.paid` webhook, for the same reason
 * the scrape job has one: a webhook cannot reach localhost, and someone who has
 * just paid should not be told to wait.
 */

export function useTopup() {
  const router = useRouter();
  const [pending, setPending] = useState<TopupKey | null>(null);

  async function confirm(pack: TopupKey, success: RazorpaySuccess) {
    try {
      const response = await fetch("/api/billing/topup/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pack,
          orderId: success.razorpay_order_id ?? "",
          paymentId: success.razorpay_payment_id,
          signature: success.razorpay_signature,
        }),
      });

      const data = (await response.json()) as {
        scrapes?: number;
        balance?: number;
        error?: string;
      };

      if (!response.ok) {
        // The money left their account, so this must never read as "failed".
        toast.error(
          `${data.error ?? "We could not confirm that payment."} Your payment is safe — press Refresh on the billing page.`,
        );
        return;
      }

      toast.success(
        `${data.scrapes ?? 0} scrapes added.${
          typeof data.balance === "number" ? ` Balance: ${data.balance}.` : ""
        }`,
      );
      router.refresh();
    } catch {
      toast.error(
        "Paid, but we could not reach the server to confirm. Press Refresh on the billing page.",
      );
    } finally {
      setPending(null);
    }
  }

  async function buy(pack: TopupKey, promoCode?: string) {
    setPending(pack);

    try {
      const response = await fetch("/api/billing/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack, promoCode }),
      });

      const data = (await response.json()) as {
        orderId?: string;
        keyId?: string;
        packName?: string;
        scrapes?: number;
        email?: string;
        error?: string;
      };

      if (!response.ok || !data.orderId || !data.keyId) {
        toast.error(data.error ?? "Could not start the purchase.");
        setPending(null);
        return;
      }

      const Razorpay = await loadRazorpay();

      const checkout = new Razorpay({
        key: data.keyId,
        order_id: data.orderId,
        name: "TubePulse",
        description: `${data.packName ?? "Refill"} — ${data.scrapes ?? 0} scrapes, never expire`,
        prefill: { email: data.email ?? "" },
        theme: { color: brandColour() },
        handler: (success) => {
          void confirm(pack, success);
        },
        modal: {
          ondismiss: () => {
            setPending(null);
            toast("Purchase cancelled. Nothing was charged.");
          },
        },
      });

      checkout.on("payment.failed", () => {
        setPending(null);
        toast.error("The payment did not go through. Nothing was charged.");
      });

      checkout.open();
    } catch (error) {
      setPending(null);
      toast.error(
        error instanceof Error ? error.message : "Could not open the payment window.",
      );
    }
  }

  return {
    pending,
    buy: (pack: TopupKey, promoCode?: string) => void buy(pack, promoCode),
  };
}
