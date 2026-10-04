import "server-only";
import { NextResponse } from "next/server";
import { getQuota } from "@/lib/billing/store";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createServerClient } from "@/lib/supabase/server";

/**
 * Close the gap between "checked the allowance" and "wrote the job".
 *
 * Every billable route checks the quota and THEN inserts the job row the quota
 * is counted from. Two requests landing in the same instant both pass the
 * check — found on 2026-10-04 as "Today 9/8". Postgres cannot hold a lock
 * across that HTTP gap, so instead the job is reserved first and the quota is
 * re-read with every OTHER job counted. A concurrent twin is then visible, and
 * the loser is withdrawn before any paid API is called. In a true tie both are
 * refused, which costs a retry, never money.
 *
 * Returns the refusal response, or null when the reservation stands.
 */
export async function refuseIfOverReserved(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  ownerId: string,
  jobId: string,
): Promise<NextResponse | null> {
  const quota = await getQuota(supabase, ownerId, new Date(), { excludeJobId: jobId });
  if (quota.canScrape) return null;

  await createAdminClient().from("jobs").delete().eq("id", jobId);
  return NextResponse.json(
    { error: quota.reason, quota },
    { status: quota.remaining <= 0 ? 402 : 429 },
  );
}
