#!/usr/bin/env node
/**
 * Checks the Razorpay setup in .env.local, without creating or charging anything.
 *
 * WHY THIS EXISTS
 *
 * A mistyped secret and a missing Subscriptions permission both surface as an
 * unhelpful failure halfway through creating a plan — by which point it is not
 * obvious whether the problem is the keys, the account, or the script. This
 * makes one read-only request and says plainly which of those it is.
 *
 * Run it any time:
 *
 *   npm run razorpay:check
 *
 * It never creates, updates or charges. The only request is a GET that lists at
 * most one plan.
 *
 * It also prints which MODE the keys belong to, because everything at Razorpay
 * exists separately in test and live — keys, plans, offers and webhook secrets —
 * and a test plan id sitting next to a live key is a confusing failure.
 */

import { readFileSync } from "node:fs";

const ENV_FILE = ".env.local";

main().catch((error) => {
  console.error(`\n✗ ${error.message}\n`);
  process.exit(1);
});

async function main() {
  const env = readEnvLocal();

  const keyId = env.RAZORPAY_KEY_ID ?? "";
  const keySecret = env.RAZORPAY_KEY_SECRET ?? "";
  const publicKeyId = env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "";

  console.log("");

  // ------------------------------------------------------------- presence
  if (keyId === "" || keySecret === "") {
    throw new Error(
      `RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not both set in ${ENV_FILE}.\n` +
        `  Razorpay Dashboard -> Account & Settings -> API Keys\n` +
        `  (under "Website and app settings"). Pick the mode in the top ribbon\n` +
        `  BEFORE generating — keys are per-mode.`,
    );
  }

  const mode = keyId.startsWith("rzp_live_")
    ? "LIVE"
    : keyId.startsWith("rzp_test_")
      ? "TEST"
      : "UNRECOGNISED";

  if (mode === "UNRECOGNISED") {
    throw new Error(
      `RAZORPAY_KEY_ID does not look like a Razorpay key id.\n` +
        `  It should start with rzp_test_ or rzp_live_. Got ${keyId.slice(0, 12)}...\n` +
        `  A common mix-up is pasting the SECRET into the key id slot.`,
    );
  }

  console.log(`  Mode                 ${mode}`);
  console.log(`  Key id               ${keyId.slice(0, 12)}... (${keyId.length} chars)`);
  console.log(`  Key secret           set (${keySecret.length} chars)`);

  // The browser needs the publishable half under its own name, or checkout
  // cannot open at all — a failure that looks like a dead button.
  if (publicKeyId === "") {
    console.log(`  NEXT_PUBLIC copy     ✗ MISSING — checkout will not open`);
  } else if (publicKeyId !== keyId) {
    console.log(`  NEXT_PUBLIC copy     ✗ DOES NOT MATCH RAZORPAY_KEY_ID`);
  } else {
    console.log(`  NEXT_PUBLIC copy     ✓ matches`);
  }

  // --------------------------------------------------------- auth + access
  // GET /plans is part of the Subscriptions product, so one call answers both
  // "are these keys valid" and "is Subscriptions enabled".
  const response = await fetch("https://api.razorpay.com/v1/plans?count=1", {
    method: "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
    },
  });

  const body = await response.json().catch(() => null);

  if (response.status === 401) {
    throw new Error(
      `Razorpay rejected the credentials (401).\n` +
        `  The key id and secret are not a matching pair. Most likely a test\n` +
        `  secret next to a live key id, or a secret from a regenerated pair.\n` +
        `  The secret is shown only once — if unsure, generate a new pair.`,
    );
  }

  if (!response.ok) {
    const description = body?.error?.description ?? `HTTP ${response.status}`;
    throw new Error(
      `Razorpay returned an error: ${description}\n` +
        `  If it mentions Subscriptions not being enabled, request access from\n` +
        `  the dashboard: Payment Products -> Subscriptions. It is off by default.`,
    );
  }

  console.log(`  Credentials          ✓ accepted`);
  console.log(`  Subscriptions API    ✓ reachable`);

  // ----------------------------------------------------------- plan state
  const planCount = Array.isArray(body?.items) ? body.items.length : 0;
  const configuredMonthly = env.RAZORPAY_PLAN_ID_PRO ?? "";
  const configuredYearly = env.RAZORPAY_PLAN_ID_PRO_YEARLY ?? "";

  console.log(
    `  Plans in this mode   ${planCount === 0 ? "none yet" : `at least ${planCount}`}`,
  );
  console.log(
    `  RAZORPAY_PLAN_ID_PRO ${configuredMonthly === "" ? "✗ not set" : "✓ set"}`,
  );
  console.log(
    `  ..._PRO_YEARLY       ${
      configuredYearly === "" ? "not set (yearly toggle hidden)" : "✓ set"
    }`,
  );
  console.log(
    `  Webhook secret       ${
      (env.RAZORPAY_WEBHOOK_SECRET ?? "") === ""
        ? "not set (fine until you deploy)"
        : "✓ set"
    }`,
  );

  // ------------------------------------------------------------ next step
  console.log("");

  if (configuredMonthly === "") {
    if (mode === "LIVE") {
      // Do not cheerfully recommend an irreversible action against a live
      // account. Plans cannot be deleted at Razorpay, and a live checkout takes
      // real money with only a manual refund to undo it.
      console.log(`  ⚠  These are LIVE keys.`);
      console.log(`     npm run razorpay:plan would create PERMANENT live plans`);
      console.log(`     (Razorpay plans cannot be edited or deleted), and testing`);
      console.log(`     checkout afterwards charges real money.`);
      console.log(``);
      console.log(`     To try it for free first: generate a TEST pair (same page,`);
      console.log(`     flip the ribbon to Test), put those three values in`);
      console.log(`     .env.local, and run this check again. Test mode needs its`);
      console.log(`     own plans — everything at Razorpay is per-mode.`);
      console.log(``);
      console.log(`     If you do mean to go live: npm run razorpay:plan`);
    } else {
      console.log(`  Next: npm run razorpay:plan`);
      console.log(`        Creates both plans in ${mode} mode and prints their ids.`);
    }
  } else {
    console.log(`  Setup looks complete for ${mode} mode.`);
    if (mode === "TEST") {
      console.log(`  Test card 4111 1111 1111 1111, any future expiry, any CVV.`);
    }
  }

  console.log("");
}

/** Read .env.local without a dotenv dependency. */
function readEnvLocal() {
  let source;
  try {
    source = readFileSync(ENV_FILE, "utf8");
  } catch {
    throw new Error(`${ENV_FILE} not found. Copy .env.example to it first.`);
  }

  const values = {};
  for (const line of source.split("\n")) {
    // Commented-out parked keys must not be read as active config.
    if (line.trimStart().startsWith("#")) continue;
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return values;
}
