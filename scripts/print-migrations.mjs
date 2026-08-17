#!/usr/bin/env node
/**
 * Prints every migration, in order, as one block ready to paste into the
 * Supabase dashboard SQL editor.
 *
 * There is no Supabase CLI in this project and the REST API cannot run DDL, so
 * applying schema is a copy-paste job. This removes the two ways that goes
 * wrong: running the files out of order, or missing one.
 *
 *   npm run db:sql                  print every migration
 *   npm run db:sql -- --from 0003   print only 0003 and later
 *   npm run db:sql -- --only 0008   print exactly one migration
 *   npm run db:sql | clip           copy straight to the clipboard (Windows)
 *
 * Running the whole block twice will error on the second run — that is correct.
 * Migrations are history; see the supabase-migration skill.
 *
 * WHY `--from` EXISTS. Once some migrations are applied, printing all of them
 * invites either pasting the lot (which errors on the ones already run, in the
 * middle of a block, leaving you unsure what took effect) or hand-scrolling to
 * find the boundary. Naming the first one you still need is unambiguous.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";

const all = readdirSync(DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort();

// `--from 0003` keeps 0003_*.sql and everything after it.
const fromIndex = process.argv.indexOf("--from");
const from = fromIndex === -1 ? null : process.argv[fromIndex + 1];

if (fromIndex !== -1 && !from) {
  console.error("--from needs a migration prefix, e.g. --from 0003");
  process.exit(1);
}

// `--only 0008` prints exactly one file.
//
// WHY THIS EXISTS. `ALTER TYPE ... ADD VALUE` cannot always run inside a
// multi-statement block — Postgres rejects it with "cannot run inside a
// transaction block", and the Supabase SQL editor sends a pasted block as one
// string. Migrations that touch an enum are therefore safest pasted alone, and
// this is how you get one on its own without hand-scrolling a long print.
const onlyIndex = process.argv.indexOf("--only");
const only = onlyIndex === -1 ? null : process.argv[onlyIndex + 1];

if (onlyIndex !== -1 && !only) {
  console.error("--only needs a migration prefix, e.g. --only 0008");
  process.exit(1);
}

const files = only
  ? all.filter((name) => name.startsWith(only))
  : from
    ? all.filter((name) => name >= from)
    : all;

if (only && files.length === 0) {
  console.error(`No migration named "${only}". Available: ${all.join(", ")}`);
  process.exit(1);
}

if (from && files.length === 0) {
  console.error(
    `No migrations at or after "${from}". Available: ${all.join(", ")}`,
  );
  process.exit(1);
}

if (files.length === 0) {
  console.error(`No .sql files in ${DIR}`);
  process.exit(1);
}

const banner = (text) =>
  `\n-- ${"=".repeat(74)}\n-- ${text}\n-- ${"=".repeat(74)}\n`;

let out = banner(
  from
    ? `TubePulse schema — ${files.length} migration(s) from ${from}, in order`
    : `TubePulse schema — ${files.length} migration(s), in order`,
);

for (const file of files) {
  out += banner(file);
  out += readFileSync(join(DIR, file), "utf8").trimEnd();
  out += "\n";
}

process.stdout.write(out);
