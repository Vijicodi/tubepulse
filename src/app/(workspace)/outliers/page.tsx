import { EmptyState, WorkspacePanel } from "@/components/workspace/panel";
import { CreateProjectForm } from "@/components/workspace/create-project-form";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Outliers — TubePulse" };

export default async function Page() {
  const supabase = await createServerClient();
  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true });

  const hasProject = (count ?? 0) > 0;

  return (
    <WorkspacePanel
      title="Outliers"
      description="Videos that beat their own channel's median."
    >
      {hasProject ? (
        <EmptyState>No calculated outliers yet. Run research to collect evidence.</EmptyState>
      ) : (
        <CreateProjectForm />
      )}
    </WorkspacePanel>
  );
}
