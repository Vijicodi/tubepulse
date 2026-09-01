"use client";

import { useState } from "react";
import { Check, Minus } from "lucide-react";
import { MagneticButton } from "@/components/landing/magnetic-button";
import { TiltCard } from "@/components/landing/tilt-card";
import {
  HIGHLIGHTED_PLAN,
  PAID_PLAN_KEYS,
  PLANS,
  PLAN_PRICES,
  formatUsd,
  perMonthUsd,
  spellOut,
  yearlySavingPercent,
  yearlySavingUsd,
  type BillingCycle,
  type PaidPlanKey,
  type Plan,
} from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import { PromoDisclosure } from "./promo-disclosure";
import { PromoField, type AppliedPromo } from "./promo-field";
import { useUpgrade } from "./use-upgrade";

/**
 * The four plan cards, plus the monthly/yearly switch and the promo field.
 *
 * A client component because the cycle toggle changes the displayed price, and
 * the price is the thing the whole page is arguing about — re-fetching a server
 * render to move a switch would put a network round trip in the middle of a
 * decision. Everything here is presentation over `plans.ts`; nothing
 * server-only is imported.
 *
 * THE ANNUAL PRICE IS SHOWN TWO WAYS, deliberately: the real charge ($490,
 * once) and what it works out at per month ($40.83). Showing only the monthly
 * equivalent is the trick where someone expects $40.83 to leave their account
 * and $490 does. Both numbers, always, with the actual charge stated plainly
 * underneath.
 *
 * FOUR CARDS, NOT TWO, so the grid is driven off PAID_PLAN_KEYS rather than
 * written out per tier. Adding a fifth tier should be a plans.ts edit, not a
 * fifth copy of a card with one word changed.
 */

const FREE = PLANS.free;

const SIGNUP_HREF = "/login?mode=signup&next=/pricing";

/**
 * Where a SIGNED-OUT plan click goes.
 *
 * Sign IN, not sign up: someone clicking a paid plan is as likely to have an
 * account as not, and the sign-up form is the wrong door for half of them. The
 * chosen tier and cycle ride in `next`, so the round trip returns to the card
 * they actually pressed rather than a different price.
 */
function planSignInHref(planKey: PaidPlanKey, cycle: BillingCycle): string {
  return `/login?next=${encodeURIComponent(`/pricing?plan=${planKey}&cycle=${cycle}`)}`;
}

/**
 * The feature lines under each tier, in the order they earn the upgrade.
 *
 * Written here rather than in plans.ts because these are sentences for a
 * pricing page, and plans.ts holds the facts they are derived from. Every line
 * that states a NUMBER reads it from the plan, so a card can never advertise an
 * allowance the quota does not grant.
 */
function includedIn(plan: Plan): string[] {
  const lines = [
    `${plan.runs} research runs a month`,
    `${plan.videosPerRun} videos read per run`,
  ];

  if (plan.features.instagram) {
    lines.push(`Instagram research, ${plan.postsPerRun} posts a run`);
  }

  lines.push(
    plan.model === "premium"
      ? "Advanced reasoning model"
      : "Fast model, built for volume",
  );

  if (plan.features.titleVariants) lines.push("Title variants on every idea");
  if (plan.features.thumbnailConcepts) lines.push("Thumbnail concepts");
  if (plan.features.transcripts) lines.push("Transcripts and summaries");
  if (plan.features.costBreakdown) lines.push("Per-run cost breakdown");
  if (plan.features.auditTrail) lines.push("Full agent audit trail");
  if (plan.features.contentCalendar) lines.push("Content calendar");
  if (plan.features.hookLibrary) lines.push("Cross-project hook library");
  if (plan.features.prioritySupport) lines.push("Priority support");

  lines.push(
    plan.features.maxProjects === null
      ? "Unlimited projects"
      : `${plan.features.maxProjects} projects`,
  );

  return lines;
}

