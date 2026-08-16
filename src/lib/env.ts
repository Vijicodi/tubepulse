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
  FIRECRAWL_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o"),
  APP_URL: z.url().default("http://localhost:3000"),
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
