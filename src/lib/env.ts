import "server-only";
import { z } from "zod";

/**
 * Server-side environment variables.
 *
 * Read through `serverEnv()`, never `process.env` directly — that is the rule
 * that keeps secrets out of client bundles. `server-only` above makes importing
 * this file from a client component a build error rather than a leak.
 *
 * Validation is lazy (on first call, not at import time) so that `next build`
 * succeeds on a machine without secrets. The failure happens at request time,
 * with a message that names the missing variable.
 */
const serverEnvSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  APIFY_TOKEN: z.string().min(1),
  APIFY_YOUTUBE_ACTOR: z.string().min(1).default("streamers/youtube-scraper"),
  APIFY_WEBHOOK_SECRET: z.string().min(16),
  // Defaulted to "" rather than required, and that is deliberate. serverEnv()
  // validates the WHOLE schema on first call and throws naming any missing
  // variable — so making this mandatory would take down every route on a
  // machine that has not set transcripts up, exactly the way a blank
  // OPENAI_API_KEY once hid the Go Pro button. isTranscriptConfigured() below
  // is how a page asks whether the feature is switched on.
  APIFY_TRANSCRIPT_ACTOR: z.string().default(""),
  // The official Instagram scraper. Unlike the transcript actor this one is
  // REQUIRED-with-a-default rather than opt-in: Instagram is a first-class
  // platform in the UI, not a feature that can be switched off, and the default
  // is a working actor id rather than a blank.
  APIFY_INSTAGRAM_ACTOR: z.string().min(1).default("apify/instagram-scraper"),
  FIRECRAWL_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  /**
   * The model Studio and Max run on. Advertised on the pricing page as the
   * "advanced reasoning model", so changing it changes a promise.
   */
  OPENAI_MODEL: z.string().min(1).default("gpt-4o"),
  /**
   * The model Scout and Creator run on — the "fast model, built for volume".
   *
   * A SEPARATE VARIABLE, not a constant, for the same reason OPENAI_MODEL is
   * one: provider model names get renamed, and that should be a .env edit
   * rather than a deploy. It defaults to the mini tier, which is what the
   * margin sums in plans.ts assume for those two tiers — roughly Rs 0.40 a run
   * against Rs 6 on the premium model.
   */
  OPENAI_MODEL_FAST: z.string().min(1).default("gpt-4o-mini"),
  APP_URL: z.url().default("http://localhost:3000"),

  // --- Razorpay ------------------------------------------------------------
  // Defaulted to "" rather than required, on purpose. serverEnv() validates the
  // whole schema on its first call, so making these mandatory would break every
  // existing route on a machine that has not set billing up yet. Use
  // isBillingConfigured() below to ask whether payments are switched on; the
  // routes that need a key call requireBillingEnv(), which fails loudly and
  // names the variable.
  RAZORPAY_KEY_ID: z.string().default(""),
  RAZORPAY_KEY_SECRET: z.string().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(""),

  // SIX plan ids, because a Razorpay plan hard-codes period AND amount AND
  // currency — so every tier-and-cycle pair is its own object. Only the three
  // monthly ones are required; a blank yearly id hides that toggle rather than
  // breaking the page, which is how annual billing can be switched on later.
  RAZORPAY_PLAN_ID_CREATOR_MONTHLY: z.string().default(""),
  RAZORPAY_PLAN_ID_CREATOR_YEARLY: z.string().default(""),
  RAZORPAY_PLAN_ID_STUDIO_MONTHLY: z.string().default(""),
  RAZORPAY_PLAN_ID_STUDIO_YEARLY: z.string().default(""),
  RAZORPAY_PLAN_ID_AGENCY_MONTHLY: z.string().default(""),
  RAZORPAY_PLAN_ID_AGENCY_YEARLY: z.string().default(""),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(
      `Missing or invalid environment variables: ${missing}. ` +
        `Copy .env.example to .env.local and fill these in.`,
    );
  }

  cached = parsed.data;
  return cached;
}

/** True when a transcript actor is configured, so the feature may be offered. */
export function isTranscriptConfigured(): boolean {
  try {
    return serverEnv().APIFY_TRANSCRIPT_ACTOR !== "";
  } catch {
    // Some other required variable is missing. The feature cannot work either
    // way, and the page says so rather than throwing on render.
    return false;
  }
}

/**
 * Razorpay credentials, guaranteed present.
 *
 * Every billing route funnels through this rather than reading the four
 * variables itself, so a half-configured deploy fails with one clear sentence
 * instead of a Razorpay 401 that reads like an outage.
 */
