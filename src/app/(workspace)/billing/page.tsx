import { AlertCircle, Check, CreditCard, ShieldCheck } from "lucide-react";
import { CancelButton } from "@/components/billing/cancel-button";
import { RefreshBillingButton } from "@/components/billing/refresh-button";
import { UpgradeChoice } from "@/components/billing/upgrade-choice";
import { EmptyState, PanelBadge, WorkspacePanel } from "@/components/workspace/panel";
import {
  HIGHLIGHTED_PLAN,
  PLANS,
  PLAN_PRICES,
  formatUsd,
} from "@/lib/billing/plans";
import { formatDate } from "@/lib/billing/status";
import { getBillingState, getCreditHistory } from "@/lib/billing/store";
import { isBillingConfigured, isYearlyConfigured, razorpayMode } from "@/lib/env";
import { isCheckoutConfigured } from "@/lib/public-env";

export const metadata = { title: "Billing — TubePulse" };

// Money state must never come from a cached render.
export const dynamic = "force-dynamic";

/**
 * The billing page.
 *
 * One screen that answers three questions without the user having to log in to
 * Razorpay: what am I on, when does it renew, and how do I stop. The third one
 * is why this page exists at all — a cancel button that lives only in a support
 * inbox is how a subscription business gets a reputation.
 *
 * Everything shown here is derived from the `subscriptions` row, which is
 * written only by verified Razorpay payloads. The page never asks the browser
 * what plan someone is on.
 */
