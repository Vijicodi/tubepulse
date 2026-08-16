import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { fetchRunItems } from "@/lib/apify/client";
import { normalizeApifyDataset } from "@/lib/apify/normalize";
import { scoreVideos } from "@/lib/ideas/score";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/webhooks/apify — where a finished scrape lands.
 *
 * This is a PUBLIC url. Three things follow from that, and all three are
 * implemented below:
 *
 *   1. Verify the shared secret before doing anything. Constant-time compare,
 *      so the endpoint cannot be probed a character at a time.
 *   2. Be safe to run twice. Apify re-delivers webhooks. Every write here is
 *      an upsert on a unique key, so a duplicate delivery is a no-op.
 *   3. Always return 200 once the secret checks out, even on internal failure —
 *      otherwise Apify retries forever. Failures are recorded on the job row,
 *      where the user can actually see them.
 */

export const runtime = "nodejs";

const payloadSchema = z.object({
  jobId: z.uuid(),
  secret: z.string().min(1),
  eventType: z.string(),
  runId: z.string(),
  defaultDatasetId: z.string(),
  status: z.string().optional(),
});

export async function POST(request: Request) {
  const payload = payloadSchema.safeParse(await request.json().catch(() => null));

  if (!payload.success) {
    return NextResponse.json({ error: "Malformed payload." }, { status: 400 });
  }

  if (!secretMatches(payload.data.secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { jobId, eventType, defaultDatasetId } = payload.data;
  const supabase = createAdminClient();

  // Apify told us the run did not succeed. Record it and stop.
  if (eventType !== "ACTOR.RUN.SUCCEEDED") {
    await supabase
      .from("jobs")
      .update({
        status: "failed",
        error: `Scrape ${eventType.split(".").pop()?.toLowerCase() ?? "did not succeed"}.`,
      })
      .eq("id", jobId);

    return NextResponse.json({ ok: true });
  }

  try {
    const { data: job } = await supabase
      .from("jobs")
      .select("id, channel_id")
      .eq("id", jobId)
      .single();

    if (!job?.channel_id) {
      throw new Error("Job has no channel attached.");
    }

    const items = await fetchRunItems(defaultDatasetId);
    const { channel, videos, rejected } = normalizeApifyDataset(items);

    if (videos.length === 0) {
      throw new Error(
        "The scrape returned no usable videos. The channel may be empty, private, or the actor's output shape changed.",
      );
    }

    const scored = scoreVideos(videos);

    // Upsert on (channel_id, video_id) — this is what makes re-delivery safe.
    const { error: videoError } = await supabase.from("videos").upsert(
      scored.map((video) => ({
        channel_id: job.channel_id!,
        video_id: video.videoId,
        title: video.title,
        url: video.url,
        thumbnail_url: video.thumbnailUrl,
        duration_seconds: video.durationSeconds,
        view_count: video.viewCount,
        like_count: video.likeCount,
        comment_count: video.commentCount,
        published_at: video.publishedAt,
        outlier_score: video.outlierScore,
        velocity: video.velocity,
      })),
      { onConflict: "channel_id,video_id" },
    );

    if (videoError) throw new Error(`Could not save videos: ${videoError.message}`);

    if (channel) {
      await supabase
        .from("channels")
        .update({
          title: channel.title,
          subscriber_count: channel.subscriberCount,
          thumbnail_url: channel.thumbnailUrl,
          last_scraped_at: new Date().toISOString(),
        })
        .eq("id", job.channel_id);
    }

    if (rejected.length > 0) {
      console.warn(`[apify-webhook] dropped items on job ${jobId}:`, rejected);
    }

    // Flipping this to 'succeeded' is what the browser is waiting on.
    await supabase.from("jobs").update({ status: "succeeded", error: null }).eq("id", jobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown failure.";
    await supabase.from("jobs").update({ status: "failed", error: message }).eq("id", jobId);
  }

  // 200 regardless — see rule 3 above.
  return NextResponse.json({ ok: true });
}

function secretMatches(candidate: string): boolean {
  const expected = serverEnv().APIFY_WEBHOOK_SECRET;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