export function requireBillingEnv() {
  const env = serverEnv();
  const missing = REQUIRED_BILLING_KEYS.filter((key) => env[key] === "");

  if (missing.length > 0) {
    throw new Error(
      `Billing is not configured: ${missing.join(", ")} missing from .env.local. ` +
        `See docs/billing-setup.md.`,
    );
  }

  return {
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
    /**
     * Every tier-and-cycle plan id, keyed by the env var name that holds it.
     * The client looks its own up from `PLAN_PRICES[plan][cycle].envVar`, so
     * adding a tier is a plans.ts edit plus one variable — not a change here.
     *
     * Yearly ids are deliberately NOT required: monthly is the core product and
     * must work alone, while annual is an upsell that can be switched on later.
     */
    planIds: {
      RAZORPAY_PLAN_ID_CREATOR_MONTHLY: env.RAZORPAY_PLAN_ID_CREATOR_MONTHLY,
      RAZORPAY_PLAN_ID_CREATOR_YEARLY: env.RAZORPAY_PLAN_ID_CREATOR_YEARLY,
      RAZORPAY_PLAN_ID_STUDIO_MONTHLY: env.RAZORPAY_PLAN_ID_STUDIO_MONTHLY,
      RAZORPAY_PLAN_ID_STUDIO_YEARLY: env.RAZORPAY_PLAN_ID_STUDIO_YEARLY,
      RAZORPAY_PLAN_ID_AGENCY_MONTHLY: env.RAZORPAY_PLAN_ID_AGENCY_MONTHLY,
      RAZORPAY_PLAN_ID_AGENCY_YEARLY: env.RAZORPAY_PLAN_ID_AGENCY_YEARLY,
    } as Record<string, string>,
  };
}

/**
 * Which Razorpay mode the current keys belong to.
 *
 * Read from the key id prefix, which is the only reliable signal — nothing else
 * in the config says. Worth surfacing because EVERYTHING at Razorpay is
 * per-mode: keys, plans, offers and webhook secrets all exist separately in test
 * and live, and a test plan id sitting next to a live key produces a confusing
 * "plan not found" rather than anything that names the real problem.
 */
export type RazorpayMode = "test" | "live" | "unknown";

export function razorpayMode(): RazorpayMode {
  const keyId = serverEnv().RAZORPAY_KEY_ID;
  if (keyId.startsWith("rzp_test_")) return "test";
  if (keyId.startsWith("rzp_live_")) return "live";
  return "unknown";
}

/**
 * Refuse to run test keys in production.
 *
 * Shipping test keys live is silent: checkout opens, the mandate is authorised,
 * and no money ever arrives. Nobody notices until the month a payout is
 * expected. A build that fails loudly is cheaper than that.
 */
export function assertModeMatchesEnvironment(): void {
  if (process.env.NODE_ENV === "production" && razorpayMode() === "test") {
    throw new Error(
      "Razorpay TEST keys are configured in a production build. Test keys take " +
        "no real money — swap in the rzp_live_ pair, and remember the plan ids " +
        "and webhook secret are per-mode too. See docs/billing-setup.md.",
    );
  }
}

/**
 * True when EVERY yearly plan id is set, so the annual toggle may be offered.
 *
 * All three, not any: a toggle that works on Creator and silently fails on
 * Max is worse than no toggle, because the failure lands at checkout.
 */
export function isYearlyConfigured(): boolean {
  try {
    const { planIds } = requireBillingEnv();
    return (
      planIds.RAZORPAY_PLAN_ID_CREATOR_YEARLY !== "" &&
      planIds.RAZORPAY_PLAN_ID_STUDIO_YEARLY !== "" &&
      planIds.RAZORPAY_PLAN_ID_AGENCY_YEARLY !== ""
    );
  } catch {
    return false;
  }
}

let warnedAboutBilling = false;

/**
 * What must be set before the upgrade UI appears at all.
 *
 * The three MONTHLY plan ids are here; the yearly ones are not, for the reason
 * given on `requireBillingEnv`. Shared by that function and by
 * `billingConfigProblem`, so the two can never disagree about what "configured"
 * means — they did once, and the button vanished with no explanation.
 */
const REQUIRED_BILLING_KEYS = [
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "RAZORPAY_PLAN_ID_CREATOR_MONTHLY",
  "RAZORPAY_PLAN_ID_STUDIO_MONTHLY",
  "RAZORPAY_PLAN_ID_AGENCY_MONTHLY",
] as const;

/**
 * Why the upgrade UI is switched off, in one sentence — or null when it is on.
 *
 * Two different failures land here and they used to be indistinguishable:
 *
 *   1. A Razorpay value is blank.
 *   2. serverEnv() THREW, because some OTHER required variable is blank.
 *      OPENAI_API_KEY going missing switched off Go Pro and the refill cards,
 *      which is not a connection anyone would guess from the screen.
 *
 * Either way the button vanished with no explanation. Names only, never values.
 */
export function billingConfigProblem(): string | null {
  let env: ReturnType<typeof serverEnv>;

  try {
    env = serverEnv();
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "The server environment failed to load.";
  }

  const missing: string[] = REQUIRED_BILLING_KEYS.filter((key) => env[key] === "");

  // The browser half of `ready`. Checkout cannot open without the publishable
  // key id, and its absence is just as invisible on screen as the others', so
  // it is named here rather than left to be discovered. Read straight from
  // process.env because public-env.ts is the client's module, not this one.
  if ((process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "") === "") {
    missing.push("NEXT_PUBLIC_RAZORPAY_KEY_ID");
  }

  return missing.length === 0
    ? null
    : `Missing from .env.local: ${missing.join(", ")}.`;
}

/** True when billing is fully configured. Never throws. */
export function isBillingConfigured(): boolean {
  const problem = billingConfigProblem();

  // Say it in the terminal the first time, so the reason is visible before
  // anyone loads a page and starts hunting for a button that never rendered.
  if (problem !== null && process.env.NODE_ENV !== "production" && !warnedAboutBilling) {
    warnedAboutBilling = true;
    console.warn(`
  [billing] Upgrade UI is HIDDEN. ${problem}
`);
  }

  return problem === null;
}
