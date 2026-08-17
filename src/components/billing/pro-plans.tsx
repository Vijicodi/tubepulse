"use client";

import { useState } from "react";
import { Check, Minus } from "lucide-react";
import { MagneticButton } from "@/components/landing/magnetic-button";
import { TiltCard } from "@/components/landing/tilt-card";
import {
  PLANS,
  PRO_PRICES,
  formatRupees,
  perMonthRupees,
  spellOut,
  yearlySavingPercent,
  yearlySavingRupees,
  type BillingCycle,
} from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import { PromoField, type AppliedPromo } from "./promo-field";
import { useUpgrade } from "./use-upgrade";

/**
 * The two plan cards, plus the monthly/yearly switch and the promo field.
 *
 * A client component because the cycle toggle changes the displayed price, and
 * the price is the thing the whole page is arguing about — re-fetching a server
 * render to move a switch would put a network round trip in the middle of a
 * decision. Everything here is presentation over `plans.ts`; nothing
 * server-only is imported.
 *
 * THE ANNUAL PRICE IS SHOWN TWO WAYS, deliberately: the real charge (₹4,990,
 * once) and what it works out at per month (₹416). Showing only the monthly
 * equivalent is the trick where someone expects ₹416 to leave their account and
 * ₹4,990 does. Both numbers, always, with the actual charge stated plainly
 * underneath.
 */

const FREE = PLANS.free;
const PRO = PLANS.pro;

const SIGNUP_HREF = "/login?mode=signup&next=/pricing";

/**
 * Where a SIGNED-OUT "Go Pro" click goes.
 *
 * Sign IN, not sign up: someone clicking the paid plan is as likely to have an
 * account as not, and the sign-up form is the wrong door for half of them. The
 * chosen cycle rides in `next`, so a yearly click returns to a yearly card
 * rather than a monthly one showing a different price.
 */
function proSignInHref(cycle: BillingCycle): string {
  return `/login?next=${encodeURIComponent(`/pricing?cycle=${cycle}`)}`;
}

