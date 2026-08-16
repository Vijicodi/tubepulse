#!/usr/bin/env node
/**
 * Fails if .env.example contains a real value.
 *
 * WHY THIS EXISTS
 *
 * `.env.example` is committed to a public repository. `.env.local` is
 * gitignored. The two files look nearly identical in an editor, and pasting a
 * key into the wrong one has already happened twice on this project.
 *
 * A rule that only lives in a README is a rule that gets broken. This is the
 * same rule as an executable check, wired into `npm run check` and CI so it
 * runs on every change and cannot be skipped.
 *
 * It does not print the offending value — that would put the secret in a CI log,
 * which is the problem it is trying to prevent.
 */

import { readFileSync } from "node:fs";

const FILE = ".env.example";

/** Keys that must always be empty in the template. */
const MUST_BE_EMPTY = [
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "APIFY_TOKEN",
  "APIFY_WEBHOOK_SECRET",
  "FIRECRAWL_API_KEY",
  "OPENAI_API_KEY",
];

/** Keys allowed to hold a non-secret default. */
const ALLOWED_VALUES = {
  NEXT_PUBLIC_SUPABASE_URL: "https://yourproject.supabase.co",
  SUPABASE_URL: "https://yourproject.supabase.co",
  APIFY_YOUTUBE_ACTOR: "streamers/youtube-scraper",
  OPENAI_MODEL: "gpt-4o",
  APP_URL: "http://localhost:3000",
};

/** Shapes that are a secret no matter which key they sit under. */
const SECRET_SHAPES = [
  { name: "a JWT (Supabase key)", re: /^eyJ[A-Za-z0-9_-]{10,}\./ },
  { name: "an OpenAI key", re: /^sk-[A-Za-z0-9_-]{16,}/ },
  { name: "an Apify token", re: /^apify_api_[A-Za-z0-9]{10,}/ },
  { name: "a Firecrawl key", re: /^fc-[A-Za-z0-9]{10,}/ },
  { name: "a Stripe key", re: /^(sk|rk|whsec)_[A-Za-z0-9]{16,}/ },
  { name: "a long random secret", re: /^[a-f0-9]{48,}$/i },
];

let source;
try {
  source = readFileSync(FILE, "utf8");
} catch {
  console.error(`✗ ${FILE} is missing. It is the template contributors copy.`);
  process.exit(1);
}

const problems = [];

for (const rawLine of source.split("\n")) {
  const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(rawLine);
  if (!match) continue;

  const [, key, rawValue] = match;
  const value = rawValue.trim();
  if (value === "") continue;

  if (MUST_BE_EMPTY.includes(key)) {
    problems.push(`${key} has a value. Secrets in ${FILE} must be blank.`);
    continue;
  }

  if (key in ALLOWED_VALUES && value !== ALLOWED_VALUES[key]) {
    problems.push(
      `${key} is not the expected placeholder (${ALLOWED_VALUES[key]}).`,
    );
    continue;
  }

  const shape = SECRET_SHAPES.find((candidate) => candidate.re.test(value));
  if (shape) {
    problems.push(`${key} looks like ${shape.name}.`);
  }
}

if (problems.length > 0) {
  console.error(`\n✗ Real values found in ${FILE} — this file is committed publicly.\n`);
  for (const problem of problems) console.error(`  · ${problem}`);
  console.error(`
  Fix: move those values into .env.local (gitignored), and leave ${FILE}
  blank. .env.local is what the app actually reads; ${FILE} only tells other
  people which variables exist.
`);
  process.exit(1);
}

console.log(`✓ ${FILE} contains no real values`);
