-- ============================================================================
-- 0009_instagram.sql — a second platform
--
-- Instagram reuses `channels` and `videos` rather than getting tables of its
-- own. That is the whole point: outlier scoring, idea generation, project
-- scoping and the jobs pipeline already work on those two tables, and a
-- parallel set would mean a second copy of every one of them — which is how
-- the two halves of a product drift apart.
--
-- What genuinely differs is carried by two new columns.
--
-- EVERY STATEMENT HERE IS SAFE TO RUN TWICE. `create table` and `create type`
-- have no IF NOT EXISTS, so a half-applied migration re-run answers with
-- `42P07: relation already exists` — which reads like a broken migration when
-- it actually means "this part is already done". 0008 did exactly that. The DO
-- blocks below turn a re-run into a no-op instead.
--
-- To apply: paste into the Supabase dashboard SQL editor and run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- platform
--
-- Defaulting to 'youtube' is correct for every row that already exists: they
-- were all YouTube channels, because nothing else was possible until now.
-- ---------------------------------------------------------------------------
do $$
begin
  create type platform as enum ('youtube', 'instagram');
exception
  when duplicate_object then null;
end
$$;

alter table public.channels
  add column if not exists platform platform not null default 'youtube';

-- ---------------------------------------------------------------------------
-- video kind
--
-- 'video' is a YouTube upload. 'reel' and 'post' are the two things an
-- Instagram grid holds, and they are SCORED SEPARATELY because they behave
-- nothing alike: a reel is measured in plays and routinely reaches ten times
-- the account's follower count, while a static post is measured in likes and
-- reaches a fraction of it.
--
-- Pooling them would do exactly what Shorts do to a YouTube median — one reel
-- at 11 million plays would make every post on the account read as a failure.
-- The median only means something inside one kind.
-- ---------------------------------------------------------------------------
do $$
begin
  create type video_kind as enum ('video', 'reel', 'post');
exception
  when duplicate_object then null;
end
$$;

alter table public.videos
  add column if not exists kind video_kind not null default 'video';

-- ---------------------------------------------------------------------------
-- view_count must be nullable now
--
-- A static Instagram post has NO view count. It is not zero — zero is a real
-- number meaning nobody watched, and a post is not something you watch. Storing
-- 0 would drag any average that ever touched it and would read, on screen, as a
-- post that failed. Null is the honest answer, and `like_count` is the metric
-- that means something for that kind.
--
-- Both statements are no-ops if they have already run.
-- ---------------------------------------------------------------------------
alter table public.videos
  alter column view_count drop not null;

alter table public.videos
  alter column view_count drop default;

-- Scoring and the outliers page both read within one kind at a time.
create index if not exists videos_channel_kind_idx
  on public.videos (channel_id, kind, outlier_score desc);

-- ---------------------------------------------------------------------------
-- Belt and braces on 0008's row-level security.
--
-- `transcripts` was created by 0008. If that script was interrupted anywhere
-- after the table and before its policy, the table would exist WITHOUT one —
-- and a table without RLS is readable by anyone holding the anon key. Both
-- statements below are no-ops when 0008 completed normally, which is the point:
-- the cost of checking is nothing and the cost of being wrong is every user's
-- transcripts.
-- ---------------------------------------------------------------------------
alter table public.transcripts enable row level security;

do $$
begin
  create policy "own transcripts" on public.transcripts
    for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
exception
  when duplicate_object then null;
end
$$;

-- No other RLS changes. `channels` and `videos` already carry owner-scoped
-- policies from 0001_init.sql, and new columns on an existing table inherit
-- them.
