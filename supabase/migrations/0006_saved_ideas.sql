-- ============================================================================
-- 0006_saved_ideas.sql — shortlisting an idea
--
-- One nullable timestamp on `ideas`. Purely additive: nothing is dropped and
-- nothing is renamed, so every existing row stays valid and reads as unsaved.
--
-- WHY A COLUMN AND NOT A `saved_ideas` TABLE.
-- A saved idea is the same idea, with a decision attached. A second table would
-- duplicate title, angle, reasoning, confidence and the evidence array, and then
-- the two copies could disagree about what was actually saved — which is the one
-- thing the shortlist exists to be certain about. The evidence stays attached
-- for free, which is the whole point of the page: a decision made weeks ago must
-- still be explainable.
--
-- A timestamp rather than a boolean, because "when did I shortlist this" is the
-- natural sort order for the Saved ideas page and a boolean cannot answer it.
--
-- To apply: paste into the Supabase dashboard SQL editor and run.
-- ============================================================================

alter table public.ideas
  add column if not exists saved_at timestamptz;

-- Partial: only saved rows are ever queried through this, and on a table where
-- most ideas are never shortlisted a full index would be mostly dead weight.
create index if not exists ideas_saved_idx
  on public.ideas (owner_id, saved_at desc)
  where saved_at is not null;

-- No new RLS policy is needed. `ideas` already has row-level security enabled
-- with an owner-scoped policy from 0001_init.sql, and a new column on an
-- existing table inherits it — there is no way to read or write this column
-- except through a row you already own.
