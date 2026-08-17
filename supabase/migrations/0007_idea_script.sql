-- ============================================================================
-- 0007_idea_script.sql — the beat sheet attached to an idea
--
-- One nullable text column. Additive: nothing dropped, nothing renamed, and
-- every idea generated before today keeps working — it simply has no script,
-- which the card renders as "generated before scripts existed" rather than as
-- an empty box.
--
-- NULLABLE ON PURPOSE, even though the generator now always produces one. A
-- NOT NULL column would need a default, and a default here would be a fake
-- script — an empty string that reads, to every query and every page, exactly
-- like a real one that happens to be blank.
--
-- To apply: paste into the Supabase dashboard SQL editor and run.
-- ============================================================================

alter table public.ideas
  add column if not exists script text;

-- No new RLS policy. `ideas` carries an owner-scoped `for all` policy from
-- 0001_init.sql and a new column on an existing table inherits it.
