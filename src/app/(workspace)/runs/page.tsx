import { EmptyState, WorkspacePanel } from "@/components/workspace/panel";
import { RunCard } from "@/components/workspace/run-card";
import { PLANS } from "@/lib/billing/plans";
import { BILLABLE_JOB_KINDS } from "@/lib/billing/quota";
import { getBillingState } from "@/lib/billing/store";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Runs — TubePulse" };

// What a run cost is money state, and money state is never cached.
export const dynamic = "force-dynamic";

/**
 * Every billable run, newest first, with what it cost and what the agent did.
 *
 * TWO GATES, and both read from the plan catalogue rather than being decided
 * here: the cost breakdown is Studio and above, the agent trail is Max. Both
 * are recorded for everyone — see lib/jobs/trail.ts for why recording is never
 * gated even when reading is.
 *
 * The page itself is NOT gated. A free user still sees their runs and whether
 * they worked; what they do not see is the breakdown. Hiding the history of
 * your own work behind a paywall would be a strange thing to sell.
 */
export default async function RunsPage() {
  const supabase = await createServerClient();
  const billing = await getBillingState();
  const plan = PLANS[billing.planKey];

  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    // Only the kinds that spend the allowance. A job row that was never a
    // charge is not a "run" in the sense this page means.
    .in("kind", BILLABLE_JOB_KINDS)
    .order("created_at", { ascending: false })
    .limit(50);

  const runs = jobs ?? [];

  return (
    <WorkspacePanel
      title="Runs"
      description={
        plan.features.costBreakdown
          ? "Everything you have spent an allowance on, and what each one cost to run."
          : "Everything you have spent an allowance on."
      }
    >
      {runs.length === 0 ? (
        <EmptyState>
          Nothing has run yet. Research a channel and it will appear here, with
          what it took to produce.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {runs.map((job) => (
            <RunCard
              key={job.id}
              job={job}
              showCost={plan.features.costBreakdown}
              showTrail={plan.features.auditTrail}
            />
          ))}
        </div>
      )}

      {/*
        The upgrade line appears ONCE, under the list, and only when there is
        something real to unlock. Putting it on every card would turn a page
        someone opened to check their own work into an advert.
      */}
      {!plan.features.costBreakdown && runs.length > 0 && (
        <p className="text-muted-foreground border-border/50 mt-6 border-t pt-4 text-sm">
          {PLANS.studio.name} shows what each run cost to produce —
          which provider, how much, and why.
        </p>
      )}
    </WorkspacePanel>
  );
}
