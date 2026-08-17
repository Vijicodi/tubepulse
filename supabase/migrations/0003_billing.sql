-- ============================================================================
-- 0003_billing.sql — Razorpay subscriptions
--
-- Two tables, both service-role-written and user-readable:
--
--   subscriptions  — one row per user, the answer to "is this person Pro?"
--   billing_events — every webhook Razorpay ever sent us, keyed by its own id
--
-- WHY THE SECOND TABLE. Razorpay re-delivers webhooks on any non-2xx, and the
-- polling fallback at /api/billing/sync can reach the same state change first.
-- Recording the event id makes replay a no-op instead of a double-write, and
-- keeps a paper trail for the day someone disputes a charge. Money is the one
-- place where "probably only ran once" is not good enough.
--
-- NOTE ON QUOTAS. This migration deliberately does NOT add a usage table.
-- Counting scrapes is the next piece of work; conflating it with payments would
-- make both harder to verify. Being Pro and having quota left are separate
-- questions and get separate tables.
--
-- To apply: paste into the Supabase dashboard SQL editor and run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- subscription_status
--
-- Razorpay's own vocabulary, kept verbatim rather than mapped to something
-- friendlier. When support asks "what does the dashboard say", the answer and
-- our column should be the same word.
--
--   created        subscription made, customer has not authorised autopay yet
--   authenticated  mandate approved, first charge not taken
--   active         paying
--   pending        a charge failed, Razorpay is retrying
--   halted         retries exhausted — treat as not paying
--   cancelled      cancelled, by us or by them
--   completed      ran its full billing cycle count
--   expired        authorisation was never completed in time
-- ---------------------------------------------------------------------------
create type public.subscription_status as enum (
  'created',
  'authenticated',
  'active',
  'pending',
  'halted',
  'cancelled',
  'completed',
  'expired'
);

-- ---------------------------------------------------------------------------
-- subscriptions
--
-- owner_id is UNIQUE: one subscription per user. Upgrading, cancelling and
-- re-subscribing all rewrite this row rather than adding another, so no query
-- ever has to work out which of three rows is the live one.
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  owner_id                 uuid not null unique references auth.users (id) on delete cascade,

  -- 'pro' today. A text column, not an enum, because adding a plan should not
  -- need a migration on a table that holds money state.
  plan_key                 text not null default 'pro',

  razorpay_subscription_id text unique,
  razorpay_customer_id     text,
  razorpay_plan_id         text,

  status                   public.subscription_status not null default 'created',

  -- End of the period already paid for. A cancelled subscription stays usable
  -- until this moment, which is what the pricing page promises.
  current_period_end       timestamptz,

  -- True once the user has asked to cancel but the paid period has not ended.
  -- The UI needs to say "Pro until 12 September", not just "cancelled".
  cancel_at_period_end     boolean not null default false,
  cancelled_at             timestamptz,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index subscriptions_status_idx on public.subscriptions (status);

create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

alter table public.subscriptions enable row level security;

-- Read-only to the user who owns it. There is deliberately no insert, update or
-- delete policy: nothing a browser sends should ever be able to grant Pro. All
-- writes go through the service-role client, and only ever from a Razorpay
-- payload we have verified.
create policy "read own subscription" on public.subscriptions
  for select using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- billing_events
--
-- The primary key is Razorpay's event id, so a re-delivery collides instead of
-- inserting. RLS is enabled with NO policy at all, which means the anon and
-- authenticated roles can read exactly nothing — raw payloads carry contact
-- details and payment metadata that no browser needs.
-- ---------------------------------------------------------------------------
create table public.billing_events (
  id         text primary key,
  event      text not null,
  owner_id   uuid references auth.users (id) on delete set null,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);

create index billing_events_owner_idx on public.billing_events (owner_id, created_at desc);

alter table public.billing_events enable row level security;

-- ---------------------------------------------------------------------------
-- subscriptions joins the realtime publication.
--
-- Autopay authorisation finishes inside Razorpay's popup, not in our tab. The
-- billing page subscribes to this row so it flips to "Pro" the moment the
-- webhook lands, rather than making the user reload and wonder.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.subscriptions;
