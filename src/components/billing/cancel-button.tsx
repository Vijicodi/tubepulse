"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Cancel Pro.
 *
 * Two clicks, on purpose. Cancelling a subscription is irreversible in the
 * sense that re-subscribing means authorising a fresh mandate, so a stray click
 * should not do it — but the confirmation is inline and one step, not a
 * three-screen retention funnel. The pricing page promises "any time"; making
 * it deliberately annoying would be a lie told through UX.
 */

export function CancelButton({ endsOn }: { endsOn: string | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);

    try {
      const response = await fetch("/api/billing/cancel", { method: "POST" });
      const data = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        toast.error(data.error ?? "Could not cancel. Nothing has changed.");
        return;
      }

      toast.success(data.message ?? "Cancelled. Autopay is off.");
      setConfirming(false);
      router.refresh();
    } catch {
      toast.error("Could not reach the server. Nothing has changed.");
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => setConfirming(true)}
      >
        Cancel subscription
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-muted-foreground text-sm">
        {endsOn
          ? "Autopay stops immediately. You keep Pro for the rest of this paid period."
          : "This turns off autopay at Razorpay."}
      </p>
      <Button type="button" variant="destructive" disabled={busy} onClick={() => void cancel()}>
        {busy && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
        {busy ? "Cancelling…" : "Yes, cancel"}
      </Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
        Keep Pro
      </Button>
    </div>
  );
}
