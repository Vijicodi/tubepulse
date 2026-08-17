-- ============================================================================
-- verify-schema.sql — paste into the Supabase SQL editor after migrating.
--
-- Reads nothing but the catalogue. Changes nothing. Every row it returns should
-- say 'ok'; anything else names exactly what is missing.
-- ============================================================================

with expected(label, present) as (
  values
    ('ideas.saved_at',      (select count(*) > 0 from information_schema.columns
                             where table_name = 'ideas' and column_name = 'saved_at')),
    ('ideas.script',        (select count(*) > 0 from information_schema.columns
                             where table_name = 'ideas' and column_name = 'script')),
    ('jobs.payload',        (select count(*) > 0 from information_schema.columns
                             where table_name = 'jobs' and column_name = 'payload')),
    ('transcripts table',   (select count(*) > 0 from information_schema.tables
                             where table_name = 'transcripts')),
    ('channels.platform',   (select count(*) > 0 from information_schema.columns
                             where table_name = 'channels' and column_name = 'platform')),
    ('videos.kind',         (select count(*) > 0 from information_schema.columns
                             where table_name = 'videos' and column_name = 'kind')),
    ('videos.view_count is nullable',
                            (select is_nullable = 'YES' from information_schema.columns
                             where table_name = 'videos' and column_name = 'view_count')),
    ('job_kind has transcript',
                            (select count(*) > 0 from pg_enum e
                             join pg_type t on t.oid = e.enumtypid
                             where t.typname = 'job_kind' and e.enumlabel = 'transcript'))
)
select label, case when present then 'ok' else 'MISSING' end as status
from expected

union all

-- Every table must have row-level security. A table without it is readable by
-- anyone holding the anon key, which is the whole product's data.
select
  'RLS on ' || c.relname,
  case when c.relrowsecurity then 'ok' else 'RLS OFF' end
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'channels', 'videos', 'jobs', 'ideas', 'projects', 'profiles',
    'transcripts', 'subscriptions', 'scrape_credits', 'billing_events',
    'promo_codes', 'promo_redemptions'
  )

order by 2 desc, 1;
