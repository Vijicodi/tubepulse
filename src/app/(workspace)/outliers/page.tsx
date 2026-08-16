import Link from "next/link";
import { EmptyState, WorkspacePanel } from "@/components/workspace/panel";
import { CreateProjectForm } from "@/components/workspace/create-project-form";
import { VideoTable } from "@/components/workspace/video-table";
import { getCurrentProject } from "@/lib/projects/current";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Outliers — TubePulse" };

export default async function OutliersPage() {
  const project = await getCurrentProject();

  if (!project) {
    return (
      <WorkspacePanel
        title="Outliers"
        description="Videos that beat their own channel's median."
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

  const { data: videos } = channelIds.length
    ? await supabase
        .from("videos")
        .select("*")
        .in("channel_id", channelIds)
        .order("outlier_score", { ascending: false, nullsFirst: false })
        .limit(60)
    : { data: [] };

  const channelNames = Object.fromEntries(
    (channels ?? []).map((channel) => [channel.id, channel.title ?? channel.handle]),
  );

  return (
    <WorkspacePanel
      title="Outliers"
      description="Score is views ÷ that channel's own median. 1.0 is typical for them; 3.0 means three times their own normal."
    >
      {!videos || videos.length === 0 ? (
        <EmptyState>
          No calculated outliers yet.{" "}
          <Link
            href="/competitors"
            className="text-foreground underline underline-offset-2"
          >
            Research a competitor
          </Link>{" "}
          to collect evidence.
        </EmptyState>
      ) : (
        <VideoTable
          videos={videos}
          channelNames={channelIds.length > 1 ? channelNames : undefined}
        />
      )}
    </WorkspacePanel>
  );
}
