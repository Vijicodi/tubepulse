import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchRunItems } from "./client";
import { normalizeApifyDataset } from "./normalize";
import {
  instagramError,
  normalizeInstagramDataset,
} from "@/lib/schemas/instagram";
import {
  idFromUrl,
  normalizeTranscript,
  transcriptError,
} from "@/lib/schemas/transcript";
import { summariseTranscript } from "@/lib/transcripts/summarize";
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

/**
 * Turn a finished transcript run into a `transcripts` row.
 *
 * Same two callers as `ingestRun` above — the webhook and the sync fallback —
 * and the same rule: one function, never a second inlined copy. The divergence
 * only ever reproduces on one machine.
 *
 * Idempotent by the unique index on (owner_id, video_id), so it does not matter
 * whether the webhook or the poll gets here first, or whether both do.
 */
export async function ingestTranscript(
  supabase: SupabaseClient<Database>,
  jobId: string,
  datasetId: string,
): Promise<{ wordCount: number; summarised: boolean }> {
  const { data: job } = await supabase
    .from("jobs")
    .select("id, owner_id, project_id, payload, status")
    .eq("id", jobId)
    .single();

  if (!job) throw new Error("That job no longer exists.");

  const requestedUrl = job.payload?.videoUrl ?? null;

  const items = await fetchRunItems(datasetId);

  // The actor's own complaint comes FIRST. A run that rejects its input still
  // reports SUCCEEDED and writes { errorCode: "NO_VIDEOS_FOUND" } — blaming the
  // video for that sends you looking at the one place the problem is not.
  const reported = transcriptError(items);
  if (reported) throw new Error(reported);

  const transcript = normalizeTranscript(items);

  if (transcript.text === "") {
    throw new Error(
      "No captions came back for that video. It may have captions disabled, " +
        "or be private, age-restricted or a live stream.",
    );
  }

  // The actor's own id is preferred — it is what it actually transcribed. The
  // requested URL is the fallback for actors that do not echo one back.
  const videoId = transcript.videoId ?? idFromUrl(requestedUrl);

  if (!videoId) {
    throw new Error("Could not tell which video that transcript belongs to.");
  }

  // Optional enhancement: a failure here degrades to a transcript with no
  // summary, never a lost transcript.
  const summary = await summariseTranscript({
    title: transcript.title,
    text: transcript.text,
  });

  const { error } = await supabase.from("transcripts").upsert(
    {
      owner_id: job.owner_id,
      project_id: job.project_id,
      video_id: videoId,
      video_url: requestedUrl ?? `https://www.youtube.com/watch?v=${videoId}`,
      title: transcript.title,
      language: transcript.language,
      text: transcript.text,
      summary,
      word_count: transcript.wordCount,
    },
    { onConflict: "owner_id,video_id" },
  );

  if (error) throw new Error(`Could not save the transcript: ${error.message}`);

  await supabase
    .from("jobs")
    .update({ status: "succeeded", error: null })
    .eq("id", jobId);

  return { wordCount: transcript.wordCount, summarised: summary !== null };
}

/**
 * Turn a finished Instagram run into rows.
 *
 * Writes into the SAME `videos` table as a YouTube scrape, tagged with `kind`,
 * so outliers, ideas and the project pages all keep working without knowing
 * which platform a row came from. The scoring is what respects the difference —
 * one median per kind, one metric per kind.
 *
 * Shared by the webhook and the sync fallback, like everything else here.
 */
export async function ingestInstagramRun(
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

  // The actor's own complaint first — a private or empty account SUCCEEDS and
  // returns `{ noResults: true }`, which would otherwise read as our bug.
  const reported = instagramError(items);
  if (reported) throw new Error(reported);

  const { profile, posts, rejected } = normalizeInstagramDataset(items);

  if (posts.length === 0) {
    throw new Error(
      "That profile returned no usable posts. It may be private, or the " +
        "actor's output shape changed.",
    );
  }

  // Scored as Videos: the shapes line up, and `kind` is what keeps reels and
  // posts in separate pools.
  const scored = scoreVideos(
    posts.map((post) => ({
      videoId: post.postId,
      kind: post.kind,
      title: post.title,
      url: post.url,
      thumbnailUrl: post.thumbnailUrl,
      durationSeconds: post.durationSeconds,
      viewCount: post.viewCount,
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      publishedAt: post.publishedAt,
    })),
  );

  const { error: videoError } = await supabase.from("videos").upsert(
    scored.map((post) => ({
      channel_id: job.channel_id!,
      video_id: post.videoId,
      kind: post.kind ?? "post",
      title: post.title,
      url: post.url,
      thumbnail_url: post.thumbnailUrl,
      duration_seconds: post.durationSeconds,
      view_count: post.viewCount,
      like_count: post.likeCount,
      comment_count: post.commentCount,
      published_at: post.publishedAt,
      outlier_score: post.outlierScore,
      velocity: post.velocity,
    })),
    { onConflict: "channel_id,video_id" },
  );

  if (videoError) throw new Error(`Could not save posts: ${videoError.message}`);

  await supabase
    .from("channels")
    .update({
      title: profile?.fullName ?? profile?.username ?? null,
      last_scraped_at: new Date().toISOString(),
    })
    .eq("id", job.channel_id);

  if (rejected.length > 0) {
    console.warn(`[instagram-ingest] dropped items on job ${jobId}:`, rejected.length);
  }

  await supabase
    .from("jobs")
    .update({ status: "succeeded", error: null })
    .eq("id", jobId);

  return { videoCount: scored.length, rejectedCount: rejected.length };
}
