-- ============================================================================
-- 0002_projects.sql — projects as the workspace spine
--
-- Every screenshot in the design hangs off a project: competitors, outliers,
-- ideas and transcripts all belong to one. Channels previously belonged
-- directly to a user; now they belong to a project, and the project belongs to
-- the user.
--
-- Safe to run on an empty database. If you already created channels under
-- migration 0001, the backfill below moves them into a default project rather
-- than dropping them.
--
-- To apply: paste into the Supabase dashboard SQL editor and run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  niche       text,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index projects_owner_created_idx
  on public.projects (owner_id, created_at desc);

create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

alter table public.projects enable row level security;

create policy "own projects" on public.projects
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- channels now belong to a project
--
-- Added nullable, backfilled, then made required — the standard three-step so
-- existing rows are never orphaned.
-- ---------------------------------------------------------------------------
alter table public.channels
  add column project_id uuid references public.projects (id) on delete cascade;

-- Backfill: give every user with existing channels a default project.
insert into public.projects (owner_id, name, niche, description)
select distinct c.owner_id,
       'My first project',
       null,
       'Created automatically when projects were introduced.'
from public.channels c
where c.project_id is null;

update public.channels c
set project_id = p.id
from public.projects p
where c.project_id is null
  and p.owner_id = c.owner_id
  and p.name = 'My first project';

alter table public.channels
  alter column project_id set not null;

create index channels_project_idx on public.channels (project_id);

-- The old uniqueness was per user. It is now per project, so the same channel
-- can be researched in two different projects without colliding.
alter table public.channels drop constraint channels_owner_id_handle_key;
alter table public.channels add constraint channels_project_handle_key
  unique (project_id, handle);

-- ---------------------------------------------------------------------------
-- profiles — display name captured at sign-up
--
-- auth.users is managed by Supabase and should not be written to directly.
-- A profile row mirrors the bits the UI needs.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Create the profile automatically whenever a user signs up, for email/password
-- and Google alike. Doing this in a trigger means no code path can forget.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- jobs and ideas gain a project, so the workspace pages can filter by it
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column project_id uuid references public.projects (id) on delete cascade;

alter table public.ideas
  add column project_id uuid references public.projects (id) on delete cascade;

create index jobs_project_idx  on public.jobs (project_id, created_at desc);
create index ideas_project_idx on public.ideas (project_id, confidence desc);
