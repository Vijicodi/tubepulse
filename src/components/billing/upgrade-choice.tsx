"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PRO_PRICES,
  formatRupees,
  perMonthRupees,
  yearlySavingPercent,
  yearlySavingRupees,
  type BillingCycle,
} from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import { PromoField, type AppliedPromo } from "./promo-field";
import { useUpgrade } from "./use-upgrade";

/**
 * Upgrading from inside the app: pick a cycle, optionally add a code, pay.
 *
 * The workspace equivalent of the pricing page's plan cards, minus the
 * marketing. Same hook, same routes — only the styling differs, which is the
 * rule this project keeps re-learning about duplicated flows.
 *
 * Both numbers are always visible on the yearly option: what it works out at
 * per month, and the amount that actually leaves the account. Quoting only the
 * first is how someone expecting ₹416 gets a ₹4,990 debit.
 */
export function UpgradeChoice({ canYearly }: { canYearly: boolean }) {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [promo, setPromo] = useState<AppliedPromo | null>(null);
  const { busy, start } = useUpgrade();

  const price = PRO_PRICES[cycle];
  const options: BillingCycle[] = canYearly ? ["monthly", "yearly"] : ["monthly"];

  // A code is priced against one cycle, so switching invalidates it.
  function changeCycle(next: BillingCycle) {
    setCycle(next);
    setPromo(null);
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-[0.68rem] tracking-[0.18em] uppercase">
        Upgrade to Pro
      </p>

      {canYearly && (
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((option) => {
            const optionPrice = PRO_PRICES[option];
            const selected = cycle === option;

            return (
              <button
                key={option}
                type="button"
                onClick={() => changeCycle(option)}
                aria-pressed={selected}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                  selected
                    ? "border-[var(--brand-2)] bg-[var(--brand-2)]/5"
                    : "border-border/60 hover:bg-muted/30",
                )}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">
                    {option === "monthly" ? "Monthly" : "Yearly"}
                  </span>
                  {option === "yearly" && (
                    <span className="text-xs font-medium text-[var(--brand-2)]">
                      save {yearlySavingPercent()}%
                    </span>
                  )}
                </span>

                <span className="mt-2 block text-xl font-semibold tabular-nums">
                  {formatRupees(Math.round(perMonthRupees(optionPrice)))}
                  <span className="text-muted-foreground ml-1 text-xs font-normal">
                    /month
                  </span>
                </span>

                <span className="text-muted-foreground/70 mt-1 block text-xs">
                  {option === "yearly"
                    ? `${formatRupees(optionPrice.priceRupees)} once a year`
                    : `${formatRupees(optionPrice.priceRupees)} every month`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {promo && (
        <p className="text-xs text-[var(--brand-2)]">
          {promo.label} applied — {formatRupees(promo.originalPaise / 100)} →{" "}
          <strong>{formatRupees(promo.finalPaise / 100)}</strong> on your first{" "}
          {cycle === "yearly" ? "year" : "month"}.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="button"
          disabled={busy}
          onClick={() => start({ cycle, promoCode: promo?.code })}
        >
          {busy && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
          {busy
            ? "Opening Razorpay…"
            : `Go Pro — ${formatRupees((promo ? promo.finalPaise : price.pricePaise) / 100)}${
                cycle === "yearly" ? "/yr" : "/mo"
              }`}
        </Button>

        <PromoField
          target="subscription"
          cycle={cycle}
          applied={promo}
          onApplied={setPromo}
          disabled={busy}
        />
      </div>

      {canYearly && cycle === "yearly" && (
        <p className="text-muted-foreground/70 text-xs">
          Twelve months for the price of ten — {formatRupees(yearlySavingRupees())}{" "}
          less than paying monthly. Charged once, then again next year.
        </p>
      )}
    </div>
  );
}
