"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BillingCycle } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import { useUpgrade } from "./use-upgrade";

/**
 * The workspace's upgrade button — shadcn styling, for inside the app.
 *
 * All of the actual behaviour lives in useUpgrade(), shared with the pricing
 * page's magnetic version. This file is deliberately only a shape.
 */
export function UpgradeButton({
  className,
  children = "Go Pro",
  variant = "default",
  cycle = "monthly",
  promoCode,
  onDone,
}: {
  className?: string;
  children?: React.ReactNode;
  variant?: "default" | "outline";
  cycle?: BillingCycle;
  promoCode?: string;
  onDone?: () => void;
}) {
  const { busy, start } = useUpgrade(onDone);

  return (
    <Button
      type="button"
      // Wrapped rather than passed directly: start() takes options, and a
      // click handler would hand it a MouseEvent as its first argument.
      onClick={() => start({ cycle, promoCode })}
      disabled={busy}
      variant={variant}
      className={cn(className)}
    >
      {busy && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
      {busy ? "Opening Razorpay…" : children}
    </Button>
  );
}
