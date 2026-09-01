import Image from "next/image";
import { EmptyState, WorkspacePanel } from "@/components/workspace/panel";
import { PatternPanel, TraitPanel } from "@/components/workspace/pattern-panel";
import {
  byDayOfWeek,
  byLength,
  byTitleTrait,
  engagementRates,
} from "@/lib/analytics/patterns";
import { getCurrentProject } from "@/lib/projects/current";
import { createServerClient } from "@/lib/supabase/server";
import { CreateProjectForm } from "@/components/workspace/create-project-form";

export const metadata = { title: "Patterns — TubePulse" };

/**
 * What the numbers say across everything researched in this project.
 *
 * EVERY FIGURE HERE IS FREE. It is computed from rows a scrape already paid
 * for — no allowance is spent, no provider is called, nothing is billed. That
 * is the promise on the pricing page: "reading, sorting and re-reading what you
 * already scraped is unlimited. You only pay to fetch, never to look."
 *
 * NOT GATED BY TIER, and that is deliberate. This page sells the product: a
 * free user who can see what their three runs revealed has a reason to buy
 * more. Paywalling the analysis of data someone already fetched would be
 * charging twice for one scrape.
 */
export default async function PatternsPage() {
  const project = await getCurrentProject();

  if (!project) {
    return (
      <WorkspacePanel
        title="Patterns"
        description="What the numbers say across every channel in this project."
      >
        <CreateProjectForm />
      </WorkspacePanel>
    );
  }

  const supabase = await createServerClient();

  // Channels first, then their videos: RLS scopes both to the owner, and the
  // project filter is what keeps one project's patterns out of another's.
  const { data: channels } = await supabase
    .from("channels")
    .select("id")
    .eq("project_id", project.id);

  const channelIds = (channels ?? []).map((channel) => channel.id);

  const { data: videos } = channelIds.length
    ? await supabase.from("videos").select("*").in("channel_id", channelIds)
    : { data: [] };

  const all = videos ?? [];

  if (all.length === 0) {
    return (
      <WorkspacePanel
        title="Patterns"
        description="What the numbers say across every channel in this project."
      >
        <EmptyState>
          Research a channel first. Once there are videos here, this page reads
          them for when to post, how long to run, and what the titles do — none
          of which costs a run.
        </EmptyState>
      </WorkspacePanel>
    );
  }

  const days = byDayOfWeek(all);
  const lengths = byLength(all);
  const traits = byTitleTrait(all);

  // The gallery: strongest first, and only ones that actually have artwork.
  const topThumbnails = engagementRates(all)
    .map((row) => row.video)
    .filter((video) => video.thumbnail_url !== null)
    .sort((a, b) => Number(b.outlier_score ?? 0) - Number(a.outlier_score ?? 0))
    .slice(0, 12);

  return (
    <WorkspacePanel
      title="Patterns"
      description={`Across ${all.length.toLocaleString("en-US")} videos in this project. Reading costs nothing.`}
    >
      <div className="space-y-4">
        <PatternPanel
          title="When they post"
          description="Mean outlier score by the day a video went out. Days are UTC, so a channel posting near midnight may straddle two."
          pattern={days}
          bestLabel="Best day"
        />

        <PatternPanel
          title="How long they run"
          description="Mean outlier score by video length. The 8-minute line is where mid-roll ads become available, which changes what people make."
          pattern={lengths}
          bestLabel="Best length"
        />

        <TraitPanel traits={traits} />

        {/* ------------------------------------------------------- gallery */}
        {topThumbnails.length > 0 && (
          <section className="surface-raised rounded-xl p-5">
            <h3 className="font-semibold tracking-tight">Thumbnails that worked</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              The strongest performers in this project, biggest outlier first.
              What they have in common is usually more obvious seen together.
            </p>

            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {topThumbnails.map((video) => (
                <li key={video.id}>
                  <a
                    href={video.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block"
                  >
                    <div className="bg-muted/40 relative aspect-video overflow-hidden rounded-lg">
                      {/*
                        Unoptimised: these are third-party CDN URLs that change
                        without notice, and running them through the image
                        optimiser would cache artwork we do not control and
                        cannot invalidate.
                      */}
                      <Image
                        src={video.thumbnail_url ?? ""}
                        alt={video.title}
                        fill
                        unoptimized
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                      <span className="absolute right-1.5 bottom-1.5 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[0.6rem] text-white tabular-nums">
                        {Number(video.outlier_score ?? 0).toFixed(1)}x
                      </span>
                    </div>
                    <p className="text-muted-foreground group-hover:text-foreground mt-1.5 line-clamp-2 text-xs transition-colors">
                      {video.title}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </WorkspacePanel>
  );
}
