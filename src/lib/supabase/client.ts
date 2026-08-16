"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/public-env";
import type { Database } from "./types";

/**
 * Browser client. Uses the anon key, so every query is subject to row-level
 * security. Its main job in this app is the realtime subscription that makes a
 * slow scrape feel live — see `docs/decisions/0002-async-jobs-and-webhooks.md`.
 */
export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
  );
}
