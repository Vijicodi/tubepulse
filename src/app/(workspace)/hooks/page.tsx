import Link from "next/link";
import { ArrowUpRight, Lock } from "lucide-react";
import { EmptyState, PanelBadge, WorkspacePanel } from "@/components/workspace/panel";
import { HookCard } from "@/components/workspace/hook-card";
import { buildHookLibrary } from "@/lib/analytics/hooks";
import { PLANS } from "@/lib/billing/plans";
import { canUseHookLibrary } from "@/lib/billing/quota";
import { getBillingState } from "@/lib/billing/store";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Hook library — TubePulse" };

const DESCRIPTION =
  "Title shapes that beat their own channel, drawn from every project you own.";

/**
 * The hook library — the Max tier's headline feature.
 *
 * READS ACROSS EVERY PROJECT, which is the whole point and the reason it sits
 * at the top of the ladder. A hook that works in three unrelated niches is a
 * far stronger signal than one that works in a single channel, and only an
 * account with several projects can see that at all.
 *
 * FREE TO COMPUTE, like /patterns: no allowance is spent, no provider called.
 * The tier gate is about who the analysis is worth building for, not about
 * charging twice for a scrape that was already paid for.
 *
 * Note there is no project filter anywhere below. That is not an oversight —
 * RLS scopes every row to the owner, and the absence of a project id is what
 * makes this cross-project.
 */
export default async function HooksPage() {
  const billing = await getBillingState();

  if (!canUseHookLibrary(billing.planKey)) {
    const max = PLANS.agency;
    const current = PLANS[billing.planKey];

    return (
      <WorkspacePanel
        title="Hook library"
        description={DESCRIPTION}
        badge={<PanelBadge>{max.name}</PanelBadge>}
      >
        <EmptyState>
          <span className="flex flex-col items-center gap-3">
            <Lock className="text-muted-foreground/60 size-5" aria-hidden />
            <span>
              The hook library reads the titles that outperformed across every
              project you own, and reports the shapes they share. It is on{" "}
              {max.name}; you are on {current.name}.
            </span>
            <Link
              href="/billing"
              className="text-foreground inline-flex items-center gap-1 underline underline-offset-4"
            >
              See {max.name}
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </span>
        </EmptyState>
      </WorkspacePanel>
    );
  }

  const supabase = await createServerClient();

  // Everything this account owns. RLS does the scoping; deliberately no
  // project filter — see the note above.
  const [{ data: projects }, { data: videos }] = await Promise.all([
    supabase.from("projects").select("id"),
    supabase.from("videos").select("*"),
  ]);

  const library = buildHookLibrary(videos ?? [], (projects ?? []).length);

  if (library.hooks.length === 0) {
    return (
      <WorkspacePanel
        title="Hook library"
        description={DESCRIPTION}
        badge={<PanelBadge>{PLANS.agency.name}</PanelBadge>}
      >
        <EmptyState>
          {library.titlesAnalysed === 0
            ? "Nothing has outperformed yet. Research a few channels and the titles that beat their own median will be read for the shapes they share — which costs nothing."
            : "The titles that outperformed do not share a shape this reads for yet. More research across more channels is what makes this page useful."}
        </EmptyState>
      </WorkspacePanel>
    );
  }

  return (
    <WorkspacePanel
      title="Hook library"
      description={DESCRIPTION}
      badge={<PanelBadge>{PLANS.agency.name}</PanelBadge>}
    >
      <p className="text-muted-foreground mb-5 text-sm">
        Read from{" "}
        <strong className="text-foreground font-medium">
          {library.titlesAnalysed}
        </strong>{" "}
        title{library.titlesAnalysed === 1 ? "" : "s"} that beat their own
        channel, across{" "}
        <strong className="text-foreground font-medium">
          {library.projectsCovered}
        </strong>{" "}
        project{library.projectsCovered === 1 ? "" : "s"}.
        {library.best ? (
          <>
            {" "}
            The strongest shape with enough behind it to trust is{" "}
            <strong className="text-foreground font-medium">
              {library.best.label}
            </strong>
            .
          </>
        ) : (
          // Said plainly rather than hidden. A page that quietly omits its
          // headline when the data is thin reads as though the data was fine.
          " Nothing yet has a large enough sample to call a trend — the shapes below are listed with their counts so you can judge."
        )}
      </p>

      <div className="grid gap-3">
        {library.hooks.map((hook) => (
          <HookCard key={hook.label} hook={hook} />
        ))}
      </div>
    </WorkspacePanel>
  );
}
