"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { createServerClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingState } from "@/lib/billing/store";
import { PROJECT_NAME_MAX, projectCap } from "./limit";
import { CURRENT_PROJECT_COOKIE } from "./current";
import { safeNext } from "@/lib/auth/safe-next";
import { projectAfterDelete } from "./after-delete";

const createProjectSchema = z.object({
  // Capped because the name is a heading on every page; a 124-character name
  // with no spaces ran 1,457px off a phone screen. The input carries the same
  // maxLength, but a form attribute is a suggestion and this is the rule.
  name: z
    .string()
    .trim()
    .min(1, "Give the project a name.")
    .max(PROJECT_NAME_MAX, `Keep the name to ${PROJECT_NAME_MAX} characters or fewer.`),
  niche: z.string().trim().max(120).optional(),
  description: z.string().trim().max(600).optional(),
});

export type ProjectFormState = {
  error: string | null;
  /**
   * What they typed, handed back with an error so the form can re-fill
   * itself. React resets an action form after it settles; without these a
   * refused submit wiped the name and niche they had just written.
   */
  values?: { name: string; niche: string; description: string };
  /** Set when the refusal is the plan's project cap, so the form links to billing. */
  upgrade?: boolean;
};

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const user = await getUser();
  if (!user) redirect("/login");

  const values = {
    name: String(formData.get("name") ?? ""),
    niche: String(formData.get("niche") ?? ""),
    description: String(formData.get("description") ?? ""),
  };

  const parsed = createProjectSchema.safeParse({
    name: values.name,
    niche: values.niche || undefined,
    description: values.description || undefined,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the form and try again.",
      values,
    };
  }

  const supabase = await createServerClient();

  /**
   * THE PROJECT LIMIT, enforced where the row is written.
   *
   * Scout gets one workspace, Creator three, Studio and Max as many as they
   * like. Counted live rather than stored: a stored counter and the rows it
   * counts drift the moment a project is deleted, and the drift is silently in
   * the customer's favour, so nothing ever reports it.
   */
  const billing = await getBillingState();
  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id);

  const cap = projectCap(billing.planKey, count ?? 0);
  if (cap.reached) {
    return { error: cap.message, values, upgrade: cap.upgradeTo !== null };
  }

  const { data: created, error } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      name: parsed.data.name,
      niche: parsed.data.niche ?? null,
      description: parsed.data.description ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: `Could not create the project: ${error.message}`, values };

  // A project you just created is obviously the one you want to work in.
  if (created) {
    const store = await cookies();
    store.set(CURRENT_PROJECT_COOKIE, created.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  revalidatePath("/projects");
  revalidatePath("/project");
  redirect("/project");
}

/**
 * Switch the workspace to a different project.
 *
 * The cookie is a hint only — `getCurrentProject()` always re-resolves it
 * against the database under RLS, so setting it to someone else's project id
 * achieves nothing.
 */
export async function selectProject(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const target = String(formData.get("redirectTo") ?? "/project");

  const store = await cookies();
  store.set(CURRENT_PROJECT_COOKIE, projectId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  // Same guard as login: `//example.com` passed a startsWith("/") check.
  redirect(safeNext(target, "/project"));
}

export type DeleteProjectState = { error: string | null };

/**
 * Delete a project and everything researched inside it.
 *
 * Competitors, their videos and ideas, calendar slots and transcripts cascade.
 * Runs do not: since 0018 a job's project_id goes NULL, so the run still
 * counts against the month it was spent in.
 *
 * Deleting the last project is allowed — every workspace page already has a
 * "create a project" state for a user with none, which is where a new account
 * starts anyway.
 */
export async function deleteProject(
  _prev: DeleteProjectState,
  formData: FormData,
): Promise<DeleteProjectState> {
  const user = await getUser();
  if (!user) redirect("/login");

  const parsed = z.uuid().safeParse(formData.get("projectId"));
  if (!parsed.success) return { error: "That project could not be found." };

  const supabase = await createServerClient();

  // Same rule as removing a competitor: a run that lands on a deleted project
  // fails, and a failed run is not counted.
  const { data: running } = await supabase
    .from("jobs")
    .select("id")
    .eq("project_id", parsed.data)
    .in("status", ["queued", "running"])
    .limit(1)
    .maybeSingle();

  if (running) {
    return { error: "A run is still going in this project. Delete it once it finishes." };
  }

  // Detach the runs FIRST, so they survive the delete whether or not
  // migration 0018 (which turns the cascade into SET NULL) has been applied.
  // A run that happened stays counted — deleting must never refund runs.
  // Service role because users can only read jobs; scoped to this owner.
  const { data: projectChannels } = await supabase
    .from("channels")
    .select("id")
    .eq("project_id", parsed.data);
  const admin = createAdminClient();
  const { error: detachError } = await admin
    .from("jobs")
    .update({ project_id: null, channel_id: null })
    .eq("owner_id", user.id)
    .eq("project_id", parsed.data);
  const channelIds = (projectChannels ?? []).map((channel) => channel.id);
  const { error: detachChannelsError } = channelIds.length
    ? await admin
        .from("jobs")
        .update({ channel_id: null })
        .eq("owner_id", user.id)
        .in("channel_id", channelIds)
    : { error: null };
  if (detachError || detachChannelsError) {
    return { error: "Could not delete that project. Try again." };
  }

  const { data: deleted, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", parsed.data)
    .select("id");

  if (error) return { error: `Could not delete the project: ${error.message}` };
  if (!deleted || deleted.length === 0) {
    return { error: "That project could not be found." };
  }

  // getCurrentProject() would fall back on its own, but a cookie naming a row
  // that no longer exists costs a wasted query on every page until it is
  // replaced — so replace it now.
  const store = await cookies();
  const { data: remaining } = await supabase
    .from("projects")
    .select("id")
    .order("created_at", { ascending: false });

  const decision = projectAfterDelete({
    deletedId: parsed.data,
    currentId: store.get(CURRENT_PROJECT_COOKIE)?.value ?? null,
    remaining: (remaining ?? []).map((row) => row.id),
  });

  if (!decision.keep) {
    if (decision.next) {
      store.set(CURRENT_PROJECT_COOKIE, decision.next, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    } else {
      store.delete(CURRENT_PROJECT_COOKIE);
    }
  }

  // The sidebar eyebrow and every workspace page read the current project.
  revalidatePath("/", "layout");
  return { error: null };
}
