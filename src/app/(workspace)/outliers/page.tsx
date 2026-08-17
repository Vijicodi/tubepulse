import Link from "next/link";
import { EmptyState, WorkspacePanel } from "@/components/workspace/panel";
import { CreateProjectForm } from "@/components/workspace/create-project-form";
import { VideoTable } from "@/components/workspace/video-table";
import { ChannelSection } from "@/components/workspace/channel-section";
import { getCurrentProject } from "@/lib/projects/current";
import { createServerClient } from "@/lib/supabase/server";
import type { VideoRow } from "@/lib/supabase/types";
import { ScoreStrip, StatTiles } from "@/components/workspace/score-strip";
import type { StripVideo } from "@/components/workspace/score-strip";

export const metadata = { title: "Outliers — TubePulse" };

/**
 * The median of whatever metric this set is judged on.
 *
 * Recomputed here so the header can show it. Static posts contribute LIKES and
 * everything else contributes views, matching how `scoreVideos` ranked them —
 * a header median computed a different way from the scores beneath it would
 * quietly contradict them.
 */
function medianViews(videos: VideoRow[]): number | null {
  const counts = videos
    .map((video) => (video.kind === "post" ? video.like_count : video.view_count))
    .filter((count): count is number => typeof count === "number")
    .sort((a, b) => a - b);

  if (counts.length === 0) return null;

  const middle = Math.floor(counts.length / 2);
  return counts.length % 2 === 0
    ? Math.round(((counts[middle - 1] ?? 0) + (counts[middle] ?? 0)) / 2)
    : (counts[middle] ?? null);
}

function compact(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 })
    .format(value);
}

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
    .select("id, title, handle, platform")
    .eq("project_id", project.id);

  const channelIds = (channels ?? []).map((channel) => channel.id);

  const { data: videos } = channelIds.length
    ? await supabase
        .from("videos")
        .select("*")
        .in("channel_id", channelIds)
        .order("outlier_score", { ascending: false, nullsFirst: false })
    : { data: [] as VideoRow[] };

  // ONE SECTION PER CHANNEL, not one merged list.
  //
  // A score is views ÷ THAT channel's own median, so a 3.0 from a small channel
  // and a 3.0 from a huge one mean the same thing about the channel and utterly
  // different things about the video. Ranking them against each other in a
  // single table invited a comparison the number does not support — and made
  // the page unreadable once a project held more than one competitor.
  const groups = (channels ?? [])
    .map((channel) => {
      const own = (videos ?? []).filter((video) => video.channel_id === channel.id);
      const reels = own.filter((video) => video.kind === "reel").length;
      const statics = own.filter((video) => video.kind === "post").length;

      return {
        id: channel.id,
        name: channel.title ?? channel.handle,
        handle: channel.handle,
        platform: channel.platform,
        // An Instagram account has TWO medians — one for reels, one for posts —
        // because they are scored in separate pools. Showing one number would
        // be picking a side; the header shows the mix instead.
        median: channel.platform === "instagram" ? null : medianViews(own),
        mix:
          channel.platform === "instagram"
            ? `${reels} ${reels === 1 ? "reel" : "reels"} · ${statics} ${statics === 1 ? "post" : "posts"}`
            : null,
        videos: own.slice(0, 20),
        total: own.length,
        strip: own
          .filter((video) => typeof video.outlier_score === "number")
          // Capped: a strip with thousands of marks is a smear, not a chart.
          .slice(0, 300)
          .map<StripVideo>((video) => ({
            id: video.id,
            title: video.title,
            score: Number(video.outlier_score),
            views: Number(video.view_count ?? 0),
            url: video.url,
          })),
        breakouts: own.filter((video) => Number(video.outlier_score ?? 0) >= 3).length,
        best: own.reduce<number | null>((best, video) => {
          const score = video.outlier_score;
          if (typeof score !== "number") return best;
          return best === null ? score : Math.max(best, score);
        }, null),
      };
    })
    // Busiest channel first; an empty one is still shown, so a failed scrape is
    // visible rather than silently absent.
    .sort((a, b) => b.total - a.total);

  const nothingYet = groups.every((group) => group.total === 0);

  const totalVideos = groups.reduce((sum, group) => sum + group.total, 0);
  const breakouts = groups.reduce((sum, group) => sum + group.breakouts, 0);
  const bestScore = groups.reduce<number | null>(
    (best, group) =>
      group.best === null ? best : best === null ? group.best : Math.max(best, group.best),
    null,
  );

  return (
    <WorkspacePanel
      title="Outliers"
      description="Score is views ÷ that channel's own median. 1.0 is typical for them; 3.0 is three times their normal."
    >
      {nothingYet ? (
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
        <div className="flex flex-col gap-14">
          <StatTiles
            videos={totalVideos}
            breakouts={breakouts}
            best={bestScore}
            channels={groups.length}
          />

          <div className="flex flex-col gap-3">
            {groups.map((group, index) => (
              <ChannelSection
                key={group.id}
                name={group.name}
                href={`/channels/${group.id}`}
                median={group.mix ?? compact(group.median)}
                total={group.total}
                unit={group.platform === "instagram" ? "post" : "video"}
                showMedianLabel={group.platform !== "instagram"}
                defaultOpen={index === 0}
              >
                {group.total === 0 ? (
                  <EmptyState>
                    Nothing scored for {group.handle} yet. The scrape may still be
                    running.
                  </EmptyState>
                ) : (
                  <div className="flex flex-col gap-6">
                    <ScoreStrip videos={group.strip} />
                    <VideoTable videos={group.videos} />
                  </div>
                )}
              </ChannelSection>
            ))}
          </div>
        </div>
      )}
    </WorkspacePanel>
  );
}
