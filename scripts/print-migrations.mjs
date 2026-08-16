#!/usr/bin/env node
/**
 * Prints every migration, in order, as one block ready to paste into the
 * Supabase dashboard SQL editor.
 *
 * There is no Supabase CLI in this project and the REST API cannot run DDL, so
 * applying schema is a copy-paste job. This removes the two ways that goes
 * wrong: running the files out of order, or missing one.
 *
 *   npm run db:sql            print it
 *   npm run db:sql | clip     copy it straight to the clipboard (Windows)
 *
 * Running the whole block twice will error on the second run — that is correct.
 * Migrations are history; see the supabase-migration skill.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";

const files = readdirSync(DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error(`No .sql files in ${DIR}`);
  process.exit(1);
}

const banner = (text) =>
  `\n-- ${"=".repeat(74)}\n-- ${text}\n-- ${"=".repeat(74)}\n`;

let out = banner(`TubePulse schema — ${files.length} migration(s), in order`);

for (const file of files) {
  out += banner(file);
  out += readFileSync(join(DIR, file), "utf8").trimEnd();
  out += "\n";
}

process.stdout.write(out);
