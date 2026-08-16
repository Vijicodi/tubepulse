import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { failJob, ingestRun } from "@/lib/apify/ingest";
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
 *   2. Be safe to run twice. Apify re-delivers webhooks, and the sync endpoint
 *      may have ingested the same run already. Every write is an upsert.
 *   3. Always return 200 once the secret checks out, even on internal failure —
 *      otherwise Apify retries forever. Failures are recorded on the job row,
 *      where the user can actually see them.
 *
 * The actual ingest lives in `lib/apify/ingest.ts`, shared with the polling
 * fallback at `/api/jobs/[id]/sync`.
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

  if (eventType !== "ACTOR.RUN.SUCCEEDED") {
    await failJob(
      supabase,
      jobId,
      `Scrape ${eventType.split(".").pop()?.toLowerCase() ?? "did not succeed"}.`,
    );
    return NextResponse.json({ ok: true });
  }

  try {
    await ingestRun(supabase, jobId, defaultDatasetId);
  } catch (error) {
    await failJob(
      supabase,
      jobId,
      error instanceof Error ? error.message : "Unknown failure.",
    );
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
