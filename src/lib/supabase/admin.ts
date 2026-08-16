import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import type { Database } from "./types";

/**
 * Service-role client. Bypasses row-level security.
 *
 * Only two places may use this:
 *   1. the Apify webhook, which has no user session to act as
 *   2. background jobs
 *
 * Everywhere else uses `createServerClient()` so RLS applies. If you find
 * yourself reaching for this to "make a query work", the real problem is a
 * missing RLS policy.
 */
export function createAdminClient() {
  const env = serverEnv();
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
