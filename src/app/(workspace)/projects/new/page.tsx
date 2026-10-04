import { WorkspacePanel } from "@/components/workspace/panel";
import { CreateProjectForm } from "@/components/workspace/create-project-form";
import { getBillingState } from "@/lib/billing/store";
import { projectCap } from "@/lib/projects/limit";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "New project — TubePulse" };

export default async function NewProjectPage() {
  // Read the cap up front so a plan that is full says so instead of offering a
  // form that can only fail. The action re-checks on submit regardless.
  const supabase = await createServerClient();
  const [billing, { count }] = await Promise.all([
    getBillingState(),
    supabase.from("projects").select("id", { count: "exact", head: true }),
  ]);

  return (
    <WorkspacePanel
      title="New project"
      description="Each project is a separate research workspace with its own competitors, outliers and ideas."
    >
      <CreateProjectForm
        heading="Create a project"
        description="Name it after the channel or niche you are researching."
        cap={projectCap(billing.planKey, count ?? 0)}
      />
    </WorkspacePanel>
  );
}
