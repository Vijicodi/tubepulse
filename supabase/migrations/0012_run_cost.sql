-- ============================================================================
-- 0012_run_cost.sql — what each run consumed, and what the agent did
--
-- Two nullable jsonb columns on `jobs`, backing two pricing-page promises:
-- the per-run cost breakdown (Studio and Agency) and the full agent and
-- tool-call audit trail (Agency).
--
-- Additive. Nothing dropped, nothing renamed, safe to re-run. Every job that
-- ran before today has neither, which the UI renders as "not recorded" rather
-- than as a free run — those are different facts and a $0.00 on an old job
-- would be a lie about a run that genuinely cost money.
--
-- WHY ON `jobs` RATHER THAN ITS OWN TABLE. There is already exactly one job row
-- per billable action — that row IS the charge, per BILLABLE_JOB_KINDS in
-- quota.ts. A separate costs table would need the same key, the same RLS and a
-- join on every read, and could drift from the thing it describes. Usage
-- belongs to the run that incurred it.
--
-- WHY jsonb RATHER THAN COLUMNS. The measured fields differ per job kind: a
-- scrape counts videos or posts, a generation counts tokens, a transcript
-- counts audio minutes. Columns would mean a wide table of mostly-nulls, and a
-- new provider would mean a migration. These are read only alongside their job
-- and never queried across jobs.
--
-- NO MONEY IS STORED, DELIBERATELY. `usage` holds counts; the cost is computed
-- at read time from the rate table in lib/billing/cost.ts. Storing cents would
-- freeze a customer's breakdown against rates that have since changed, and
-- would give two sources of truth for a number shown to someone paying.
--
-- To apply: paste into the Supabase dashboard SQL editor and run.
-- ============================================================================

-- {"videosScraped":150,"pagesEnriched":3,"llmTier":"premium",
--  "llmInputTokens":6012,"llmOutputTokens":8840}
alter table public.jobs
  add column if not exists usage jsonb;

-- [{"step":"collect","detail":"…","ms":4120},{"step":"generate",…}]
-- Agency only. Written for every job regardless of tier — a trail that starts
-- existing when you upgrade would be useless on the day you needed it — and
-- gated at read time instead.
alter table public.jobs
  add column if not exists trail jsonb;

-- No new RLS policy. `jobs` carries an owner-scoped policy from 0001_init.sql
-- and a new column on an existing table inherits it.
