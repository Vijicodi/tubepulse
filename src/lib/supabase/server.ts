import "server-only";
import { createServerClient as createSSRClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/public-env";
import type { Database } from "./types";

/**
 * Server-side Supabase client bound to the signed-in user's cookies.
 * Row-level security applies, so a user can only ever read their own rows.
 * This is the default client for pages, server actions and route handlers.
 */
export async function createServerClient() {
  const cookieStore = await cookies();

  return createSSRClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Middleware refreshes the session instead, so this is safe to skip.
          }
        },
      },
    },
  );
}

/** The signed-in user, or null. */
export async function getUser() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
