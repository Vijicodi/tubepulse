"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerClient, getUser } from "@/lib/supabase/server";

/**
 * Shortlisting an idea.
 *
 * A single nullable timestamp on the row, flipped either way. No ownership
 * check is written here on purpose: `ideas` carries an owner-scoped RLS policy,
 * so an update naming somebody else's idea id matches zero rows and changes
 * nothing. Adding a manual check would duplicate the guarantee and invite the
 * belief that the policy is optional.
 */

const idSchema = z.uuid();

export type SaveIdeaState = { error: string | null };

async function setSaved(ideaId: string, saved: boolean): Promise<SaveIdeaState> {
  const user = await getUser();
  if (!user) return { error: "Sign in to shortlist an idea." };

  const parsed = idSchema.safeParse(ideaId);
  if (!parsed.success) return { error: "That is not an idea." };

  const supabase = await createServerClient();

  const { error } = await supabase
    .from("ideas")
    .update({ saved_at: saved ? new Date().toISOString() : null })
    .eq("id", parsed.data);

  if (error) return { error: `Could not update the idea: ${error.message}` };

  // Both pages read the same rows, so both go stale on either change.
  revalidatePath("/idea-lab");
  revalidatePath("/saved-ideas");

  return { error: null };
}

/** Form action. `saved` is "true" or "false"; anything else is a no-op save. */
export async function toggleIdeaSaved(formData: FormData): Promise<void> {
  const ideaId = String(formData.get("ideaId") ?? "");
  const saved = String(formData.get("saved") ?? "") === "true";
  await setSaved(ideaId, saved);
}

export type DeleteIdeaState = { error: string | null };

/**
 * Delete an idea for good.
 *
 * Its calendar slots go with it (ON DELETE CASCADE in 0014) — a slot is a plan
 * to make THIS idea, and a plan for something deleted is not worth keeping.
 * The confirm says so before the press. The run that generated it stays
 * counted; jobs are not touched here.
 */
export async function deleteIdea(
  _prev: DeleteIdeaState,
  formData: FormData,
): Promise<DeleteIdeaState> {
  const user = await getUser();
  if (!user) return { error: "Sign in to delete an idea." };

  const parsed = idSchema.safeParse(formData.get("ideaId"));
  if (!parsed.success) return { error: "That is not an idea." };

  const supabase = await createServerClient();

  const { data: deleted, error } = await supabase
    .from("ideas")
    .delete()
    .eq("id", parsed.data)
    .select("id");

  if (error) return { error: `Could not delete the idea: ${error.message}` };
  if (!deleted || deleted.length === 0) return { error: "That idea could not be found." };

  revalidatePath("/idea-lab");
  revalidatePath("/saved-ideas");
  revalidatePath("/calendar");
  revalidatePath("/project");
  revalidatePath("/channels/[id]", "page");
  return { error: null };
}
