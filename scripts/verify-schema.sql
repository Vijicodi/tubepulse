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
                             where t.typname = 'job_kind' and e.enumlabel = 'transcript')),

    -- 0010 — USD pricing
    ('promo_codes.min_amount_cents (0010)',
                            (select count(*) > 0 from information_schema.columns
                             where table_name = 'promo_codes' and column_name = 'min_amount_cents')),
    ('promo_codes.applies_to_cycles (0010)',
                            (select count(*) > 0 from information_schema.columns
                             where table_name = 'promo_codes' and column_name = 'applies_to_cycles')),

    -- 0011 — the paid-tier idea extras
    ('ideas.title_variants (0011)',
                            (select count(*) > 0 from information_schema.columns
                             where table_name = 'ideas' and column_name = 'title_variants')),
    ('ideas.thumbnail_concepts (0011)',
                            (select count(*) > 0 from information_schema.columns
                             where table_name = 'ideas' and column_name = 'thumbnail_concepts')),

    -- 0012 — per-run cost and the agent trail
    ('jobs.usage (0012)',   (select count(*) > 0 from information_schema.columns
                             where table_name = 'jobs' and column_name = 'usage')),
    ('jobs.trail (0012)',   (select count(*) > 0 from information_schema.columns
                             where table_name = 'jobs' and column_name = 'trail')),

    -- 0013 — the tiered launch promo. BOTH enum values matter: this migration
    -- has to be pasted in two halves, and stopping between them leaves the
    -- types extended but the columns absent.
    ('promo_duration has first_two_cycles (0013)',
                            (select count(*) > 0 from pg_enum e
                             join pg_type t on t.oid = e.enumtypid
                             where t.typname = 'promo_duration'
                               and e.enumlabel = 'first_two_cycles')),
    ('promo_scope has subscription_monthly (0013)',
                            (select count(*) > 0 from pg_enum e
                             join pg_type t on t.oid = e.enumtypid
                             where t.typname = 'promo_scope'
                               and e.enumlabel = 'subscription_monthly')),
    ('promo_codes.tier_percents (0013)',
                            (select count(*) > 0 from information_schema.columns
                             where table_name = 'promo_codes' and column_name = 'tier_percents')),
    ('promo_codes.tier_offer_ids (0013)',
                            (select count(*) > 0 from information_schema.columns
                             where table_name = 'promo_codes' and column_name = 'tier_offer_ids')),
    ('subscriptions.promo_code (0013)',
                            (select count(*) > 0 from information_schema.columns
                             where table_name = 'subscriptions' and column_name = 'promo_code')),
    ('subscriptions.promo_cycles_remaining (0013)',
                            (select count(*) > 0 from information_schema.columns
                             where table_name = 'subscriptions'
                               and column_name = 'promo_cycles_remaining')),

    -- 0014 — the content calendar
    ('calendar_slots table (0014)',
                            (select count(*) > 0 from information_schema.tables
                             where table_name = 'calendar_slots')),
    ('calendar_slots.scheduled_for is a DATE (0014)',
                            -- Not a timestamp. A timestamptz shows a Tuesday
                            -- slot as Monday for anyone west of UTC.
                            (select data_type = 'date' from information_schema.columns
                             where table_name = 'calendar_slots'
                               and column_name = 'scheduled_for'))
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
    'promo_codes', 'promo_redemptions', 'calendar_slots'
  )

order by 2 desc, 1;
