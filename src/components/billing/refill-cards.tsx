"use client";

import { useState } from "react";
import { Loader2, Zap } from "lucide-react";
import { TOPUP_LIST, formatRupees, perScrapeRupees, type TopupKey } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import { PromoField, type AppliedPromo } from "./promo-field";
import { useTopup } from "./use-topup";

/**
 * The refill packs, as buyable cards.
 *
 * One component for both surfaces — the pricing page and `/billing` — with
 * `tone` switching the styling. The two pages showing different refill prices
 * is precisely the class of bug this project keeps writing rules against, and
 * the cheapest way to make it impossible is to have one component.
 *
 * The per-scrape figure is rendered, not written. It is the argument for why
 * the subscription is better value, and an argument a customer can check in
 * their head has to be arithmetic rather than copy.
 */
export function RefillCards({
  signedIn,
  canCheckout,
  tone = "app",
}: {
  signedIn: boolean;
  /** False when Razorpay keys are missing on this deploy. */
  canCheckout: boolean;
  /** "landing" borrows the marketing page's glass; "app" the workspace surface. */
  tone?: "landing" | "app";
}) {
  const { pending, buy } = useTopup();
  const [promos, setPromos] = useState<Partial<Record<TopupKey, AppliedPromo>>>({});
  const live = signedIn && canCheckout;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {TOPUP_LIST.map((pack) => {
        const busy = pending === pack.key;
        // A code is priced against one pack, so each card holds its own.
        const promo = promos[pack.key] ?? null;

        return (
          <div
            key={pack.key}
            className={cn(
              "flex flex-col gap-5 rounded-2xl p-6",
              tone === "landing"
                ? "glass-liquid border-border/40 border"
                : "surface-raised",
            )}
          >
            <div className="flex items-start gap-4">
              <span className="bg-brand-gradient grid size-11 shrink-0 place-items-center rounded-xl text-white">
                <Zap className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "font-semibold tracking-tight",
                    tone === "landing" ? "font-display text-2xl" : "text-lg",
                  )}
                >
                  {pack.name}
                </p>
                <p className="text-muted-foreground text-sm">
                  {pack.scrapes} extra scrapes · never expire
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 font-semibold tabular-nums",
                  tone === "landing" ? "font-display text-3xl" : "text-2xl",
                )}
              >
                {promo ? (
                  <>
                    <span className="text-muted-foreground/60 mr-2 text-base line-through">
                      {formatRupees(pack.priceRupees)}
                    </span>
                    {formatRupees(promo.finalPaise / 100)}
                  </>
                ) : (
                  formatRupees(pack.priceRupees)
                )}
              </span>
            </div>

            <p className="text-muted-foreground/80 text-xs leading-relaxed">
              {pack.blurb} That is {formatRupees(Math.round(perScrapeRupees(pack)))} a
              scrape.
            </p>

            {live ? (
              <div className="mt-auto space-y-3">
              <button
                type="button"
                onClick={() => buy(pack.key, promo?.code)}
                disabled={busy}
                className={cn(
                  "border-border/60 hover:bg-muted/40 inline-flex h-10 w-full items-center justify-center rounded-full border text-sm font-medium transition-colors",
                  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                {busy && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
                {busy ? "Opening Razorpay…" : `Buy ${pack.name.toLowerCase()}`}
              </button>

              <PromoField
                target="topup"
                pack={pack.key}
                applied={promo}
                onApplied={(next) =>
                  setPromos((current) => ({ ...current, [pack.key]: next ?? undefined }))
                }
                disabled={busy}
              />
              </div>
            ) : (
              <p className="text-muted-foreground/70 mt-auto text-xs">
                {signedIn
                  ? "Refills need Razorpay configured on this deploy."
                  : "Sign in to buy a refill."}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