export function ProPlans({
  signedIn,
  isPro,
  canCheckout,
  canYearly,
  initialCycle = "monthly",
}: {
  signedIn: boolean;
  isPro: boolean;
  /** False when Razorpay keys are missing on this deploy. */
  canCheckout: boolean;
  /** False when the yearly Razorpay plan id is not configured. */
  canYearly: boolean;
  /** Preselected cycle, from ?cycle= after a signed-out Go Pro round trip. */
  initialCycle?: BillingCycle;
}) {
  const [cycle, setCycle] = useState<BillingCycle>(initialCycle);
  const [promo, setPromo] = useState<AppliedPromo | null>(null);
  const { busy, start } = useUpgrade();

  const price = PRO_PRICES[cycle];
  const live = signedIn && canCheckout && !isPro;

  // A code is priced against one cycle. Switching cycles invalidates it, so it
  // is dropped rather than left showing a discount that no longer applies.
  function changeCycle(next: BillingCycle) {
    setCycle(next);
    setPromo(null);
  }

  const finalPaise = promo ? promo.finalPaise : price.pricePaise;

  return (
    <>
      {canYearly && (
        <div className="mb-12 flex justify-center" data-reveal="up">
          <div
            role="tablist"
            aria-label="Billing period"
            className="glass-liquid border-border/40 inline-flex items-center gap-1 rounded-full border p-1"
          >
            {(["monthly", "yearly"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={cycle === option}
                onClick={() => changeCycle(option)}
                className={cn(
                  "relative rounded-full px-5 py-2 text-sm font-medium transition-colors",
                  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                  cycle === option
                    ? "bg-brand-gradient text-white"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option === "monthly" ? "Monthly" : "Yearly"}
                {option === "yearly" && (
                  <span
                    className={cn(
                      "ml-2 text-xs",
                      cycle === "yearly" ? "text-white/85" : "text-[var(--brand-2)]",
                    )}
                  >
                    −{yearlySavingPercent()}%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-4xl items-stretch gap-8 md:grid-cols-2">
        {/* ------------------------------------------------------------ free */}
        <div data-reveal="up" data-stagger className="group/tilt h-full">
          <TiltCard intensity={6} className="flex h-full flex-col p-9">
            <h2 className="font-display text-3xl">{FREE.name}</h2>

            <p className="text-muted-foreground mt-4 min-h-[3.5rem] text-sm leading-relaxed">
              Enough rope to find out whether median scoring changes how you pick
              videos.
            </p>

            <div className="mt-8 flex items-baseline gap-2">
              <span className="font-display text-6xl">
                {formatRupees(FREE.priceRupees)}
              </span>
              <span className="text-muted-foreground text-sm">
                {FREE.scrapes} scrapes, then we talk
              </span>
            </div>
            <p className="text-muted-foreground/60 mt-2 text-xs">
              No card. Nothing renews.
            </p>

            <div className="rule-brand mt-8 w-full opacity-40" aria-hidden />

            <ul className="mt-8 flex-1 space-y-4">
              {[
                `${FREE.scrapes} channel scrapes, one time`,
                `${FREE.videosPerScrape} videos read per scrape`,
                "Outlier scoring on every video",
                "No card, no countdown timer",
              ].map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm">
                  <Check className="text-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                  {feature}
                </li>
              ))}
              {["Web enrichment", "Transcript search"].map((feature) => (
                <li
                  key={feature}
                  className="text-muted-foreground/60 flex items-start gap-3 text-sm"
                >
                  <Minus className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {feature}
                </li>
              ))}
            </ul>

            <div className="mt-10">
              <MagneticButton
                href={signedIn ? "/projects" : SIGNUP_HREF}
                variant="glass"
                className="w-full"
              >
                {signedIn ? "Open your workspace" : `Take the ${spellOut(FREE.scrapes)}`}
              </MagneticButton>
            </div>
          </TiltCard>
        </div>

        {/* ------------------------------------------------------------- pro */}
        <div data-reveal="up" data-stagger className="group/tilt h-full">
          <TiltCard intensity={6} className="flex h-full flex-col p-9">
            <div className="rule-brand absolute inset-x-0 top-0" aria-hidden />

            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-3xl">{PRO.name}</h2>
              <span className="label-mono text-accent-gradient shrink-0">
                {isPro ? "Your plan" : "The one to pick"}
              </span>
            </div>

            <p className="text-muted-foreground mt-4 min-h-[3.5rem] text-sm leading-relaxed">
              For someone who researches a niche on purpose rather than on a whim.
            </p>

            <div className="mt-8 flex items-baseline gap-2">
              <span className="font-display text-6xl">
                {formatRupees(Math.round(perMonthRupees(price)))}
              </span>
              <span className="text-muted-foreground text-sm">per month</span>
            </div>

            {/* The real charge, never hidden behind the per-month figure. */}
            <p className="text-muted-foreground/70 mt-2 text-xs">
              {cycle === "yearly" ? (
                <>
                  Billed {formatRupees(price.priceRupees)} once a year — you save{" "}
                  {formatRupees(yearlySavingRupees())}.
                </>
              ) : (
                <>Billed {formatRupees(price.priceRupees)} every month.</>
              )}
            </p>

            {promo && (
              <p className="mt-2 text-xs text-[var(--brand-2)]">
                {promo.label} applied — {formatRupees(promo.originalPaise / 100)} →{" "}
                <strong>{formatRupees(finalPaise / 100)}</strong> on your first
                {cycle === "yearly" ? " year" : " month"}.
              </p>
            )}

            <div className="rule-brand mt-8 w-full opacity-40" aria-hidden />

            <ul className="mt-8 flex-1 space-y-4">
              {[
                `${PRO.scrapes} channel scrapes a month`,
                `${PRO.videosPerScrape} videos read per scrape`,
                "Web enrichment via Firecrawl",
                "Transcript search",
                "Cancel any time, in one click, from inside the app",
              ].map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm">
                  <Check className="text-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                  {feature}
                </li>
              ))}
            </ul>

            <div className="mt-10 space-y-4">
              {live ? (
                <MagneticButton
                  onClick={() => start({ cycle, promoCode: promo?.code })}
                  disabled={busy}
                  className="w-full"
                >
                  {busy ? "Opening Razorpay…" : "Go Pro"}
                </MagneticButton>
              ) : (
                <MagneticButton
                  href={!signedIn ? proSignInHref(cycle) : "/billing"}
                  className="w-full"
                >
                  {!signedIn ? "Go Pro" : isPro ? "Manage your plan" : "Go Pro"}
                </MagneticButton>
              )}

              {live && (
                <PromoField
                  target="subscription"
                  cycle={cycle}
                  applied={promo}
                  onApplied={setPromo}
                  disabled={busy}
                />
              )}
            </div>
          </TiltCard>
        </div>
      </div>
    </>
  );
}
