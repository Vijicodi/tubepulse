import { NextResponse } from "next/server";
import { z } from "zod";
import { startTranscriptRun } from "@/lib/apify/client";
import { getQuota, spendRefill } from "@/lib/billing/store";
import { isTranscriptConfigured } from "@/lib/env";
import { canUseTranscripts } from "@/lib/billing/quota";
import { idFromUrl } from "@/lib/schemas/transcript";
import { createServerClient } from "@/lib/supabase/server";

/**
 * POST /api/transcript — pull one video's captions.
 *
 * Returns in under a second with a job id, exactly like /api/research. Captions
 * are usually quick, but "usually" is not something a request timeout
 * negotiates with, so this goes through the jobs table like all slow work.
 *
 * IT SPENDS ONE SCRAPE. The captions cost about ₹0.04 and the summary about ₹2,
 * which is real money per press — see BILLABLE_JOB_KINDS in lib/billing/quota.
 */

const bodySchema = z.object({
  videoUrl: z.string().min(1, "Paste a YouTube video URL."),
  projectId: z.uuid().nullish(),
});

export async function POST(request: Request) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to extract a transcript." }, { status: 401 });
  }

  if (!isTranscriptConfigured()) {
    return NextResponse.json(
      {
        error:
          "Transcripts are not switched on: APIFY_TRANSCRIPT_ACTOR is blank in .env.local.",
      },
      { status: 503 },
    );
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  // Validated here rather than at the actor, so a mistyped URL costs nothing
  // and says what is wrong instead of failing three minutes later.
  const videoId = idFromUrl(body.data.videoUrl.trim());
  if (!videoId) {
    return NextResponse.json(
      {
        error:
          "That does not look like a YouTube video URL. It should contain ?v= or be a youtu.be link.",
      },
      { status: 400 },
    );
  }

  // Checked BEFORE any row is written — a refused request must not leave a job
  // behind, because the allowance is counted from jobs.
  const quota = await getQuota(supabase, user.id);

  // TRANSCRIPTS ARE A PAID FEATURE, and the check lives here rather than only
  // in the sidebar. A hidden nav item is not an access control: this endpoint
  // takes a POST and a session, and a transcript costs Apify plus OpenAI.
  if (!canUseTranscripts(quota.planKey)) {
    return NextResponse.json(
      {
        error: "Transcripts are on the paid plans. Your plan covers research runs.",
        quota,
      },
      // 402: money fixes this, which is more useful than a bare 403.
      { status: 402 },
    );
  }

  if (!quota.canScrape) {
    return NextResponse.json(
      { error: quota.reason, quota },
      { status: quota.remaining <= 0 ? 402 : 429 },
    );
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      owner_id: user.id,
      kind: "transcript",
      status: "queued",
      project_id: body.data.projectId ?? null,
      channel_id: null,
      external_run_id: null,
      error: null,
      // The only record of which video was asked for — the actor may not echo
      // one back, and without this a finished run cannot be attributed.
      payload: { videoUrl: body.data.videoUrl.trim() },
    })
    .select()
    .single();

  if (jobError || !job) {
    return NextResponse.json(
      { error: `Could not queue the job: ${jobError?.message ?? "unknown error"}` },
      { status: 500 },
    );
  }

  try {
    const run = await startTranscriptRun({
      videoUrl: body.data.videoUrl.trim(),
      jobId: job.id,
    });

    await supabase
      .from("jobs")
      .update({ status: "running", external_run_id: run.runId })
      .eq("id", job.id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not start the transcript run.";
    await supabase.from("jobs").update({ status: "failed", error: message }).eq("id", job.id);

    return NextResponse.json({ error: message, jobId: job.id }, { status: 502 });
  }

  // Charged only now: everything that failed above returned early with the job
  // marked failed, and a failed job is not counted.
  // Charged to the refill ledger when the allowance is gone, OR when today's
  // cap is reached and this run is continuing on packs the user bought.
  if (quota.mustSpendRefill) {
    await spendRefill(user.id, job.id, "transcript");
  }

  return NextResponse.json({ jobId: job.id, videoId }, { status: 202 });
}
