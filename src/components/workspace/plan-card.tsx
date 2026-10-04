import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PLANS, plansAbove, type PaidPlanKey, type PlanKey } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import { formatDay } from "@/lib/format";

/**
 * The sidebar's plan-and-usage card.
 *
 * Answers, without leaving the page you are on: what am I paying for, how much
 * of it have I used, when does it reset, and is anything about to stop. Those
 * questions previously required navigating to /billing, which meant the answer
 * to "why did that run fail?" lived one click away from the failure.
 *
 * A SERVER COMPONENT, deliberately. Every number here comes from `getQuota()`,
 * which counts jobs under RLS. Fetching it in the browser would put the
 * allowance behind a spinner on every page load and let a client decide what a
 * user's plan is — the one thing the billing code is careful never to do.
 *
 * IT RENDERS NOTHING WITHOUT A QUOTA. A missing quota means the layout could
 * not read one, and inventing "0 of 3" would be a lie on the way to a support
 * ticket.
 */
export function SidebarPlanCard({
  planKey,
  allowanceUsed,
  allowance,
  remaining,
  dailyUsed,
  dailyCap,
  resetsAt,
  cancelAtPeriodEnd,
  currentPeriodEnd,
  subscribedTier,
  onNavigate,
}: {
  planKey: PlanKey;
  allowanceUsed: number;
  allowance: number;
  /** Allowance left plus any legacy credits. Drives the "runs left" figure. */
  remaining: number;
  dailyUsed: number;
  dailyCap: number;
  resetsAt: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  /** The paid tier, so upgrades are offered from the right rung. */
  subscribedTier: PaidPlanKey | null;
  onNavigate?: () => void;
}) {
  const plan = PLANS[planKey];

  // Guard the division rather than the render: an allowance of zero is a real
  // plan shape, and NaN% would silently paint an empty bar.
  const usedPercent =
    allowance > 0 ? Math.min(100, Math.round((allowanceUsed / allowance) * 100)) : 0;

  // Only offer a rung that exists. On the top tier this is empty and the
  // upgrade link is not rendered at all.
  const canUpgrade = plansAbove(subscribedTier).length > 0;

  // Nearly out, or out. Drives colour only — the numbers say it either way.
  const spent = allowance > 0 && allowanceUsed >= allowance;
  const low = !spent && allowance > 0 && allowanceUsed / allowance >= 0.8;

  return (
    <div className="border-border/60 bg-card/60 space-y-3 rounded-xl border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{plan.name}</span>
        <span className="text-muted-foreground text-[0.62rem] tracking-wide uppercase">
          {subscribedTier ? "Plan" : "Free"}
        </span>
      </div>

      {/* ------------------------------------------------------- allowance */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground text-xs">Runs this month</span>
          <span className="text-xs font-medium tabular-nums">
            {allowanceUsed}/{allowance}
          </span>
        </div>

        <div
          className="bg-muted h-1.5 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={allowanceUsed}
          aria-valuemin={0}
          aria-valuemax={allowance}
          aria-label="Monthly runs used"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              spent ? "bg-destructive" : low ? "bg-amber-500" : "bg-brand-gradient",
            )}
            style={{ width: `${usedPercent}%` }}
          />
        </div>

        <p className="text-muted-foreground/70 text-[0.68rem]">
          {/* `remaining` rather than allowance-minus-used: it includes legacy
              credits, so it matches what the run buttons will actually let
              through. Two different numbers here and on a blocked run is how a
              support thread starts. */}
          {remaining} left
          {resetsAt ? ` · resets ${formatShort(resetsAt)}` : " · resets monthly"}
        </p>
      </div>

      {/* ----------------------------------------------------- daily cap */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground text-xs">Today</span>
        <span
          className={cn(
            "text-xs font-medium tabular-nums",
            dailyUsed >= dailyCap && "text-destructive",
          )}
        >
          {dailyUsed}/{dailyCap}
        </span>
      </div>

      {/* The daily cap is the limit most people meet first and the one least
          expected, so it says so plainly at the moment it bites rather than
          only inside a failed run's error. */}
      {/* Only say "tomorrow" when tomorrow helps. With the month used up,
          tomorrow changes nothing (found 2026-10-04). */}
      {dailyUsed >= dailyCap && remaining > 0 && (
        <p className="text-destructive text-[0.68rem] leading-relaxed">
          Daily cap reached. More runs tomorrow.
        </p>
      )}

      {/* --------------------------------------------------- renewal state */}
      {cancelAtPeriodEnd && currentPeriodEnd && (
        <p className="text-muted-foreground text-[0.68rem] leading-relaxed">
          Cancels {formatShort(currentPeriodEnd)}. You keep {plan.name} until then.
        </p>
      )}

      {canUpgrade && (
        <Link
          href="/billing"
          onClick={onNavigate}
          className="text-foreground hover:bg-muted/60 border-border/60 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
        >
          Upgrade
          <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/**
 * "12 Sep" — short enough for a 256px rail.
 *
 * In IST, like every other date in the workspace (lib/format.ts). The period
 * is computed in UTC and resets at a UTC midnight, which is 05:30 the same
 * day in India, so the printed date is the one the quota maths means.
 */
function formatShort(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "soon";
  return formatDay(date);
}
