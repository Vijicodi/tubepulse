import Link from "next/link";
import { EmptyState, WorkspacePanel } from "@/components/workspace/panel";
import { CreateProjectForm } from "@/components/workspace/create-project-form";
import { ResearchForm } from "@/components/workspace/research-form";
import { ConfirmDelete } from "@/components/workspace/confirm-delete";
import { deleteChannel } from "@/lib/channels/actions";
import { atHandle } from "@/lib/platform/display";
import { getCurrentProject } from "@/lib/projects/current";
import { PLANS } from "@/lib/billing/plans";
import { getBillingState } from "@/lib/billing/store";
import { createServerClient } from "@/lib/supabase/server";
import { formatDay, formatNumber } from "@/lib/format";

export const metadata = { title: "Competitors — TubePulse" };

export default async function CompetitorsPage() {
  const project = await getCurrentProject();
  const billing = await getBillingState();

  if (!project) {
    return (
      <WorkspacePanel
        title="Competitors"
        description="Channels you are tracking in this project."
      >
        <CreateProjectForm />
      </WorkspacePanel>
    );
  }

  const supabase = await createServerClient();

  const [{ data: channels }, { data: runningJob }] = await Promise.all([
    supabase
      .from("channels")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false }),
    // Resume the card if a scrape was left running when the page was closed.
    supabase
      .from("jobs")
      .select("id, channel_id")
      .eq("project_id", project.id)
      .eq("kind", "channel_scrape")
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // How many posts/videos each account has stored. Instagram's post scraper
  // returns no follower count, so for those this is the number worth showing.
  const { data: storedVideos } = (channels ?? []).length
    ? await supabase
        .from("videos")
        .select("channel_id")
        .in("channel_id", (channels ?? []).map((c) => c.id))
    : { data: [] as { channel_id: string }[] };

  const storedCount = new Map<string, number>();
  for (const row of storedVideos ?? []) {
    storedCount.set(row.channel_id, (storedCount.get(row.channel_id) ?? 0) + 1);
  }

  return (
    <WorkspacePanel
      title="Competitors"
      description={`Accounts tracked in ${project.name}. Paste a YouTube channel or an Instagram profile.`}
    >
      <ResearchForm
        projectId={project.id}
        activeJobId={runningJob?.id ?? null}
        voiceEnabled={PLANS[billing.planKey].features.voiceInput}
        instagramEnabled={PLANS[billing.planKey].features.instagram}
      />

      {/*
        A run in flight with no row to show yet (the page rendered in the gap
        before the channel was written) must not read "No competitors yet"
        under its own progress card. Once the row exists it renders below as a
        pending card marked "Reading now".
      */}
      {!channels || channels.length === 0 ? (
        <EmptyState>
          {runningJob
            ? "Reading the account now. It appears here the moment its first numbers land."
            : "No competitors yet. Paste a YouTube channel or an Instagram profile above and it will appear here with its real numbers."}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {channels.map((channel) => (
            <li key={channel.id} className="surface-raised relative min-w-0 rounded-xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold tracking-tight">
                    <Link
                      href={`/channels/${channel.id}`}
                      className="hover:text-[var(--brand-2)] transition-colors"
                    >
                      {channel.title ?? channel.handle}
                    </Link>
                  </h3>
                  <p className="text-muted-foreground flex items-center gap-1.5 truncate font-mono text-xs">
                    <span
                      className="bg-muted/70 rounded px-1.5 py-0.5 text-[0.6rem] tracking-wide uppercase"
                    >
                      {channel.platform === "instagram" ? "Instagram" : "YouTube"}
                    </span>
                    <span className="truncate">{channel.handle}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Link
                    href={`/channels/${channel.id}`}
                    className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
                  >
                    Profile
                  </Link>
                  <ConfirmDelete
                    action={deleteChannel}
                    fields={{ channelId: channel.id }}
                    label={`Remove ${atHandle(channel.handle)}`}
                    question={`Remove ${atHandle(channel.handle)}?`}
                    detail="Its videos and ideas go too. Runs you already used stay used."
                    confirmLabel="Remove"
                  />
                </div>
              </div>

              <dl className="mt-4 flex gap-6 text-sm">
                {channel.subscriber_count !== null ? (
                  <div>
                    <dt className="text-muted-foreground text-[0.68rem] tracking-wide uppercase">
                      {channel.platform === "instagram" ? "Followers" : "Subscribers"}
                    </dt>
                    <dd className="font-mono tabular-nums">
                      {formatNumber(Number(channel.subscriber_count))}
                    </dd>
                  </div>
                ) : (
                  // Instagram's post scraper reports no follower count; a
                  // bare "—" under Followers read as a broken scrape.
                  <div>
                    <dt className="text-muted-foreground text-[0.68rem] tracking-wide uppercase">
                      {channel.platform === "instagram" ? "Posts read" : "Videos read"}
                    </dt>
                    <dd className="font-mono tabular-nums">
                      {formatNumber(storedCount.get(channel.id) ?? 0)}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground text-[0.68rem] tracking-wide uppercase">
                    Last read
                  </dt>
                  <dd className="font-mono text-xs">
                    {runningJob?.channel_id === channel.id ? (
                      // The run started with this row; its numbers are on the
                      // way. "Never" read as though nothing was happening.
                      <span className="inline-flex items-center gap-1.5 text-[var(--brand-2)]">
                        <span
                          className="size-1.5 animate-pulse rounded-full bg-[var(--brand-2)]"
                          aria-hidden
                        />
                        Reading now
                      </span>
                    ) : channel.last_scraped_at ? (
                      formatDay(channel.last_scraped_at)
                    ) : (
                      "Never"
                    )}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </WorkspacePanel>
  );
}
