import { NextResponse } from "next/server";
import { z } from "zod";
import { gatherWebContext } from "@/lib/firecrawl/enrich";
import { generateIdeas } from "@/lib/ideas/generate";
import { selectOutliers } from "@/lib/ideas/score";
import { createServerClient } from "@/lib/supabase/server";
import type { Video } from "@/lib/schemas/youtube";

/**
 * POST /api/ideas — generate ideas from a channel we have already scraped.
 *
 * Unlike the scrape, this finishes in seconds, so it can be a normal
 * request/response. If it ever grows past ~30s, move it behind the same jobs
 * pattern rather than raising the timeout.
 */

export const maxDuration = 60;

const bodySchema = z.object({ channelId: z.uuid() });

export async function POST(request: Request) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to generate ideas." }, { status: 401 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // RLS means this returns nothing if the channel is not theirs.
  const { data: channel } = await supabase
    .from("channels")
    .select("id, title, handle")
    .eq("id", body.data.channelId)
    .single();

  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  const { data: videoRows } = await supabase
    .from("videos")
    .select("*")
    .eq("channel_id", channel.id)
    .order("outlier_score", { ascending: false })
    .limit(200);

  if (!videoRows || videoRows.length === 0) {
    return NextResponse.json(
      { error: "No videos stored for this channel yet. Run the research step first." },
      { status: 409 },
    );
  }

  const videos: Video[] = videoRows.map((row) => ({
    videoId: row.video_id,
    title: row.title,
    url: row.url,
    thumbnailUrl: row.thumbnail_url,
    durationSeconds: row.duration_seconds,
    viewCount: Number(row.view_count),
    likeCount: row.like_count === null ? null : Number(row.like_count),
    commentCount: row.comment_count === null ? null : Number(row.comment_count),
    publishedAt: row.published_at,
  }));

  const outliers = selectOutliers(videos);
  if (outliers.length === 0) {
    return NextResponse.json(
      {
        error:
          "Nothing on this channel beats its own median by enough to call an outlier. Try a channel with more variance.",
      },
      { status: 422 },
    );
  }

  const channelTitle = channel.title ?? channel.handle;

  try {
    const webContext = await gatherWebContext(channelTitle, outliers);
    const ideas = await generateIdeas({ channelTitle, outliers, webContext });

    const { error: insertError } = await supabase.from("ideas").insert(
      ideas.map((idea) => ({
        owner_id: user.id,
        channel_id: channel.id,
        title: idea.title,
        angle: idea.angle,
        reasoning: idea.reasoning,
        confidence: idea.confidence,
        evidence_video_ids: idea.evidenceVideoIds,
      })),
    );

    if (insertError) {
      return NextResponse.json(
        { error: `Could not save ideas: ${insertError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ count: ideas.length, ideas });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Idea generation failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
