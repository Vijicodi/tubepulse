import Link from "next/link";
import { EmptyState, PanelBadge, WorkspacePanel } from "@/components/workspace/panel";
import { CreateProjectForm } from "@/components/workspace/create-project-form";
import { StatGrid } from "@/components/workspace/stat-grid";
import { IdeaCard } from "@/components/workspace/idea-card";
import {
  GenerateCost,
  GenerateIdeasButton,
} from "@/components/workspace/generate-ideas-button";
import { indexByVideoId, resolveEvidence } from "@/lib/ideas/evidence";
import { getQuota } from "@/lib/billing/store";
import { getCurrentProject } from "@/lib/projects/current";
import { createServerClient } from "@/lib/supabase/server";
import type { IdeaRow, VideoRow } from "@/lib/supabase/types";

export const metadata = { title: "Idea lab — TubePulse" };

export default async function IdeaLabPage() {
  const project = await getCurrentProject();

  if (!project) {
    return (
      <WorkspacePanel
        title="Idea lab"
        description="Source-backed concepts generated from current patterns."
      >
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
    .select("id, title, handle")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false });

  const channelIds = (channels ?? []).map((channel) => channel.id);

  const [{ data: ideas }, { data: videos }, quota] = await Promise.all([
    channelIds.length
      ? supabase
          .from("ideas")
          .select("*")
          .in("channel_id", channelIds)
          .order("confidence", { ascending: false })
      : Promise.resolve({ data: [] as IdeaRow[] }),
    channelIds.length
      ? supabase
          .from("videos")
          .select("id, channel_id, video_id, title, url, outlier_score")
          .in("channel_id", channelIds)
      : Promise.resolve({ data: [] as VideoRow[] }),
    user
      ? getQuota(supabase, user.id)
      : Promise.resolve(null),
  ]);

  const allIdeas = ideas ?? [];
  const evidenceIndex = indexByVideoId(videos ?? []);

  // One group per channel, in the same shape as Outliers: an idea is drawn from
  // one channel's evidence, so merging them into a single ranked list would
  // invite a comparison the confidence number does not support.
  const groups = (channels ?? []).map((channel) => ({
    id: channel.id,
    name: channel.title ?? channel.handle,
    handle: channel.handle,
    ideas: allIdeas.filter((idea) => idea.channel_id === channel.id),
    hasVideos: (videos ?? []).some((video) => video.channel_id === channel.id),
  }));

  const saved = allIdeas.filter((idea) => idea.saved_at !== null).length;
  const averageConfidence =
    allIdeas.length === 0
      ? null
      : Math.round(
          allIdeas.reduce((sum, idea) => sum + idea.confidence, 0) / allIdeas.length,
        );

  if (groups.length === 0) {
    return (
      <WorkspacePanel
        title="Idea lab"
        description="Source-backed concepts generated from current patterns."
        badge={<PanelBadge>Source-grounded</PanelBadge>}
      >
        <EmptyState>
          Ideas are drawn from videos you have already collected, so there is
          nothing to work from yet.{" "}
          <Link
            href="/competitors"
            className="text-foreground underline underline-offset-2"
          >
            Research a competitor
          </Link>{" "}
          first.
        </EmptyState>
      </WorkspacePanel>
    );
  }

  return (
    <WorkspacePanel
      title="Idea lab"
      description="Every idea cites the videos it came from, so you can check the reasoning rather than trust it."
      badge={<PanelBadge>Source-grounded</PanelBadge>}
    >
      <div className="flex flex-col gap-8">
        <StatGrid
          tiles={[
            {
              label: "Ideas",
              value: allIdeas.length.toLocaleString("en-IN"),
              note: `from ${groups.length} ${groups.length === 1 ? "channel" : "channels"}`,
            },
            {
              label: "Saved",
              value: saved.toLocaleString("en-IN"),
              note: "on your shortlist",
            },
            {
              label: "Average confidence",
              value: averageConfidence === null ? "—" : String(averageConfidence),
              note: "as the model reported it, out of 100",
            },
          ]}
        />

        {quota && <GenerateCost remaining={quota.remaining} />}

        <div className="flex flex-col gap-10">
          {groups.map((group) => (
            <section key={group.id} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold tracking-tight">
                    {group.name}
                  </h3>
                  <p className="text-muted-foreground font-mono text-xs">
                    {group.handle} ·{" "}
                    {group.ideas.length === 0
                      ? "no ideas yet"
                      : `${group.ideas.length} ${group.ideas.length === 1 ? "idea" : "ideas"}`}
                  </p>
                </div>

                {group.hasVideos && (
                  <GenerateIdeasButton
                    channelId={group.id}
                    channelName={group.name}
                    hasIdeas={group.ideas.length > 0}
                  />
                )}
              </div>

              {!group.hasVideos ? (
                <EmptyState>
                  No videos stored for {group.handle} yet. The scrape may still be
                  running — ideas need the evidence first.
                </EmptyState>
              ) : group.ideas.length === 0 ? (
                <EmptyState>
                  Nothing generated for {group.handle} yet. Generating reads its
                  breakout videos and proposes concepts from them.
                </EmptyState>
              ) : (
                <div className="grid gap-3">
                  {group.ideas.map((idea) => (
                    <IdeaCard
                      key={idea.id}
                      idea={idea}
                      evidence={resolveEvidence(idea.evidence_video_ids, evidenceIndex)}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </WorkspacePanel>
  );
}
