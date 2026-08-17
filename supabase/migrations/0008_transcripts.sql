-- ============================================================================
-- 0008_transcripts.sql — transcripts and their short summaries
--
-- Two things:
--   1. a third `job_kind`, so a transcript pull is a job like any other work
--      that takes longer than a request
--   2. the `transcripts` table itself
--
-- ON THE ENUM. Postgres allows adding a value to an enum inside a transaction,
-- but NOT using that value in the same transaction. Nothing below references
-- 'transcript' — only the application does, later, at runtime — so this is safe
-- to paste as one script. If you ever add a value AND insert it in one file,
-- split them into two migrations or it fails with "unsafe use of new value".
--
-- To apply: paste into the Supabase dashboard SQL editor and run.
-- ============================================================================

alter type job_kind add value if not exists 'transcript';

-- ---------------------------------------------------------------------------
-- jobs.payload
--
-- What the job was asked to do, as the caller stated it. A scrape does not need
-- this — its target is `channel_id` — but a transcript's target is a video URL,
-- and there was nowhere to put it.
--
-- The alternative was reading the URL back out of the actor's own output, which
-- fails silently for any actor that does not echo it, and leaves a finished run
-- we cannot attribute to a video.
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column if not exists payload jsonb;

-- ---------------------------------------------------------------------------
-- transcripts
--
-- One row per video per user. `text` is the spoken words; `summary` is the
-- short LLM pass over them, nullable because the transcript is the thing the
-- user asked for and a failed summary must not throw the transcript away.
--
-- UNIQUE ON (owner_id, video_id), which is behaviour rather than tidiness:
-- extracting the same video twice updates the row instead of stacking copies,
-- exactly as re-researching a channel updates it. It also makes the Apify
-- webhook safe to receive twice, which it will be.
-- ---------------------------------------------------------------------------
create table public.transcripts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  project_id  uuid references public.projects (id) on delete cascade,
  -- The YouTube id, not our row id — the same identifier ideas cite.
  video_id    text not null,
  video_url   text not null,
  title       text,
  -- BCP-47 where the actor reports one. Auto-captions are often the only
  -- option, and knowing the language is how you tell a bad transcript from a
  -- foreign-language one.
  language    text,
  text        text not null,
  summary     text,
  word_count  integer not null default 0,
  created_at  timestamptz not null default now(),

  unique (owner_id, video_id)
);

create index transcripts_owner_created_idx
  on public.transcripts (owner_id, created_at desc);

-- ---------------------------------------------------------------------------
-- row-level security — enabled here, in the migration that creates the table,
-- never retrofitted.
-- ---------------------------------------------------------------------------
alter table public.transcripts enable row level security;

create policy "own transcripts" on public.transcripts
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
