import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import {
  EmptyState,
  PanelBadge,
  WorkspacePanel,
} from "@/components/workspace/panel";
import { StatGrid } from "@/components/workspace/stat-grid";
import {
  ScoreStrip,
  type StripVideo,
} from "@/components/workspace/score-strip";
import { VideoTable } from "@/components/workspace/video-table";
import { IdeaCard } from "@/components/workspace/idea-card";
import { indexByVideoId, resolveEvidence } from "@/lib/ideas/evidence";
import { createServerClient } from "@/lib/supabase/server";
import type { VideoKind, VideoRow } from "@/lib/supabase/types";

export const metadata = { title: "Competitor — TubePulse" };

/** The metric a row is judged on — likes for a static post, views otherwise. */
function metricOf(video: VideoRow): number | null {
  return video.kind === "post" ? video.like_count : video.view_count;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function compact(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

const KIND_LABEL: Record<VideoKind, string> = {
  video: "Videos",
  reel: "Reels",
  post: "Posts",
};

/**
 * How often they publish, in plain words.
 *
 * Measured across the span actually observed rather than a fixed window: 40
 * posts covering two years means something very different from 40 covering two
 * months, and one fixed rate would describe neither honestly.
 */
function cadence(videos: VideoRow[]): string {
  if (videos.length < 2) return "—";

  const times = videos
    .map((video) => new Date(video.published_at).getTime())
    .sort();
  const spanDays = (times[times.length - 1] - times[0]) / 86_400_000;

  if (spanDays < 1) return "several a day";

  const perWeek = (videos.length / spanDays) * 7;

  if (perWeek >= 7) return `${Math.round(perWeek / 7)} a day`;
  if (perWeek >= 1) return `${perWeek.toFixed(1)} a week`;
  return `${(perWeek * 4.345).toFixed(1)} a month`;
}

export default async function ChannelPage({
  params,
}: {
  // Next 16: route params are a Promise.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();

  // RLS means this returns nothing unless the channel belongs to this user, so
  // it doubles as the ownership check.
  const { data: channel } = await supabase
    .from("channels")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!channel) notFound();

  const [{ data: videos }, { data: ideas }] = await Promise.all([
    supabase
      .from("videos")
      .select("*")
      .eq("channel_id", channel.id)
      .order("outlier_score", { ascending: false, nullsFirst: false }),
    supabase
      .from("ideas")
      .select("*")
      .eq("channel_id", channel.id)
      .order("confidence", { ascending: false })
      .limit(4),
  ]);

  const all = videos ?? [];
  const isInstagram = channel.platform === "instagram";
  const name = channel.title ?? channel.handle;

  // One group per kind, because that is how the scores were computed. Merging
  // reels and photos into one list would invite a comparison the number does
  // not support.
  const kinds = [...new Set(all.map((video) => video.kind))] as VideoKind[];

  const groups = kinds
    .map((kind) => {
      const own = all.filter((video) => video.kind === kind);
      return {
        kind,
        label: KIND_LABEL[kind],
        videos: own,
        median: median(
          own.map(metricOf).filter((value): value is number => value !== null),
        ),
        unit: kind === "post" ? "likes" : kind === "reel" ? "plays" : "views",
      };
    })
    .sort((a, b) => b.videos.length - a.videos.length);

  const breakouts = all.filter(
    (video) => Number(video.outlier_score ?? 0) >= 3,
  ).length;

  const evidenceIndex = indexByVideoId(all);

  return (
    <WorkspacePanel
      title={name}
      description={`Everything collected for ${channel.handle}, scored against their own baseline.`}
      badge={<PanelBadge>{isInstagram ? "Instagram" : "YouTube"}</PanelBadge>}
      action={
        <a
          href={channel.channel_url}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm underline underline-offset-2"
        >
          Open on {isInstagram ? "Instagram" : "YouTube"}
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      }
    >
      <div className="flex flex-col gap-10">
        <Link
          href="/competitors"
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-xs"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          All competitors
        </Link>

        {all.length === 0 ? (
          <EmptyState>
            Nothing collected for {channel.handle} yet. The scrape may still be
            running.
          </EmptyState>
        ) : (
          <>
            <StatGrid
              tiles={[
                {
                  label: isInstagram ? "Followers" : "Subscribers",
                  value:
                    channel.subscriber_count === null
                      ? "—"
                      : compact(Number(channel.subscriber_count)),
                  note: `${all.length} ${isInstagram ? "posts" : "videos"} collected`,
                },
                {
                  label: "Breakouts",
                  value: breakouts.toLocaleString("en-IN"),
                  note: "3× their own median or better",
                },
                {
                  label: "Publishes",
                  value: cadence(all),
                  note: "across the span collected",
                },
              ]}
            />

            {groups.map((group) => (
              <section key={group.kind} className="flex flex-col gap-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold tracking-tight">
                    {group.label}
                  </h3>
                  <p className="text-muted-foreground font-mono text-[0.62rem] tracking-[0.14em] uppercase">
                    {group.videos.length} · median {compact(group.median)}{" "}
                    {group.unit}
                  </p>
                </div>

                <ScoreStrip
                  videos={group.videos
                    .filter((video) => typeof video.outlier_score === "number")
                    .slice(0, 300)
                    .map<StripVideo>((video) => ({
                      id: video.id,
                      title: video.title,
                      score: Number(video.outlier_score),
                      views: Number(metricOf(video) ?? 0),
                      url: video.url,
                    }))}
                />

                <VideoTable videos={group.videos.slice(0, 15)} />
              </section>
            ))}

            <section className="flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold tracking-tight">
                  Ideas from this account
                </h3>
                <Link
                  href="/idea-lab"
                  className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
                >
                  Open the Idea lab
                </Link>
              </div>

              {!ideas || ideas.length === 0 ? (
                <EmptyState>
                  No ideas generated from {channel.handle} yet. The Idea lab
                  reads the breakouts above and proposes concepts from them.
                </EmptyState>
              ) : (
                <div className="grid gap-3">
                  {ideas.map((idea) => (
                    <IdeaCard
                      key={idea.id}
                      idea={idea}
                      evidence={resolveEvidence(
                        idea.evidence_video_ids,
                        evidenceIndex,
                      )}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </WorkspacePanel>
  );
}
