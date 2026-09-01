"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { createServerClient, getUser } from "@/lib/supabase/server";
import { canCreateProject, nextTierUp } from "@/lib/billing/quota";
import { getBillingState } from "@/lib/billing/store";
import { PLANS } from "@/lib/billing/plans";
import { CURRENT_PROJECT_COOKIE } from "./current";

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Give the project a name.").max(80),
  niche: z.string().trim().max(120).optional(),
  description: z.string().trim().max(600).optional(),
});

export type ProjectFormState = { error: string | null };

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const user = await getUser();
  if (!user) redirect("/login");

  const parsed = createProjectSchema.safeParse({
    name: formData.get("name"),
    niche: formData.get("niche") || undefined,
    description: formData.get("description") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
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

  if (!canCreateProject(billing.planKey, count ?? 0)) {
    const plan = PLANS[billing.planKey];
    const next = nextTierUp(billing.planKey);

    return {
      error: next
        ? `${plan.name} covers ${plan.features.maxProjects} project${
            plan.features.maxProjects === 1 ? "" : "s"
          }. ${next.name} gives you ${
            next.features.maxProjects === null ? "unlimited" : next.features.maxProjects
          }.`
        : `You have reached the project limit for ${plan.name}.`,
    };
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

  if (error) return { error: `Could not create the project: ${error.message}` };

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
  redirect(target.startsWith("/") ? target : "/project");
}
