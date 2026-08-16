import { EmptyState, PanelBadge, WorkspacePanel } from "@/components/workspace/panel";
import { CreateProjectForm } from "@/components/workspace/create-project-form";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Idea lab — TubePulse" };

export default async function Page() {
  const supabase = await createServerClient();
  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true });

  const hasProject = (count ?? 0) > 0;

  return (
    <WorkspacePanel
      title="Idea lab"
      description="Source-backed concepts generated from current patterns."
      badge={<PanelBadge>Source-grounded</PanelBadge>}
    >
      {hasProject ? (
        <EmptyState>No source-grounded ideas yet. Run research, then generate a bounded set of ideas from that evidence.</EmptyState>
      ) : (
        <CreateProjectForm />
      )}
    </WorkspacePanel>
  );
}
