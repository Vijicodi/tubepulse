"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PAID_PLAN_KEYS,
  PLANS,
  PLAN_PRICES,
  formatUsd,
  perMonthUsd,
  yearlySavingPercent,
  yearlySavingUsd,
  type BillingCycle,
  type PaidPlanKey,
} from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import { PromoDisclosure } from "./promo-disclosure";
import { PromoField, type AppliedPromo } from "./promo-field";
import { useUpgrade } from "./use-upgrade";

/**
 * Upgrading from inside the app: pick a tier and a cycle, optionally add a
 * code, pay.
 *
 * The workspace equivalent of the pricing page's plan cards, minus the
 * marketing. Same hook, same routes — only the styling differs, which is the
 * rule this project keeps re-learning about duplicated flows.
 *
 * Both numbers are always visible on the yearly option: what it works out at
 * per month, and the amount that actually leaves the account. Quoting only the
 * first is how someone expecting $40 gets a $490 debit.
 */
export function UpgradeChoice({
  canYearly,
  currentPlan = null,
}: {
  canYearly: boolean;
  /** The tier they are on, so it is not offered back to them. */
  currentPlan?: PaidPlanKey | null;
}) {
  // Default to the tier most people should be on rather than the cheapest —
  // the same recommendation the pricing page makes.
  const [plan, setPlan] = useState<PaidPlanKey>("studio");
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [promo, setPromo] = useState<AppliedPromo | null>(null);
  const { busy, start } = useUpgrade();

  const price = PLAN_PRICES[plan][cycle];
  const options: BillingCycle[] = canYearly ? ["monthly", "yearly"] : ["monthly"];

  /**
   * A code is priced against ONE tier on ONE cycle, so changing either
   * invalidates it. Dropped rather than left showing a stale discount.
   */
  function changePlan(next: PaidPlanKey) {
    setPlan(next);
    setPromo(null);
  }

  function changeCycle(next: BillingCycle) {
    setCycle(next);
    setPromo(null);
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-[0.68rem] tracking-[0.18em] uppercase">
        Choose a plan
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        {PAID_PLAN_KEYS.map((key) => {
          const option = PLANS[key];
          const selected = plan === key;
          const isCurrent = currentPlan === key;

          return (
            <button
              key={key}
              type="button"
              onClick={() => changePlan(key)}
              aria-pressed={selected}
              disabled={isCurrent}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors",
                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "border-[var(--brand-2)] bg-[var(--brand-2)]/5"
                  : "border-border/60 hover:bg-muted/30",
              )}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{option.name}</span>
                {isCurrent && (
                  <span className="text-muted-foreground text-xs">current</span>
                )}
              </span>

              <span className="mt-2 block text-xl font-semibold tabular-nums">
                {formatUsd(option.priceUsd)}
                <span className="text-muted-foreground ml-1 text-xs font-normal">
                  /mo
                </span>
              </span>

              <span className="text-muted-foreground/70 mt-1 block text-xs">
                {option.runs} runs a month
              </span>
            </button>
          );
        })}
      </div>

      {canYearly && (
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((option) => {
            const optionPrice = PLAN_PRICES[plan][option];
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
                  {formatUsd(Math.round(perMonthUsd(optionPrice) * 100) / 100)}
                  <span className="text-muted-foreground ml-1 text-xs font-normal">
                    /month
                  </span>
                </span>

                <span className="text-muted-foreground/70 mt-1 block text-xs">
                  {option === "yearly"
                    ? `${formatUsd(optionPrice.priceUsd)} once a year`
                    : `${formatUsd(optionPrice.priceUsd)} every month`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {promo && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--brand-2)]">
            {promo.label} applied — {formatUsd(promo.originalCents / 100)} →{" "}
            <strong>{formatUsd(promo.finalCents / 100)}</strong>
            {/* How many cycles, read from the code itself rather than assumed.
                Hardcoding "your first month" here silently misdescribed a
                two-month promo as a one-month one. */}
            {promo.cyclesCovered === null
              ? ""
              : promo.cyclesCovered === 1
                ? ` on your first ${cycle === "yearly" ? "year" : "month"}.`
                : ` for your first ${promo.cyclesCovered} ${
                    cycle === "yearly" ? "years" : "months"
                  }.`}
          </p>

          {/* The full before/after breakdown. Not optional and not dim: this
              is what makes taking a card before the price rises an informed
              agreement rather than a surprise. */}
          <PromoDisclosure
            cyclesCovered={promo.cyclesCovered}
            discountedCents={promo.finalCents}
            renewsAtCents={promo.renewsAtCents ?? price.priceCents}
            cycle={cycle}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="button"
          disabled={busy}
          onClick={() => start({ plan, cycle, promoCode: promo?.code })}
        >
          {busy && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
          {busy
            ? "Opening Razorpay…"
            : `Get ${PLANS[plan].name} — ${formatUsd(
                (promo ? promo.finalCents : price.priceCents) / 100,
              )}${cycle === "yearly" ? "/yr" : "/mo"}`}
        </Button>

        <PromoField
          target="subscription"
          plan={plan}
          cycle={cycle}
          applied={promo}
          onApplied={setPromo}
          disabled={busy}
        />
      </div>

      {canYearly && cycle === "yearly" && (
        <p className="text-muted-foreground/70 text-xs">
          Twelve months for the price of ten — {formatUsd(yearlySavingUsd(plan))} less
          than paying monthly. Charged once, then again next year.
        </p>
      )}
    </div>
  );
}
