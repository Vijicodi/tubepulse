-- ============================================================================
-- 0011_idea_extras.sql — title variants and thumbnail concepts on an idea
--
-- Two nullable columns. Additive: nothing dropped, nothing renamed, and every
-- idea generated before today keeps working — it simply has neither, which the
-- card renders as absent rather than as an empty list.
--
-- NULLABLE ON PURPOSE, and for three reasons rather than convenience:
--
--   1. Scout and Creator differ here. Creator gets both, Scout gets neither,
--      so "no variants" is a legitimate state for a current, correct row —
--      not a gap to be backfilled.
--   2. A model occasionally omits an array it was asked for. Losing eight good
--      ideas because one nicety is missing would be a bad trade, so the
--      application schema treats both as optional too.
--   3. A NOT NULL column would need a default, and a default here would be a
--      fake: an empty array reads, to every query and every page, exactly like
--      a real one the model deliberately returned empty.
--
-- JSONB rather than a child table. These are read only alongside their idea,
-- never queried across ideas, and never joined — a table would buy nothing and
-- cost a join on every idea card. If they ever need querying independently,
-- that is the migration that introduces the table.
--
-- To apply: paste into the Supabase dashboard SQL editor and run.
-- ============================================================================

-- ["Why X failed", "The real reason X failed", ...]
alter table public.ideas
  add column if not exists title_variants jsonb;

-- [{"text": "HE QUIT", "visual": "close crop on the moment, no caption"}, ...]
alter table public.ideas
  add column if not exists thumbnail_concepts jsonb;

-- No new RLS policy. `ideas` carries an owner-scoped `for all` policy from
-- 0001_init.sql and a new column on an existing table inherits it.
