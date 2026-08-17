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

  /**
   * Razorpay's PUBLISHABLE key id (rzp_live_… / rzp_test_…).
   *
   * This one genuinely belongs in the browser: Razorpay's checkout script
   * cannot open without it. The secret half, RAZORPAY_KEY_SECRET, is what must
   * never leave the server — it lives in env.ts, which is `server-only`.
   */
  razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "",
};

/** True when Supabase is configured. Lets the UI explain itself before setup. */
export const isSupabaseConfigured =
  publicEnv.supabaseUrl !== "" && publicEnv.supabaseAnonKey !== "";

/**
 * True when checkout can open at all. The browser only knows about the key id;
 * whether the SERVER has its secret and plan id is a separate question, and the
 * checkout route answers that one with requireBillingEnv().
 */
export const isCheckoutConfigured = publicEnv.razorpayKeyId !== "";
