-- ============================================================================
-- 0018_jobs_read_only.sql — a user can no longer refund their own runs
--
-- Found on production by the 2026-10-04 checkup. The run allowance is a COUNT
-- of `jobs` rows (src/lib/billing/store.ts getQuota), and three ways let a user
-- change that count:
--
--   1. "own jobs" was `for all`, so a signed-in user could PATCH their own jobs
--      to status=failed (failed jobs are not counted), move created_at back a
--      month, or DELETE them. Proven: the sidebar went from 3/3 to 0/3.
--   2. jobs.channel_id and jobs.project_id were ON DELETE CASCADE. Deleting a
--      competitor or a project deleted its runs, so ordinary users got runs
--      back just by tidying up — no tricks required.
--   3. channels/ideas accepted a project_id or channel_id belonging to someone
--      else (WITH CHECK only checked owner_id). Not a money bug, but a user
--      could attach rows to another user's project.
--
-- THE FIX
--   * Users may only READ their jobs. Every write now happens server-side with
--     the service role (research, transcript and ideas routes, the jobs sync
--     route and the Apify webhook) — deployed BEFORE this migration, so applying
--     it breaks nothing.
--   * Deleting a channel or project keeps its jobs (channel_id/project_id go
--     NULL). The run still happened and still counts.
--   * channels/ideas/jobs/calendar_slots/transcripts may only reference the
--     user's own project / channel / idea.
--
-- Safe to re-run.
-- ============================================================================

-- 1. jobs: read-only for users ------------------------------------------------
drop policy if exists "own jobs" on public.jobs;
drop policy if exists "read own jobs" on public.jobs;
create policy "read own jobs" on public.jobs
  for select using (auth.uid() = owner_id);

-- 2. deleting a channel/project no longer deletes its runs --------------------
do $$
declare
  c record;
begin
  for c in
    select con.conname, att.attname
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.conrelid = 'public.jobs'::regclass
      and con.contype = 'f'
      and att.attname in ('channel_id', 'project_id')
  loop
    execute format('alter table public.jobs drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.jobs
  add constraint jobs_channel_id_fkey
    foreign key (channel_id) references public.channels (id) on delete set null,
  add constraint jobs_project_id_fkey
    foreign key (project_id) references public.projects (id) on delete set null;

-- 3. rows may only point at the user's own parents ----------------------------
drop policy if exists "own channels" on public.channels;
create policy "own channels" on public.channels
  for all
  using (auth.uid() = owner_id)
  with check (
    auth.uid() = owner_id
    and exists (select 1 from public.projects p
                where p.id = channels.project_id and p.owner_id = auth.uid())
  );

drop policy if exists "own ideas" on public.ideas;
create policy "own ideas" on public.ideas
  for all
  using (auth.uid() = owner_id)
  with check (
    auth.uid() = owner_id
    and exists (select 1 from public.channels c
                where c.id = ideas.channel_id and c.owner_id = auth.uid())
    and (ideas.project_id is null or exists (
          select 1 from public.projects p
          where p.id = ideas.project_id and p.owner_id = auth.uid()))
  );

drop policy if exists "own calendar slots" on public.calendar_slots;
create policy "own calendar slots" on public.calendar_slots
  for all
  using (auth.uid() = owner_id)
  with check (
    auth.uid() = owner_id
    and exists (select 1 from public.projects p
                where p.id = calendar_slots.project_id and p.owner_id = auth.uid())
    and exists (select 1 from public.ideas i
                where i.id = calendar_slots.idea_id and i.owner_id = auth.uid())
  );

drop policy if exists "own transcripts" on public.transcripts;
create policy "own transcripts" on public.transcripts
  for all
  using (auth.uid() = owner_id)
  with check (
    auth.uid() = owner_id
    and (transcripts.project_id is null or exists (
          select 1 from public.projects p
          where p.id = transcripts.project_id and p.owner_id = auth.uid()))
  );