/** What this tier does NOT have, drawn from the tier above it. Never guessed. */
function missingFrom(plan: Plan): string[] {
  const missing: string[] = [];
  if (!plan.features.instagram) missing.push("Instagram research");
  if (!plan.features.transcripts) missing.push("Transcripts");
  if (!plan.features.voiceInput) missing.push("Voice input");
  return missing;
}

export function ProPlans({
  signedIn,
  currentPlan,
  canCheckout,
  canYearly,
  initialCycle = "monthly",
}: {
  signedIn: boolean;
  /** The tier they are already on, so its card says so instead of selling it. */
  currentPlan: PaidPlanKey | null;
  /** False when Razorpay keys are missing on this deploy. */
  canCheckout: boolean;
  /** False when the yearly Razorpay plan ids are not configured. */
  canYearly: boolean;
  /** Preselected cycle, from ?cycle= after a signed-out click. */
  initialCycle?: BillingCycle;
}) {
  const [cycle, setCycle] = useState<BillingCycle>(initialCycle);
  const [promo, setPromo] = useState<AppliedPromo | null>(null);
  const [promoFor, setPromoFor] = useState<PaidPlanKey | null>(null);
  const { busy, start } = useUpgrade();

  /**
   * A code is priced against ONE tier on ONE cycle. Changing either invalidates
   * it, so it is dropped rather than left showing a discount that no longer
   * applies to what is on screen.
   */
  function changeCycle(next: BillingCycle) {
    setCycle(next);
    setPromo(null);
    setPromoFor(null);
  }

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

      <div className="mx-auto grid max-w-7xl items-stretch gap-6 md:grid-cols-2 xl:grid-cols-4">
        {/* ------------------------------------------------------------ free */}
        <div data-reveal="up" data-stagger className="group/tilt h-full">
          <TiltCard intensity={6} className="flex h-full flex-col p-7">
            <h2 className="font-display text-2xl">{FREE.name}</h2>

            <p className="text-muted-foreground mt-3 min-h-[3rem] text-sm leading-relaxed">
              {FREE.tagline}
            </p>

            <div className="mt-6 flex items-baseline gap-2">
              <span className="font-display text-5xl">{formatUsd(FREE.priceUsd)}</span>
              <span className="text-muted-foreground text-sm">forever</span>
            </div>
            <p className="text-muted-foreground/60 mt-2 text-xs">
              No card. Nothing renews.
            </p>

            <div className="rule-brand mt-6 w-full opacity-40" aria-hidden />

            <ul className="mt-6 flex-1 space-y-3">
              {[
                `${FREE.runs} research runs a month`,
                `${FREE.videosPerRun} videos read per run`,
                "Outlier scoring on every video",
                "No card, no countdown timer",
              ].map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm">
                  <Check className="text-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                  {feature}
                </li>
              ))}
              {missingFrom(FREE).map((feature) => (
                <li
                  key={feature}
                  className="text-muted-foreground/60 flex items-start gap-3 text-sm"
                >
                  <Minus className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {feature}
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <MagneticButton
                href={signedIn ? "/projects" : SIGNUP_HREF}
                variant="glass"
                className="w-full"
              >
                {signedIn ? "Open your workspace" : `Take the ${spellOut(FREE.runs)}`}
              </MagneticButton>
            </div>
          </TiltCard>
        </div>

        {/* ------------------------------------------------------ paid tiers */}
        {PAID_PLAN_KEYS.map((key) => {
          const plan = PLANS[key];
          const price = PLAN_PRICES[key][cycle];
          const featured = key === HIGHLIGHTED_PLAN;
          const isCurrent = currentPlan === key;
          const live = signedIn && canCheckout && !isCurrent;

          // The promo only applies to the card it was validated against.
          const applied = promoFor === key ? promo : null;
          const finalCents = applied ? applied.finalCents : price.priceCents;

          return (
            <div key={key} data-reveal="up" data-stagger className="group/tilt h-full">
              <TiltCard
                intensity={6}
                className={cn(
                  "flex h-full flex-col p-7",
                  featured && "ring-[var(--brand-2)]/30 ring-2",
                )}
              >
                {featured && <div className="rule-brand absolute inset-x-0 top-0" aria-hidden />}

                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-display text-2xl">{plan.name}</h2>
                  {(isCurrent || featured) && (
                    <span className="label-mono text-accent-gradient shrink-0 text-xs">
                      {isCurrent ? "Your plan" : "Best value"}
                    </span>
                  )}
                </div>

                <p className="text-muted-foreground mt-3 min-h-[3rem] text-sm leading-relaxed">
                  {plan.tagline}
                </p>

                <div className="mt-6 flex items-baseline gap-2">
                  <span className="font-display text-5xl">
                    {formatUsd(
                      cycle === "yearly"
                        ? Math.round(perMonthUsd(price) * 100) / 100
                        : plan.priceUsd,
                    )}
                  </span>
                  <span className="text-muted-foreground text-sm">/month</span>
                </div>

                {/*
                  BOTH NUMBERS, ALWAYS. The monthly-equivalent above is the
                  comparable figure; this is what actually leaves the account.
                  Showing only the first is the trick this component exists to
                  avoid.
                */}
                <p className="text-muted-foreground/60 mt-2 text-xs">
                  {cycle === "yearly" ? (
                    <>
                      {formatUsd(price.priceUsd)} billed once a year
                      {yearlySavingUsd(key) > 0 && (
                        <> — saves {formatUsd(yearlySavingUsd(key))}</>
                      )}
                    </>
                  ) : (
                    <>Billed monthly. Cancel whenever.</>
                  )}
                </p>

                {applied && (
                  <div className="mt-2 space-y-2">
                    <p className="text-[var(--brand-2)] text-xs">
                      {applied.label}: {formatUsd(finalCents / 100)} today.
                    </p>
                    <PromoDisclosure
                      cyclesCovered={applied.cyclesCovered}
                      discountedCents={applied.finalCents}
                      renewsAtCents={applied.renewsAtCents ?? price.priceCents}
                      cycle={cycle}
                    />
                  </div>
                )}

                <div className="rule-brand mt-6 w-full opacity-40" aria-hidden />

                <ul className="mt-6 flex-1 space-y-3">
                  {includedIn(plan).map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm">
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-[var(--brand-2)]"
                        aria-hidden
                      />
                      {feature}
                    </li>
                  ))}
                  {missingFrom(plan).map((feature) => (
                    <li
                      key={feature}
                      className="text-muted-foreground/60 flex items-start gap-3 text-sm"
                    >
                      <Minus className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="mt-8 space-y-3">
                  {isCurrent ? (
                    <MagneticButton href="/billing" variant="glass" className="w-full">
                      Manage plan
                    </MagneticButton>
                  ) : live ? (
                    <MagneticButton
                      onClick={() => start({ plan: key, cycle, promoCode: applied?.code })}
                      disabled={busy}
                      className="w-full"
                    >
                      {busy ? "Opening…" : `Choose ${plan.name}`}
                    </MagneticButton>
                  ) : (
                    <MagneticButton
                      href={signedIn ? "/billing" : planSignInHref(key, cycle)}
                      variant={featured ? "solid" : "glass"}
                      className="w-full"
                    >
                      {signedIn ? "Manage plan" : `Choose ${plan.name}`}
                    </MagneticButton>
                  )}

                  {live && (
                    <PromoField
                      target="subscription"
                      plan={key}
                      cycle={cycle}
                      applied={applied}
                      onApplied={(next) => {
                        setPromo(next);
                        setPromoFor(next ? key : null);
                      }}
                    />
                  )}
                </div>
              </TiltCard>
            </div>
          );
        })}
      </div>
    </>
  );
}
