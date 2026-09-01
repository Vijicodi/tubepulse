-- ============================================================================
-- 0014_content_calendar.sql — scheduling a saved idea onto a date
--
-- One row per scheduled slot. Studio and Max only, enforced at the server
-- action rather than here: the gate belongs where the write happens, and an
-- RLS policy cannot read a plan without joining billing into every query.
--
-- WHY A TABLE AND NOT A COLUMN ON `ideas`.
-- 0006 put `saved_at` directly on `ideas` and the reasoning there was sound —
-- a saved idea is the same idea with a decision attached. Scheduling is
-- different in a way that matters: the SAME idea can legitimately be planned
-- twice (a main video and a short cut from it), and a column cannot hold two
-- dates. A slot is its own thing with its own lifecycle — planned, then
-- published, or dropped — so it gets its own row.
--
-- WHY `scheduled_for` IS A DATE AND NOT A TIMESTAMP.
-- A content calendar answers "what am I making this week", not "at 14:32". A
-- timestamptz would drag timezone conversion into every read, and a slot
-- planned for Tuesday would show as Monday for anyone west of UTC — the exact
-- bug the patterns page already has to disclose about day-of-week. A plain
-- date has no timezone to get wrong.
--
-- To apply: paste into the Supabase dashboard SQL editor and run.
-- ============================================================================

create table if not exists public.calendar_slots (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  project_id    uuid not null references public.projects (id) on delete cascade,

  -- The idea being planned. ON DELETE CASCADE rather than SET NULL: a slot
  -- whose idea is gone is an empty box on a calendar with no way to find out
  -- what it was for, which is worse than the slot simply disappearing.
  idea_id       uuid not null references public.ideas (id) on delete cascade,

  scheduled_for date not null,

  -- 'planned' | 'published' | 'dropped'. Text with a check rather than an
  -- enum: adding a state later is then an ordinary migration instead of an
  -- ALTER TYPE that cannot run inside a transaction. 0013 is the cautionary
  -- tale — it had to be pasted in two halves.
  status        text not null default 'planned'
                  check (status in ('planned', 'published', 'dropped')),

  -- Free text, e.g. "film Sunday, guest confirmed". Capped so a runaway paste
  -- cannot bloat a row that is read on every calendar render.
  note          text check (note is null or length(note) <= 500),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- The calendar is always read as "this owner, this project, this month", so
-- the index matches that access pattern exactly.
create index if not exists calendar_slots_month_idx
  on public.calendar_slots (owner_id, project_id, scheduled_for);

-- Finding every slot for one idea, for the "already scheduled" badge on the
-- saved-ideas page.
create index if not exists calendar_slots_idea_idx
  on public.calendar_slots (idea_id);

alter table public.calendar_slots enable row level security;

-- Wrapped so a re-run is a no-op: `create policy` has no IF NOT EXISTS, and a
-- second run would otherwise fail with 42710 and read as a broken migration.
do $$
begin
  create policy "own calendar slots" on public.calendar_slots
    for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
exception
  when duplicate_object then null;
end $$;

-- Keep `updated_at` honest. The function already exists from 0002.
do $$
begin
  create trigger calendar_slots_touch
    before update on public.calendar_slots
    for each row execute function public.touch_updated_at();
exception
  when duplicate_object then null;
end $$;
