import Link from "next/link";
import { EmptyState, WorkspacePanel } from "@/components/workspace/panel";
import { CreateProjectForm } from "@/components/workspace/create-project-form";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Project — TubePulse" };

export default async function ProjectPage() {
  const supabase = await createServerClient();

  // The most recently created project stands in as "current" until project
  // switching lands. One query, and it is always a project the user owns.
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!project) {
    return (
      <WorkspacePanel
        title="Project"
        description="You do not have a workspace yet."
      >
        <CreateProjectForm />
      </WorkspacePanel>
    );
  }

  return (
    <WorkspacePanel
      title={project.name}
      description={project.description ?? "No description yet."}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="surface-raised rounded-xl p-5">
          <p className="text-muted-foreground text-xs tracking-wide uppercase">Niche</p>
          <p className="mt-1.5 text-sm">{project.niche ?? "Not set"}</p>
        </div>
        <div className="surface-raised rounded-xl p-5">
          <p className="text-muted-foreground text-xs tracking-wide uppercase">Created</p>
          <p className="mt-1.5 font-mono text-sm">
            {new Date(project.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
      </div>

      <EmptyState>
        Competitor research arrives in the next feature. Once it does, this page
        shows what this project has learned. Meanwhile you can{" "}
        <Link href="/projects" className="text-foreground underline underline-offset-2">
          switch projects
        </Link>
        .
      </EmptyState>
    </WorkspacePanel>
  );
}
