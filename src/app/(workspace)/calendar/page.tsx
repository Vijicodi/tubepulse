import Link from "next/link";
import { ArrowUpRight, Lock } from "lucide-react";
import { EmptyState, PanelBadge, WorkspacePanel } from "@/components/workspace/panel";
import { CalendarGrid } from "@/components/workspace/calendar-grid";
import { CreateProjectForm } from "@/components/workspace/create-project-form";
import { buildMonth, shiftMonth, todayKey } from "@/lib/analytics/calendar";
import { PLANS } from "@/lib/billing/plans";
import { canUseContentCalendar } from "@/lib/billing/quota";
import { getBillingState } from "@/lib/billing/store";
import { getCurrentProject } from "@/lib/projects/current";
import { createServerClient } from "@/lib/supabase/server";
import type { IdeaRow } from "@/lib/supabase/types";

export const metadata = { title: "Calendar — TubePulse" };

const DESCRIPTION = "What you are making, and when.";

/**
 * The content calendar. Studio and above.
 *
 * NOT MAX-ONLY, deliberately. Scheduling is a working creator's need rather
 * than a power user's, and hoarding it for the top tier would hollow out
 * Studio — the tier the pricing page honestly recommends to almost everyone.
 *
 * The month comes from the query string so the page stays a server component
 * and every navigation is a real URL: a planned month can be linked, bookmarked
 * and reloaded, which client-side month state would quietly lose.
 */
export default async function CalendarPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise.
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const billing = await getBillingState();

  if (!canUseContentCalendar(billing.planKey)) {
    const studio = PLANS.studio;
    const current = PLANS[billing.planKey];

    return (
      <WorkspacePanel
        title="Calendar"
        description={DESCRIPTION}
        badge={<PanelBadge>{studio.name}</PanelBadge>}
      >
        <EmptyState>
          <span className="flex flex-col items-center gap-3">
            <Lock className="text-muted-foreground/60 size-5" aria-hidden />
            <span>
              Plan your saved ideas onto dates and keep the evidence attached to
              each one. The calendar is on {studio.name} and above; you are on{" "}
              {current.name}.
            </span>
            <Link
              href="/billing"
              className="text-foreground inline-flex items-center gap-1 underline underline-offset-4"
            >
              See {studio.name}
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </span>
        </EmptyState>
      </WorkspacePanel>
    );
  }

  const project = await getCurrentProject();

  if (!project) {
    return (
      <WorkspacePanel title="Calendar" description={DESCRIPTION}>
        <CreateProjectForm />
      </WorkspacePanel>
    );
  }

  const params = await searchParams;
  const today = todayKey();

  // Fall back to the current month on anything unparseable, rather than
  // erroring: a hand-edited URL should land somewhere sensible.
  const [nowYear, nowMonth] = today.split("-").map(Number);
  const year = Number.isInteger(Number(params.y)) ? Number(params.y) : nowYear;
  const rawMonth = Number.isInteger(Number(params.m)) ? Number(params.m) : nowMonth;
  const month = rawMonth >= 1 && rawMonth <= 12 ? rawMonth : nowMonth;

  const supabase = await createServerClient();

  // The month's slots, plus one day either side of the visible grid — the grid
  // borrows days from the neighbouring months and a slot sitting in a borrowed
  // cell should still be drawn there.
  const previous = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const from = `${previous.year}-${String(previous.month).padStart(2, "0")}-01`;
  const to = `${next.year}-${String(next.month).padStart(2, "0")}-28`;

  const { data: slots } = await supabase
    .from("calendar_slots")
    .select("*")
    .eq("project_id", project.id)
    .gte("scheduled_for", from)
    .lte("scheduled_for", to)
    .order("created_at", { ascending: true });

  const all = slots ?? [];

  // Titles for whatever is on the grid, fetched in one query rather than per
  // slot. A slot with no surviving idea cannot happen (the FK cascades), so a
  // missing title here means only that the join raced a delete.
  const ideaIds = [...new Set(all.map((slot) => slot.idea_id))];
  const { data: ideas } = ideaIds.length
    ? await supabase.from("ideas").select("id, title").in("id", ideaIds)
    : { data: [] as Pick<IdeaRow, "id" | "title">[] };

  const titles = new Map((ideas ?? []).map((idea) => [idea.id, idea.title]));

  // What can still be scheduled: saved ideas in this project.
  const { data: channels } = await supabase
    .from("channels")
    .select("id")
    .eq("project_id", project.id);

  const channelIds = (channels ?? []).map((channel) => channel.id);

  const { data: savedIdeas } = channelIds.length
    ? await supabase
        .from("ideas")
        .select("id, title")
        .in("channel_id", channelIds)
        .not("saved_at", "is", null)
        .order("saved_at", { ascending: false })
    : { data: [] as Pick<IdeaRow, "id" | "title">[] };

  const month_ = buildMonth({ year, month, slots: all, today });

  return (
    <WorkspacePanel
      title="Calendar"
      description={DESCRIPTION}
      badge={<PanelBadge>{month_.label}</PanelBadge>}
    >
      <CalendarGrid
        month={month_}
        titles={Object.fromEntries(titles)}
        savedIdeas={savedIdeas ?? []}
        today={today}
      />
    </WorkspacePanel>
  );
}
