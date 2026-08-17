"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Force a reconcile with Razorpay.
 *
 * Exists for the same reason the scrape job has a poll button: webhooks need a
 * public URL, and a laptop is not one. Someone who authorises autopay locally
 * would otherwise stare at "free" and assume the payment failed.
 *
 * In production it is the self-service fix for a missed delivery — the user
 * repairs their own account rather than emailing support.
 */

export function RefreshBillingButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function sync() {
    setBusy(true);
    try {
      const response = await fetch("/api/billing/sync", { method: "POST" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) toast.error(data.error ?? "Could not reach Razorpay.");
      else toast.success("Checked with Razorpay.");
      router.refresh();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void sync()}>
      <RefreshCw className={busy ? "mr-2 size-3.5 animate-spin" : "mr-2 size-3.5"} aria-hidden />
      {busy ? "Checking…" : "Refresh"}
    </Button>
  );
}
