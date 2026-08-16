-- ============================================================================
-- 0001_init.sql — channels, videos, jobs, ideas
--
-- Row-level security is enabled in this first migration, not retrofitted later.
-- Retrofitting RLS means auditing every existing row and every existing query;
-- doing it now costs nothing.
--
-- To apply: paste into the Supabase dashboard SQL editor and run, or use the
-- Supabase MCP server from your editor. Never edit this file after it has been
-- applied — write a new migration instead. (See the supabase-migration skill.)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
create type job_status as enum ('queued', 'running', 'succeeded', 'failed');
create type job_kind as enum ('channel_scrape', 'idea_generation');

-- ---------------------------------------------------------------------------
-- channels
-- ---------------------------------------------------------------------------
create table public.channels (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users (id) on delete cascade,
  handle            text not null,
  channel_url       text not null,
  title             text,
  subscriber_count  bigint,
  thumbnail_url     text,
  last_scraped_at   timestamptz,
  created_at        timestamptz not null default now(),

  -- One row per channel per user: re-researching a channel updates, not duplicates.
  unique (owner_id, handle)
);

-- ---------------------------------------------------------------------------
-- videos
-- ---------------------------------------------------------------------------
create table public.videos (
  id                uuid primary key default gen_random_uuid(),
  channel_id        uuid not null references public.channels (id) on delete cascade,
  video_id          text not null,
  title             text not null,
  url               text not null,
  thumbnail_url     text,
  duration_seconds  integer,
  view_count        bigint not null default 0,
  like_count        bigint,
  comment_count     bigint,
  published_at      timestamptz not null,
  outlier_score     numeric(10, 2),
  velocity          numeric(14, 1),
  created_at        timestamptz not null default now(),

  -- Makes the webhook safe to run twice: a re-delivery upserts instead of duplicating.
  unique (channel_id, video_id)
);

create index videos_channel_score_idx
  on public.videos (channel_id, outlier_score desc nulls last);

-- ---------------------------------------------------------------------------
-- jobs — the row the browser watches while a scrape runs
-- ---------------------------------------------------------------------------
create table public.jobs (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  kind             job_kind not null,
  status           job_status not null default 'queued',
  channel_id       uuid references public.channels (id) on delete cascade,
  external_run_id  text,
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index jobs_owner_created_idx on public.jobs (owner_id, created_at desc);
create index jobs_external_run_idx  on public.jobs (external_run_id);

-- ---------------------------------------------------------------------------
-- ideas
-- ---------------------------------------------------------------------------
create table public.ideas (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users (id) on delete cascade,
  channel_id          uuid not null references public.channels (id) on delete cascade,
  title               text not null,
  angle               text not null,
  reasoning           text not null,
  confidence          integer not null check (confidence between 0 and 100),
  evidence_video_ids  text[] not null default '{}',
  created_at          timestamptz not null default now()
);

create index ideas_channel_confidence_idx
  on public.ideas (channel_id, confidence desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger jobs_touch_updated_at
  before update on public.jobs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- row-level security
--
-- Every table: a user reads and writes only their own rows. `videos` has no
-- owner_id of its own, so it inherits ownership through its channel.
--
-- The service-role key used by the Apify webhook bypasses all of this by
-- design — that is why only the webhook is allowed to use it.
-- ---------------------------------------------------------------------------
alter table public.channels enable row level security;
alter table public.videos   enable row level security;
alter table public.jobs     enable row level security;
alter table public.ideas    enable row level security;

create policy "own channels" on public.channels
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "own jobs" on public.jobs
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "own ideas" on public.ideas
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "videos of own channels" on public.videos
  for all
  using (
    exists (
      select 1 from public.channels c
      where c.id = videos.channel_id and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.channels c
      where c.id = videos.channel_id and c.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- realtime — this is what makes a 6-minute scrape feel live in the UI
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.jobs;
