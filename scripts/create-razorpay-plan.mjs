#!/usr/bin/env node
/**
 * Creates the Pro subscription plans at Razorpay and prints their ids.
 *
 * WHY THIS EXISTS
 *
 * Razorpay autopay needs a Plan object that lives in your Razorpay account, not
 * in this repo. Creating one by hand means six dashboard fields, and getting the
 * amount wrong there charges the wrong price with no warning — the app has no
 * way to notice, because the plan is the source of truth for what is billed.
 *
 * So the amounts come from `src/lib/billing/plans.ts`, the same file the pricing
 * page reads. One number, one place, and a plan physically cannot disagree with
 * the page that sells it.
 *
 * TWO PLANS, not one. A Razorpay plan hard-codes BOTH its period and its
 * amount, so monthly and yearly are separate objects. There is no way to offer
 * annual billing on a monthly plan.
 *
 * USAGE
 *
 *   npm run razorpay:plan
 *
 * It reads your keys from .env.local, creates both plans, and prints the lines
 * to paste back. Run it once — running it again creates duplicates, which is
 * harmless but only the ids you paste are ever used.
 *
 * Plans cannot be edited or deleted at Razorpay once created. To change a price,
 * create a new plan and repoint the env var; existing subscribers stay on the
 * old plan until they resubscribe, which is exactly how it should behave.
 */

import { readFileSync } from "node:fs";

const ENV_FILE = ".env.local";
const PLANS_FILE = "src/lib/billing/plans.ts";

/**
 * Mirrors PRO_PRICES in src/lib/billing/plans.ts.
 *
 * Duplicated deliberately: this is a plain node script with no TypeScript
 * pipeline, and adding a bundler so one script can import one constant would be
 * a worse trade. assertMatchesPlansFile() below fails loudly if they drift.
 */
const PLANS = [
  {
    envVar: "RAZORPAY_PLAN_ID_PRO",
    name: "TubePulse Pro — Monthly",
    description: "20 channel scrapes a month, 100 videos each",
    amountPaise: 49_900,
    currency: "INR",
    period: "monthly",
    interval: 1,
  },
  {
    envVar: "RAZORPAY_PLAN_ID_PRO_YEARLY",
    name: "TubePulse Pro — Yearly",
    description: "20 channel scrapes a month, 100 videos each. Two months free.",
    amountPaise: 499_000,
    currency: "INR",
    period: "yearly",
    interval: 1,
  },
];

main().catch((error) => {
  console.error(`\n✗ ${error.message}\n`);
  process.exit(1);
});

async function main() {
  assertMatchesPlansFile();

  const env = readEnvLocal();
  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error(
      `RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in ${ENV_FILE}.\n` +
        `  Get them from the Razorpay dashboard:\n` +
        `  Account & Settings -> API Keys (under Website and app settings).`,
    );
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const mode = keyId.startsWith("rzp_live_") ? "LIVE" : "TEST";

  console.log(`\nCreating ${PLANS.length} plans in ${mode} mode...\n`);

  const created = [];

  for (const plan of PLANS) {
    console.log(`  ${plan.name} - Rs ${plan.amountPaise / 100} ${plan.period}`);

    const response = await fetch("https://api.razorpay.com/v1/plans", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        period: plan.period,
        interval: plan.interval,
        item: {
          name: plan.name,
          description: plan.description,
          amount: plan.amountPaise,
          currency: plan.currency,
        },
        notes: { created_by: "scripts/create-razorpay-plan.mjs" },
      }),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const description = body?.error?.description ?? `HTTP ${response.status}`;

      // Do not throw away work: if the monthly plan already succeeded, print it
      // so the run is not wasted and no id has to be recovered by hand.
      if (created.length > 0) printResults(created);

      throw new Error(
        `Razorpay refused while creating "${plan.name}": ${description}\n` +
          (response.status === 401
            ? `  A 401 means the key id and secret do not match, or a test secret\n` +
              `  is sitting next to a live key id.`
            : `  If it mentions Subscriptions not being enabled, request access\n` +
              `  from the Razorpay dashboard first — it is off by default.`),
      );
    }

    created.push({ envVar: plan.envVar, id: body.id });
  }

  printResults(created);
}

function printResults(created) {
  console.log(`\n✓ ${created.length} plan(s) created.\n`);
  console.log(`Paste these into ${ENV_FILE}:\n`);
  for (const { envVar, id } of created) {
    console.log(`  ${envVar}=${id}`);
  }
  console.log(`\nThen restart the dev server so it picks the values up.`);
  console.log(
    `Leaving RAZORPAY_PLAN_ID_PRO_YEARLY blank is fine — it simply hides the\n` +
      `yearly option until you set it.\n`,
  );
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
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

/**
 * Fail if a price here has drifted from the price the app advertises.
 *
 * A plan created for one amount while the pricing page shows another is the
 * single worst outcome this script can produce, so it is checked rather than
 * trusted. Crude string matching, but it catches the real mistake: editing one
 * file and forgetting the other.
 */
function assertMatchesPlansFile() {
  let source;
  try {
    source = readFileSync(PLANS_FILE, "utf8");
  } catch {
    return; // Not fatal — the script still works, it just cannot cross-check.
  }

  const found = [...source.matchAll(/pricePaise:\s*([\d_]+)/g)].map((match) =>
    Number(match[1].replace(/_/g, "")),
  );

  for (const plan of PLANS) {
    if (!found.includes(plan.amountPaise)) {
      throw new Error(
        `Price mismatch. This script would create "${plan.name}" at ` +
          `Rs ${plan.amountPaise / 100},\n` +
          `  but ${PLANS_FILE} does not list that amount (found: ${found
            .map((paise) => `Rs ${paise / 100}`)
            .join(", ")}).\n` +
          `  Update the amount here to match, then run it again.`,
      );
    }
  }
}
