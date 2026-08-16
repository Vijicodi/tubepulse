import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import type { ProjectRow } from "@/lib/supabase/types";

/**
 * Which project the user is currently working in.
 *
 * Held in a cookie rather than the URL, so every workspace page can stay at a
 * clean path (`/outliers`, not `/projects/<uuid>/outliers`) while still knowing
 * its context.
 *
 * The cookie is only a hint — it is always resolved against the database under
 * RLS, so a tampered cookie naming someone else's project resolves to nothing
 * and falls back to the user's own most recent project.
 */
const COOKIE = "tp_project";

export async function getCurrentProject(): Promise<ProjectRow | null> {
  const supabase = await createServerClient();
  const preferred = (await cookies()).get(COOKIE)?.value;

  if (preferred) {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("id", preferred)
      .maybeSingle();

    if (data) return data;
  }

  // No cookie, or it pointed at a project this user cannot see.
  const { data } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

export const CURRENT_PROJECT_COOKIE = COOKIE;