export default async function BillingPage() {
  const [state, history] = await Promise.all([
    getBillingState(),
    // Legacy credits only — refill packs were retired with the four-tier
    // pricing, so this is history rather than a balance anyone can add to.
    getCreditHistory(5),
  ]);

  const ready = isBillingConfigured() && isCheckoutConfigured;
  const canYearly = isYearlyConfigured();
  // Shown on screen when true. Someone testing needs to know at a glance that
  // no real money is moving; discovering it later, from a missing payout, is
  // the expensive way to find out.
  const testMode = ready && razorpayMode() === "test";
  // The tier they are actually on right now, and the one worth showing next.
  const plan = PLANS[state.planKey];
  const upgrade =
    state.planKey === "agency" ? null : PLANS[state.planKey === "free" ? HIGHLIGHTED_PLAN : "agency"];

  return (
    <WorkspacePanel
      title="Billing"
      description="Your plan, what it costs, and how to stop it. No phone call required."
      badge={
        <PanelBadge>
          {state.isPaid ? plan.name : `${plan.name} — free`}
        </PanelBadge>
      }
      action={ready && state.razorpaySubscriptionId ? <RefreshBillingButton /> : undefined}
    >
      {testMode && (
        <EmptyState className="border-sky-500/40 bg-sky-500/5">
          <span className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong>Razorpay test mode.</strong> Everything here works, but no
              real money moves and nothing reaches your bank. Use card{" "}
              <code>4111 1111 1111 1111</code>, any future expiry, any CVV. Swap
              in your <code>rzp_live_</code> keys when you are done — and
              remember the plan ids are per-mode too.
            </span>
          </span>
        </EmptyState>
      )}

      {!ready && (
        <EmptyState className="border-amber-500/40 bg-amber-500/5">
          <span className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Razorpay keys are not set on this machine, so upgrading is switched
              off. Nothing is broken — see <code>docs/billing-setup.md</code> for
              the four values that go in <code>.env.local</code>.
            </span>
          </span>
        </EmptyState>
      )}

      {/* ------------------------------------------------------ current plan */}
      <section className="surface-raised rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-muted-foreground text-[0.68rem] tracking-[0.18em] uppercase">
              Current plan
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight">
              {plan.name}
              <span className="text-muted-foreground ml-3 text-base font-normal">
                {state.isPaid && state.subscribedTier
                  ? `${formatUsd(
                      PLAN_PRICES[state.subscribedTier][state.cycle].priceUsd,
                    )} ${state.cycle === "yearly" ? "a year" : "a month"}`
                  : "Free"}
              </span>
            </h3>
            <p className="text-muted-foreground mt-2 max-w-prose text-sm">
              {state.headline}
            </p>

            {/* The discount countdown. Shown only while one is running, and it
                always names the price it rises to — a customer who is told
                "2 months left" but not "then $49" has been told half of it. */}
            {state.promo && (
              <p className="border-border/60 bg-muted/30 mt-3 max-w-prose rounded-lg border px-3 py-2 text-xs">
                <span className="font-mono uppercase">{state.promo.code}</span>
                <span className="text-muted-foreground"> — {state.promo.notice}</span>
              </p>
            )}
          </div>

        </div>

        {state.canSubscribe && ready && (
          <div className="border-border/60 mt-6 border-t pt-6">
            <UpgradeChoice canYearly={canYearly} currentPlan={state.subscribedTier} />
          </div>
        )}

        <dl className="border-border/60 mt-6 grid gap-x-8 gap-y-4 border-t pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Runs"
            value={String(plan.runs)}
            note="each month"
          />
          <Stat
            label="Videos per run"
            value={String(plan.videosPerRun)}
            note="per channel read"
          />
          <Stat
            label={state.cancelAtPeriodEnd ? `${plan.name} until` : "Renews"}
            value={state.currentPeriodEnd ? formatDate(state.currentPeriodEnd) : "—"}
            note={
              state.cancelAtPeriodEnd
                ? "then back to Scout"
                : state.isPaid
                  ? "charged automatically"
                  : "nothing scheduled"
            }
          />
          <Stat
            label="Runs a day"
            value={String(plan.dailyCap)}
            note="so a month cannot vanish in an afternoon"
          />
        </dl>

        {state.canCancel && (
          <div className="border-border/60 mt-6 border-t pt-5">
            <CancelButton endsOn={state.currentPeriodEnd} />
          </div>
        )}
      </section>

      {/* ---------------------------------------------- what upgrading gives */}
      {upgrade && (
        <section className="surface-raised rounded-2xl p-6">
          <p className="text-muted-foreground text-[0.68rem] tracking-[0.18em] uppercase">
            What changes on {upgrade.name}
          </p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              `${upgrade.runs} research runs every month, not ${plan.runs}`,
              `${upgrade.videosPerRun} videos read per run, not ${plan.videosPerRun}`,
              ...(upgrade.features.instagram && !plan.features.instagram
                ? [`Instagram research, ${upgrade.postsPerRun} posts a run`]
                : []),
              ...(upgrade.model === "premium" && plan.model !== "premium"
                ? ["Advanced reasoning model"]
                : []),
              ...(upgrade.features.transcripts && !plan.features.transcripts
                ? ["Transcripts and summaries"]
                : []),
              `Up to ${upgrade.dailyCap} runs a day`,
              "Cancel any time, keep the period you paid for",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-[var(--brand-2)]" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ------------------------------------------------------------ history */}
      {history.length > 0 && (
        <section className="surface-raised rounded-2xl p-6">
          <p className="text-muted-foreground text-[0.68rem] tracking-[0.18em] uppercase">
            Earlier credits
          </p>
          <ul className="mt-4 space-y-3">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="border-border/50 flex items-baseline justify-between gap-4 border-b pb-3 text-sm last:border-0 last:pb-0"
              >
                <span className="min-w-0">
                  <span className="font-medium">
                    {entry.credits > 0 ? `+${entry.credits}` : entry.credits} runs
                  </span>
                  <span className="text-muted-foreground ml-2 text-xs">
                    {labelForSource(entry.source)}
                  </span>
                </span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {formatDate(entry.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------------------------------------------------------- assurance */}
      <div className="text-muted-foreground grid gap-3 text-xs sm:grid-cols-2">
        <p className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          Card and UPI details are entered inside Razorpay&rsquo;s own window and
          never reach TubePulse. We store a subscription id and nothing else.
        </p>
        <p className="flex items-start gap-2.5">
          <CreditCard className="mt-0.5 size-4 shrink-0" aria-hidden />
          Cancelling here also stops the autopay mandate at Razorpay, so no
          further charge can be attempted. You are not asked to cancel it twice.
        </p>
      </div>
    </WorkspacePanel>
  );
}

/** Ledger `source` values are catalogue keys; the page shows names. */
function labelForSource(source: string): string {
  if (source === "topup_small") return "Refill";
  if (source === "topup_large") return "Big refill";
  if (source === "manual") return "Granted by support";
  return source;
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-[0.68rem] tracking-wide uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold tracking-tight tabular-nums">{value}</dd>
      <p className="text-muted-foreground/70 text-xs">{note}</p>
    </div>
  );
}
