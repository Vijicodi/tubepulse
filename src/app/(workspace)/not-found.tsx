import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspacePanel } from "@/components/workspace/panel";

/**
 * What a workspace page shows when it calls notFound() — today a channel id
 * that is not yours, was deleted, or never existed.
 *
 * It lives in the (workspace) group so it renders INSIDE the shell: the sidebar
 * and topbar stay, and the person keeps their bearings. Before this the root
 * default 404 rendered here, and its injected white body styles washed the
 * dark sidebar grey.
 *
 * RLS makes "not yours" and "does not exist" indistinguishable, which is the
 * point, so the copy covers both without guessing.
 */
export default function WorkspaceNotFound() {
  return (
    <WorkspacePanel
      title="Not in this workspace"
      description="That link points at something that is not in your projects. It may have been removed, or it belongs to another account."
    >
      <div className="surface-raised flex flex-col items-start gap-4 rounded-2xl p-6">
        <SearchX className="text-muted-foreground/60 size-5" aria-hidden />
        <p className="text-muted-foreground max-w-prose text-sm">
          Removing a competitor deletes its videos and ideas with it, so an old
          link to one ends here. Everything still in your project is a click
          away.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild className="bg-brand-gradient text-white">
            <Link href="/competitors">
              <ArrowLeft aria-hidden />
              All competitors
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/projects">All projects</Link>
          </Button>
        </div>
      </div>
    </WorkspacePanel>
  );
}
