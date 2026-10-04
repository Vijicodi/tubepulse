"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Removing a competitor.
 *
 * Its videos, ideas and any calendar slots for those ideas cascade with it.
 * Its runs do NOT: since 0018 a job's channel_id goes NULL instead, because
 * the run allowance is a count of jobs and tidying up must not hand runs back.
 *
 * No owner filter — the "own channels" policy scopes the delete, and a foreign
 * id simply matches nothing, which is reported as "not found".
 */

export type DeleteState = { error: string | null };

const idSchema = z.uuid();

export async function deleteChannel(
  _prev: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  const user = await getUser();
  if (!user) redirect("/login");

  const parsed = idSchema.safeParse(formData.get("channelId"));
  if (!parsed.success) return { error: "That competitor could not be found." };

  const supabase = await createServerClient();

  // A scrape still in flight would land on a deleted channel, fail, and a
  // failed run is not counted — deleting mid-run would be a free scrape.
  const { data: running } = await supabase
    .from("jobs")
    .select("id")
    .eq("channel_id", parsed.data)
    .in("status", ["queued", "running"])
    .limit(1)
    .maybeSingle();

  if (running) {
    return { error: "A run is still reading this account. Remove it once it finishes." };
  }

  // Detach the runs FIRST, so they survive the delete whether or not
  // migration 0018 (which turns the cascade into SET NULL) has been applied.
  // A run that happened stays counted — deleting must never refund runs.
  // Service role because users can only read jobs; scoped to this owner.
  const { error: detachError } = await createAdminClient()
    .from("jobs")
    .update({ channel_id: null })
    .eq("owner_id", user.id)
    .eq("channel_id", parsed.data);
  if (detachError) return { error: "Could not remove that competitor. Try again." };

  const { data: deleted, error } = await supabase
    .from("channels")
    .delete()
    .eq("id", parsed.data)
    .select("id");

  if (error) return { error: `Could not remove it: ${error.message}` };
  if (!deleted || deleted.length === 0) {
    return { error: "That competitor could not be found." };
  }

  // Outliers, patterns, hooks, ideas, the calendar and both project pages all
  // read this channel's rows, so the whole workspace goes stale at once.
  revalidatePath("/", "layout");
  return { error: null };
}
