/**
 * Config that is safe to ship to the browser.
 *
 * This file is deliberately separate from `env.ts`, which is `server-only` and
 * cannot be imported from a client component. Anything you add here ends up in
 * the client bundle: if it should not be on a billboard, it does not go here.
 *
 * The values must be referenced as full literals (`process.env.NEXT_PUBLIC_X`)
 * so that Next.js can inline them at build time.
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

/** True when Supabase is configured. Lets the UI explain itself before setup. */
export const isSupabaseConfigured =
  publicEnv.supabaseUrl !== "" && publicEnv.supabaseAnonKey !== "";
