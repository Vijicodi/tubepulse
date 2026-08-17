import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, WorkspacePanel } from "@/components/workspace/panel";
import { CreateProjectForm } from "@/components/workspace/create-project-form";
import { StatGrid } from "@/components/workspace/stat-grid";
import { VideoTable } from "@/components/workspace/video-table";
import { IdeaCard } from "@/components/workspace/idea-card";
import { indexByVideoId, resolveEvidence } from "@/lib/ideas/evidence";
import { getQuota } from "@/lib/billing/store";
import { getCurrentProject } from "@/lib/projects/current";
import { nextStep } from "@/lib/projects/next-step";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Project — TubePulse" };

function compact(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function ProjectPage() {
  const project = await getCurrentProject();

  if (!project) {
    return (
      <WorkspacePanel title="Project" description="You do not have a workspace yet.">
        <CreateProjectForm />
      </WorkspacePanel>
    );
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: channels } = await supabase
    .from("channels")
    .select("id, title, handle, platform, last_scraped_at, subscriber_count")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false });

  const channelIds = (channels ?? []).map((channel) => channel.id);

  const [{ data: videos }, { data: ideas }, { data: jobs }, quota] = await Promise.all([
    channelIds.length
      ? supabase
          .from("videos")
          .select("*")
          .in("channel_id", channelIds)
          .order("outlier_score", { ascending: false, nullsFirst: false })
      : Promise.resolve({ data: [] }),
    channelIds.length
      ? supabase
          .from("ideas")
          .select("*")
          .in("channel_id", channelIds)
          .order("confidence", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase
      .from("jobs")
      .select("id, kind, status, error, channel_id, created_at")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(6),
    user ? getQuota(supabase, user.id) : Promise.resolve(null),
  ]);

  const allVideos = videos ?? [];
  const allIdeas = ideas ?? [];
  const recentJobs = jobs ?? [];

  const savedIdeas = allIdeas.filter((idea) => idea.saved_at !== null).length;
  const breakouts = allVideos.filter(
    (video) => Number(video.outlier_score ?? 0) >= 3,
  ).length;

  const jobRunning = recentJobs.some(
    (job) => job.status === "queued" || job.status === "running",
  );
  // Only the most recent job counts as "the last run" — an old failure that has
  // since been superseded is history, not a problem to act on.
  const lastJobFailed = recentJobs[0]?.status === "failed";

  const step = nextStep({
    channels: channels?.length ?? 0,
    items: allVideos.length,
    ideas: allIdeas.length,
    savedIdeas,
    jobRunning,
    lastJobFailed,
    scrapesLeft: quota?.remaining ?? 0,
  });

  const nameOf = new Map(
    (channels ?? []).map((channel) => [channel.id, channel.title ?? channel.handle]),
  );
  const evidenceIndex = indexByVideoId(allVideos);

  return (
    <WorkspacePanel
      title={project.name}
      description={
        project.description ??
        (project.niche ? `Researching ${project.niche}.` : "Everything this project has learned.")
      }
      action={
        <Link
          href="/projects"
          className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-2"
        >
          Switch project
        </Link>
      }
    >
      {/* ---------------------------------------------------------- next step */}
      <div
        className={`rounded-xl border p-5 ${
          step.done ? "border-border/60 bg-muted/20" : "border-[var(--brand-2)]/40 bg-muted/25"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 shrink-0">
              {jobRunning ? (
                <Loader2 className="size-4 animate-spin text-[var(--brand-2)]" aria-hidden />
              ) : lastJobFailed ? (
                <AlertCircle className="text-destructive size-4" aria-hidden />
              ) : step.done ? (
                <CheckCircle2 className="size-4 text-[var(--brand-2)]" aria-hidden />
              ) : (
                <ArrowRight className="size-4 text-[var(--brand-2)]" aria-hidden />
              )}
            </span>
            <div className="min-w-0">
              <h3 className="font-semibold tracking-tight">{step.title}</h3>
              <p className="text-muted-foreground mt-1 text-sm">{step.body}</p>
            </div>
          </div>

          {step.href && step.cta && (
            <Button asChild className="bg-brand-gradient shrink-0 text-white">
              <Link href={step.href}>{step.cta}</Link>
            </Button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- numbers */}
      <StatGrid
        tiles={[
          {
            label: "Competitors",
            value: String(channels?.length ?? 0),
            note: `${compact(allVideos.length)} videos and posts collected`,
          },
          {
            label: "Breakouts",
            value: compact(breakouts),
            note: "3× their own median or better",
          },
          {
            label: "Ideas",
            value: compact(allIdeas.length),
            note: `${savedIdeas} shortlisted`,
          },
        ]}
      />

      {/* ------------------------------------------------------------ channels */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold tracking-tight">Competitors</h3>
          <Link
            href="/competitors"
            className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
          >
            Add another
          </Link>
        </div>

        {!channels || channels.length === 0 ? (
          <EmptyState>
            No competitors in this project yet. Everything on this page is built
            from them.
          </EmptyState>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {channels.map((channel) => {
              const own = allVideos.filter((video) => video.channel_id === channel.id);
              return (
                <li key={channel.id}>
                  <Link
                    href={`/channels/${channel.id}`}
                    className="surface-raised lift hover:border-border block rounded-xl p-4 hover:-translate-y-0.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium tracking-tight">
                          {channel.title ?? channel.handle}
                        </p>
                        <p className="text-muted-foreground mt-0.5 truncate font-mono text-[0.62rem] tracking-wide uppercase">
                          {channel.platform === "instagram" ? "Instagram" : "YouTube"} ·{" "}
                          {channel.handle}
                        </p>
                      </div>
                      <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
                        {own.length}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-3 text-xs">
                      {channel.last_scraped_at
                        ? `Read ${ago(channel.last_scraped_at)}`
                        : "Not read yet"}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------------------------------------------------------------- runs */}
      {recentJobs.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="font-semibold tracking-tight">Recent runs</h3>
          <ul className="surface-raised divide-border/50 divide-y rounded-xl">
            {recentJobs.map((job) => (
              <li key={job.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm">
                    {job.kind === "channel_scrape"
                      ? `Scrape · ${job.channel_id ? (nameOf.get(job.channel_id) ?? "a competitor") : "a competitor"}`
                      : job.kind === "idea_generation"
                        ? "Idea generation"
                        : "Transcript"}
                  </p>
                  {/* A failure says WHY, on the row. An error hidden behind a
                      click is an error nobody reads. */}
                  {job.status === "failed" && job.error && (
                    <p className="text-destructive mt-0.5 text-xs">{job.error}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={`font-mono text-[0.62rem] tracking-wide uppercase ${
                      job.status === "failed"
                        ? "text-destructive"
                        : job.status === "succeeded"
                          ? "text-muted-foreground"
                          : "text-[var(--brand-2)]"
                    }`}
                  >
                    {job.status}
                  </span>
                  <span className="text-muted-foreground font-mono text-[0.62rem]">
                    {ago(job.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ------------------------------------------------------------ outliers */}
      {allVideos.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold tracking-tight">Best of this project</h3>
            <Link
              href="/outliers"
              className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
            >
              All outliers
            </Link>
          </div>
          <VideoTable videos={allVideos.slice(0, 8)} channelNames={Object.fromEntries(nameOf)} />
        </section>
      )}

      {/* --------------------------------------------------------------- ideas */}
      {allIdeas.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold tracking-tight">Latest ideas</h3>
            <Link
              href="/idea-lab"
              className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
            >
              Open the Idea lab
            </Link>
          </div>
          <div className="grid gap-3">
            {allIdeas.slice(0, 2).map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                channelName={nameOf.get(idea.channel_id)}
                evidence={resolveEvidence(idea.evidence_video_ids, evidenceIndex)}
              />
            ))}
          </div>
        </section>
      )}
    </WorkspacePanel>
  );
}
