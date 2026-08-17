import { AlertCircle, Check, CreditCard, ShieldCheck } from "lucide-react";
import { CancelButton } from "@/components/billing/cancel-button";
import { RefillCards } from "@/components/billing/refill-cards";
import { RefreshBillingButton } from "@/components/billing/refresh-button";
import { UpgradeChoice } from "@/components/billing/upgrade-choice";
import { EmptyState, PanelBadge, WorkspacePanel } from "@/components/workspace/panel";
import { PLANS, PRO, PRO_PRICES, formatRupees, perScrapeRupees } from "@/lib/billing/plans";
import { formatDate } from "@/lib/billing/status";
import { getBillingState, getCreditBalance, getCreditHistory } from "@/lib/billing/store";
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
  const [state, credits, history] = await Promise.all([
    getBillingState(),
    getCreditBalance(),
    getCreditHistory(5),
  ]);

  const ready = isBillingConfigured() && isCheckoutConfigured;
  const canYearly = isYearlyConfigured();
  // Shown on screen when true. Someone testing needs to know at a glance that
  // no real money is moving; discovering it later, from a missing payout, is
  // the expensive way to find out.
  const testMode = ready && razorpayMode() === "test";
  const free = PLANS.free;

  return (
    <WorkspacePanel
      title="Billing"
      description="Your plan, what it costs, and how to stop it. No phone call required."
      badge={<PanelBadge>{state.isPro ? "Pro" : "Scout — free"}</PanelBadge>}
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
              {state.isPro ? PRO.name : free.name}
              <span className="text-muted-foreground ml-3 text-base font-normal">
                {state.isPro
                  ? `${formatRupees(PRO_PRICES[state.cycle].priceRupees)} ${
                      state.cycle === "yearly" ? "a year" : "a month"
                    }`
                  : "Free"}
              </span>
            </h3>
            <p className="text-muted-foreground mt-2 max-w-prose text-sm">
              {state.headline}
            </p>
          </div>

        </div>

        {state.canSubscribe && ready && (
          <div className="border-border/60 mt-6 border-t pt-6">
            <UpgradeChoice canYearly={canYearly} />
          </div>
        )}

        <dl className="border-border/60 mt-6 grid gap-x-8 gap-y-4 border-t pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Scrapes"
            value={String(state.isPro ? PRO.scrapes : free.scrapes)}
            note={state.isPro ? "each month" : "one time, ever"}
          />
          <Stat
            label="Videos per scrape"
            value={String(state.isPro ? PRO.videosPerScrape : free.videosPerScrape)}
            note="per channel read"
          />
          <Stat
            label={state.cancelAtPeriodEnd ? "Pro until" : "Renews"}
            value={state.currentPeriodEnd ? formatDate(state.currentPeriodEnd) : "—"}
            note={
              state.cancelAtPeriodEnd
                ? "then back to Scout"
                : state.isPro
                  ? "charged automatically"
                  : "nothing scheduled"
            }
          />
          <Stat
            label="Refill balance"
            value={String(credits)}
            note={credits === 0 ? "no packs bought" : "bought outright, never expire"}
          />
        </dl>

        {state.canCancel && (
          <div className="border-border/60 mt-6 border-t pt-5">
            <CancelButton endsOn={state.currentPeriodEnd} />
          </div>
        )}
      </section>

      {/* ------------------------------------------------- what Pro includes */}
      {!state.isPro && (
        <section className="surface-raised rounded-2xl p-6">
          <p className="text-muted-foreground text-[0.68rem] tracking-[0.18em] uppercase">
            What changes on Pro
          </p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              `${PRO.scrapes} channel scrapes every month`,
              `${PRO.videosPerScrape} videos read per scrape, not ${free.videosPerScrape}`,
              "Web enrichment via Firecrawl",
              "Transcript search",
              `Up to ${PRO.dailyCap} plan scrapes a day — refills are not capped`,
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

      {/* ------------------------------------------------------------ refills */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-[0.68rem] tracking-[0.18em] uppercase">
              Refill packs
            </p>
            <p className="text-muted-foreground mt-1.5 max-w-prose text-sm">
              Extra scrapes, bought once, never expiring. Priced a little above
              the plan&rsquo;s {formatRupees(Math.round(perScrapeRupees(PRO)))} a
              scrape — the subscription should always be the better deal.
            </p>
          </div>
        </div>

        <RefillCards signedIn canCheckout={ready} />
      </section>

      {/* ------------------------------------------------------------ history */}
      {history.length > 0 && (
        <section className="surface-raised rounded-2xl p-6">
          <p className="text-muted-foreground text-[0.68rem] tracking-[0.18em] uppercase">
            Recent purchases
          </p>
          <ul className="mt-4 space-y-3">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="border-border/50 flex items-baseline justify-between gap-4 border-b pb-3 text-sm last:border-0 last:pb-0"
              >
                <span className="min-w-0">
                  <span className="font-medium">
                    {entry.credits > 0 ? `+${entry.credits}` : entry.credits} scrapes
                  </span>
                  <span className="text-muted-foreground ml-2 text-xs">
                    {labelForSource(entry.source)}
                  </span>
                </span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {formatDate(entry.created_at)}
                  {entry.amount_paise > 0 &&
                    ` · ${formatRupees(entry.amount_paise / 100)}`}
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
