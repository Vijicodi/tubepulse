import { EmptyState, WorkspacePanel } from "@/components/workspace/panel";
import { CreateProjectForm } from "@/components/workspace/create-project-form";
import { ResearchForm } from "@/components/workspace/research-form";
import { getCurrentProject } from "@/lib/projects/current";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Competitors — TubePulse" };

export default async function CompetitorsPage() {
  const project = await getCurrentProject();

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
      .select("id")
      .eq("project_id", project.id)
      .eq("kind", "channel_scrape")
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <WorkspacePanel
      title="Competitors"
      description={`Channels tracked in ${project.name}. Paste a handle and the agent reads their last 100 videos.`}
    >
      <ResearchForm projectId={project.id} activeJobId={runningJob?.id ?? null} />

      {!channels || channels.length === 0 ? (
        <EmptyState>
          No competitors yet. Paste a channel above and it will appear here with
          its real numbers.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {channels.map((channel) => (
            <li key={channel.id} className="surface-raised rounded-xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold tracking-tight">
                    {channel.title ?? channel.handle}
                  </h3>
                  <p className="text-muted-foreground truncate font-mono text-xs">
                    {channel.handle}
                  </p>
                </div>
                <a
                  href={channel.channel_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground shrink-0 text-xs underline underline-offset-2"
                >
                  Open
                </a>
              </div>

              <dl className="mt-4 flex gap-6 text-sm">
                <div>
                  <dt className="text-muted-foreground text-[0.68rem] tracking-wide uppercase">
                    Subscribers
                  </dt>
                  <dd className="font-mono tabular-nums">
                    {channel.subscriber_count === null
                      ? "—"
                      : Number(channel.subscriber_count).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-[0.68rem] tracking-wide uppercase">
                    Last read
                  </dt>
                  <dd className="font-mono text-xs">
                    {channel.last_scraped_at
                      ? new Date(channel.last_scraped_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : "Never"}
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
