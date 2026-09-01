import { NextResponse } from "next/server";
import { z } from "zod";
import { getQuota, spendRefill } from "@/lib/billing/store";
import { PLANS } from "@/lib/billing/plans";
import { TrailRecorder } from "@/lib/jobs/trail";
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
 *
 * IT STILL WRITES A JOB ROW, even though nothing polls it. The allowance is
 * counted from `jobs`, so a generation with no row is a generation nobody paid
 * for — an OpenAI call anyone could repeat for free. The row is the charge.
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
    .select("id, title, handle, project_id")
    .eq("id", body.data.channelId)
    .single();

  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  // Checked BEFORE any row is written, exactly as the research route does, and
  // for the same reason: the allowance is counted from `jobs`, so a refused
  // generation must not leave a job behind or it bills for work never done.
  const quota = await getQuota(supabase, user.id);

  if (!quota.canScrape) {
    return NextResponse.json(
      { error: quota.reason, quota },
      // 402 when money would fix it, 429 when only tomorrow will.
      { status: quota.remaining <= 0 ? 402 : 429 },
    );
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

  // The row that makes this billable. Written only now — every early return
  // above refused the work, and refused work is not charged for.
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      owner_id: user.id,
      kind: "idea_generation",
      status: "running",
      project_id: channel.project_id,
      channel_id: channel.id,
      external_run_id: null,
      error: null,
    })
    .select()
    .single();

  if (jobError || !job) {
    return NextResponse.json(
      { error: `Could not queue the job: ${jobError?.message ?? "unknown error"}` },
      { status: 500 },
    );
  }

  /** Mark the job failed so it stops counting against the allowance. */
  const refund = async (message: string) => {
    await supabase.from("jobs").update({ status: "failed", error: message }).eq("id", job.id);
  };

  // Recorded for EVERY run regardless of tier, and gated at read time. A trail
  // that only starts existing when you upgrade is useless on the first day you
  // need it — see lib/jobs/trail.ts.
  const trail = new TrailRecorder();

  try {
    const webContext = await trail.track(
      "enrich",
      `Gathered web context for ${channelTitle}`,
      () => gatherWebContext(channelTitle, outliers),
    );
    // The model tier is a PLAN FEATURE, advertised on the pricing page as
    // "fast model" against "advanced reasoning model". Passing it here is what
    // makes that sentence true.
    const plan = PLANS[quota.planKey];
    const generation = await trail.track(
      "generate",
      `Asked the ${plan.model === "premium" ? "advanced" : "fast"} model for ideas from ${outliers.length} outliers`,
      () =>
        generateIdeas(
          {
            channelTitle,
            outliers,
            webContext,
            // Only ask for what this plan includes. Generating extras for a
            // tier that does not have them spends output tokens on every idea
            // and then throws the result away.
            extras: {
              titleVariants: plan.features.titleVariants,
              thumbnailConcepts: plan.features.thumbnailConcepts,
            },
          },
          plan.model,
        ),
    );

    const ideas = generation.ideas;

    const { error: insertError } = await supabase.from("ideas").insert(
      ideas.map((idea) => ({
        owner_id: user.id,
        channel_id: channel.id,
        project_id: channel.project_id,
        title: idea.title,
        angle: idea.angle,
        reasoning: idea.reasoning,
        script: idea.script,
        // Null rather than an empty array when a plan does not include these:
        // an empty list reads as "the model returned nothing", which is a
        // different fact from "this tier does not get them".
        title_variants: idea.titleVariants ?? null,
        thumbnail_concepts: idea.thumbnailConcepts ?? null,
        confidence: idea.confidence,
        evidence_video_ids: idea.evidenceVideoIds,
        saved_at: null,
      })),
    );

    if (insertError) {
      // Ideas that were generated but not stored are ideas the user never got.
      await refund(insertError.message);
      return NextResponse.json(
        { error: `Could not save ideas: ${insertError.message}` },
        { status: 500 },
      );
    }

    trail.add("store", `Saved ${ideas.length} ideas`);

    // Usage, not money. The cost is computed at read time from the rate table
    // in lib/billing/cost.ts, so a customer's breakdown never freezes against
    // rates that have since moved — see migration 0012.
    await supabase
      .from("jobs")
      .update({
        status: "succeeded",
        usage: {
          pagesEnriched: webContext.length,
          llmTier: plan.model,
          llmInputTokens: generation.inputTokens,
          llmOutputTokens: generation.outputTokens,
        },
        trail: trail.toJSON(),
      })
      .eq("id", job.id);

    // The allowance was already gone when this started, so it came out of a
    // bought pack. Recorded only now: everything that failed above returned
    // early with the job marked failed, and was never charged.
    // Charged to the refill ledger when the allowance is gone, OR when today's
    // cap is reached and this run is continuing on packs the user bought.
    if (quota.mustSpendRefill) {
      await spendRefill(user.id, job.id, "idea_generation");
    }

    return NextResponse.json({ count: ideas.length, ideas });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Idea generation failed.";
    await refund(message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
