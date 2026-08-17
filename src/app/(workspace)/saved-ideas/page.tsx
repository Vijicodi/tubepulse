import Link from "next/link";
import { EmptyState, PanelBadge, WorkspacePanel } from "@/components/workspace/panel";
import { CreateProjectForm } from "@/components/workspace/create-project-form";
import { IdeaCard } from "@/components/workspace/idea-card";
import { indexByVideoId, resolveEvidence } from "@/lib/ideas/evidence";
import { getCurrentProject } from "@/lib/projects/current";
import { createServerClient } from "@/lib/supabase/server";
import type { VideoRow } from "@/lib/supabase/types";

export const metadata = { title: "Saved ideas — TubePulse" };

export default async function SavedIdeasPage() {
  const project = await getCurrentProject();

  if (!project) {
    return (
      <WorkspacePanel
        title="Saved ideas"
        description="Your shortlisted concepts, ready to refine."
      >
        <CreateProjectForm />
      </WorkspacePanel>
    );
  }

  const supabase = await createServerClient();

  const { data: channels } = await supabase
    .from("channels")
    .select("id, title, handle")
    .eq("project_id", project.id);

  const channelIds = (channels ?? []).map((channel) => channel.id);

  // Newest shortlisting first: the ordering the page is actually read in, and
  // the reason `saved_at` is a timestamp rather than a boolean.
  const [{ data: ideas }, { data: videos }] = await Promise.all([
    channelIds.length
      ? supabase
          .from("ideas")
          .select("*")
          .in("channel_id", channelIds)
          .not("saved_at", "is", null)
          .order("saved_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    channelIds.length
      ? supabase
          .from("videos")
          .select("id, channel_id, video_id, title, url, outlier_score")
          .in("channel_id", channelIds)
      : Promise.resolve({ data: [] as VideoRow[] }),
  ]);

  const saved = ideas ?? [];
  const evidenceIndex = indexByVideoId(videos ?? []);
  const nameOf = new Map(
    (channels ?? []).map((channel) => [channel.id, channel.title ?? channel.handle]),
  );

  return (
    <WorkspacePanel
      title="Saved ideas"
      description={`Shortlisted in ${project.name}, with the evidence still attached — so a decision made weeks ago can still be explained.`}
      badge={<PanelBadge>Shortlist</PanelBadge>}
    >
      {saved.length === 0 ? (
        <EmptyState>
          Nothing shortlisted yet. Save an idea in the{" "}
          <Link
            href="/idea-lab"
            className="text-foreground underline underline-offset-2"
          >
            Idea lab
          </Link>{" "}
          and it will keep here with the videos behind it.
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {saved.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              channelName={nameOf.get(idea.channel_id)}
              evidence={resolveEvidence(idea.evidence_video_ids, evidenceIndex)}
            />
          ))}
        </div>
      )}
    </WorkspacePanel>
  );
}
