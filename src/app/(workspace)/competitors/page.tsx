import { EmptyState, WorkspacePanel } from "@/components/workspace/panel";
import { CreateProjectForm } from "@/components/workspace/create-project-form";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Competitors — TubePulse" };

export default async function Page() {
  const supabase = await createServerClient();
  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true });

  const hasProject = (count ?? 0) > 0;

  return (
    <WorkspacePanel
      title="Competitors"
      description="Channels you are tracking in this project."
    >
      {hasProject ? (
        <EmptyState>No competitors yet. Research a channel and it will appear here with its real numbers.</EmptyState>
      ) : (
        <CreateProjectForm />
      )}
    </WorkspacePanel>
  );
}
