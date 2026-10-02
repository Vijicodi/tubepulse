import { redirect } from "next/navigation";
import { SidebarPlanCard } from "@/components/workspace/plan-card";
import { WorkspaceShell } from "@/components/workspace/shell";
import { getBillingState, getQuota } from "@/lib/billing/store";
import { createServerClient, getUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/public-env";

/**
 * Every workspace page renders inside this.
 *
 * Middleware already redirects signed-out users, but this checks again: a
 * layout that trusts middleware alone breaks the moment someone adds a route
 * outside the matcher. Two cheap checks beat one clever one.
 */
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured) redirect("/login");

  const user = await getUser();
  if (!user) redirect("/login");

  // How many projects exist decides the eyebrow copy — "set up your first
  // project" is wrong once they have four.
  const supabase = await createServerClient();

  // In parallel: three independent reads, and the sidebar needs two of them on
  // every workspace page. Awaiting them in sequence would add a round trip to
  // each navigation for a card that is always visible.
  //
  // The quota and billing reads are allowed to FAIL SOFT. A sidebar decoration
  // must never be able to take down the page it decorates, so a thrown read
  // costs the card and nothing else.
  const [{ count }, quota, billing] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }),
    getQuota(supabase, user.id).catch(() => null),
    getBillingState().catch(() => null),
  ]);

  const eyebrow =
    (count ?? 0) === 0 ? "Set up your first project" : "Competitor research workspace";

  return (
    <WorkspaceShell
      email={user.email ?? ""}
      eyebrow={eyebrow}
      planCard={
        quota ? (
          <SidebarPlanCard
            planKey={quota.planKey}
            allowanceUsed={quota.allowanceUsed}
            allowance={quota.allowance}
            remaining={quota.remaining}
            dailyUsed={quota.dailyUsed}
            dailyCap={quota.dailyCap}
            resetsAt={quota.resetsAt}
            cancelAtPeriodEnd={billing?.cancelAtPeriodEnd ?? false}
            currentPeriodEnd={billing?.currentPeriodEnd ?? null}
            subscribedTier={billing?.ownedTier ?? null}
          />
        ) : null
      }
    >
      {children}
    </WorkspaceShell>
  );
}
