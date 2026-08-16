import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, WorkspacePanel } from "@/components/workspace/panel";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/projects/current";
import { selectProject } from "@/lib/projects/actions";

export const metadata = { title: "All projects — TubePulse" };

export default async function ProjectsPage() {
  const supabase = await createServerClient();

  const [{ data: projects }, current] = await Promise.all([
    supabase.from("projects").select("*").order("created_at", { ascending: false }),
    getCurrentProject(),
  ]);

  return (
    <WorkspacePanel
      title="All projects"
      description="Return to any private research workspace or start a new one."
      action={
        <Button asChild className="bg-brand-gradient text-white">
          <Link href="/projects/new">
            <Plus aria-hidden />
            New project
          </Link>
        </Button>
      }
    >
      {!projects || projects.length === 0 ? (
        <EmptyState>
          No projects yet. Create a project to begin competitor research.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((project) => (
            <li key={project.id}>
              <form action={selectProject} className="h-full">
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="redirectTo" value="/project" />
                <button
                  type="submit"
                  className="surface-raised lift hover:border-border block h-full w-full rounded-xl p-5 text-left hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold tracking-tight">{project.name}</h3>
                    {current?.id === project.id && (
                      <span className="bg-brand-gradient shrink-0 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold tracking-wide text-white uppercase">
                        Current
                      </span>
                    )}
                  </div>
                {project.niche && (
                  <p className="mt-1 text-xs text-[var(--brand-2)]">{project.niche}</p>
                )}
                {project.description && (
                  <p className="text-muted-foreground mt-2 line-clamp-3 text-sm">
                    {project.description}
                  </p>
                )}
                  <p className="text-muted-foreground mt-4 font-mono text-[0.68rem]">
                    {new Date(project.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </WorkspacePanel>
  );
}
