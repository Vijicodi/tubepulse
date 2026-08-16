import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchRunItems } from "./client";
import { normalizeApifyDataset } from "./normalize";
import { scoreVideos } from "@/lib/ideas/score";
import type { Database } from "@/lib/supabase/types";

/**
 * Turning a finished Apify run into rows.
 *
 * This lives in its own module because TWO callers need it and they must behave
 * identically:
 *
 *   1. the webhook — the fast path, fires the moment Apify finishes
 *   2. the sync endpoint — a polling fallback, so local development works
 *      without exposing a public tunnel for webhooks to reach
 *
 * If these two ever diverge you get a bug that only reproduces on one machine.
 * One function, two callers.
 *
 * Every write is an upsert on a unique key, so running this twice on the same
 * run is a no-op rather than a duplicate.
 */

export interface IngestResult {
  videoCount: number;
  rejectedCount: number;
}

export async function ingestRun(
  supabase: SupabaseClient<Database>,
  jobId: string,
  datasetId: string,
): Promise<IngestResult> {
  const { data: job } = await supabase
    .from("jobs")
    .select("id, channel_id, status")
    .eq("id", jobId)
    .single();

  if (!job?.channel_id) throw new Error("Job has no channel attached.");

  const items = await fetchRunItems(datasetId);
  const { channel, videos, rejected } = normalizeApifyDataset(items);

  if (videos.length === 0) {
    throw new Error(
      "The scrape returned no usable videos. The channel may be empty or private, " +
        "or the actor's output shape changed.",
    );
  }

  const scored = scoreVideos(videos);

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
  } else {
    // Still stamp the scrape time, so the UI never shows "never scraped" for a
    // channel we clearly just read.
    await supabase
      .from("channels")
      .update({ last_scraped_at: new Date().toISOString() })
      .eq("id", job.channel_id);
  }

  if (rejected.length > 0) {
    console.warn(`[apify-ingest] dropped items on job ${jobId}:`, rejected);
  }

  await supabase
    .from("jobs")
    .update({ status: "succeeded", error: null })
    .eq("id", jobId);

  return { videoCount: scored.length, rejectedCount: rejected.length };
}

/** Record a failure where the user can actually see it: on the job row. */
export async function failJob(
  supabase: SupabaseClient<Database>,
  jobId: string,
  message: string,
) {
  await supabase.from("jobs").update({ status: "failed", error: message }).eq("id", jobId);
}
