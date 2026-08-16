"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerClient, getUser } from "@/lib/supabase/server";

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

  const { error } = await supabase.from("projects").insert({
    owner_id: user.id,
    name: parsed.data.name,
    niche: parsed.data.niche ?? null,
    description: parsed.data.description ?? null,
  });

  if (error) return { error: `Could not create the project: ${error.message}` };

  revalidatePath("/projects");
  revalidatePath("/project");
  redirect("/project");
}
