import { EmptyState, PanelBadge, WorkspacePanel } from "@/components/workspace/panel";
import { CreateProjectForm } from "@/components/workspace/create-project-form";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Saved ideas — TubePulse" };

export default async function Page() {
  const supabase = await createServerClient();
  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true });

  const hasProject = (count ?? 0) > 0;

  return (
    <WorkspacePanel
      title="Saved ideas"
      description="Your shortlisted concepts, ready to refine."
      badge={<PanelBadge>Source-grounded</PanelBadge>}
    >
      {hasProject ? (
        <EmptyState>Nothing shortlisted yet. Save an idea from the idea lab and it lands here.</EmptyState>
      ) : (
        <CreateProjectForm />
      )}
    </WorkspacePanel>
  );
}
