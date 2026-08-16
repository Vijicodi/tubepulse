import { NextResponse } from "next/server";
import { getRunState } from "@/lib/apify/client";
import { failJob, ingestRun } from "@/lib/apify/ingest";
import { createServerClient } from "@/lib/supabase/server";

/**
 * POST /api/jobs/[id]/sync — ask Apify directly whether this run finished.
 *
 * The webhook is the fast path, but it needs a publicly reachable URL. On
 * localhost there usually isn't one, so without this a scrape that genuinely
 * succeeded would leave the job card spinning forever and the product would
 * look broken on the very first run.
 *
 * The job card polls this while a job is running. It is idempotent: it shares
 * `ingestRun` with the webhook, and every write inside is an upsert, so it does
 * not matter which one gets there first or whether both do.
 *
 * Uses the user's client, not the admin client — RLS then guarantees a user can
 * only ever sync their own job.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id, status, external_run_id")
    .eq("id", id)
    .single();

  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  // Already finished — nothing to do. The webhook probably beat us here.
  if (job.status === "succeeded" || job.status === "failed") {
    return NextResponse.json({ status: job.status });
  }

  if (!job.external_run_id) {
    return NextResponse.json({ status: job.status });
  }

  try {
    const run = await getRunState(job.external_run_id);

    if (run.status === "SUCCEEDED") {
      if (!run.datasetId) throw new Error("The run finished without a dataset.");
      await ingestRun(supabase, id, run.datasetId);
      return NextResponse.json({ status: "succeeded" });
    }

    if (["FAILED", "ABORTED", "TIMED-OUT", "TIMING-OUT"].includes(run.status)) {
      const message = `Scrape ${run.status.toLowerCase().replace("-", " ")}.`;
      await failJob(supabase, id, message);
      return NextResponse.json({ status: "failed", error: message });
    }

    return NextResponse.json({ status: "running" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not check the run.";
    await failJob(supabase, id, message);
    return NextResponse.json({ status: "failed", error: message });
  }
}
