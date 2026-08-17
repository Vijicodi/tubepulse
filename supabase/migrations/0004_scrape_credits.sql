-- ============================================================================
-- 0004_scrape_credits.sql — refill packs
--
-- One-off scrape packs, bought outright. A DIFFERENT Razorpay product from the
-- subscription in 0003: these are Orders, paid once, with no mandate. Hence a
-- separate table rather than a column on `subscriptions` — a pack survives
-- cancelling Pro, because it was paid for outright and taking it away would be
-- theft with extra steps.
--
-- WHY A LEDGER, NOT A BALANCE COLUMN
--
-- A single `credits_remaining` integer would be one row that every purchase and
-- every scrape races to update, and the first lost update silently gives away
-- or steals scrapes with no way to find out which. An append-only ledger cannot
-- lose history: credits are positive rows, spends will be negative rows, and
-- the balance is their sum. When something looks wrong, the arithmetic is
-- visible instead of inferred.
--
-- NOTE ON QUOTAS. Nothing spends these yet — the app still counts no scrapes.
-- Purchases are recorded correctly so that no one loses money they have already
-- paid, and the spending half arrives with the quota work.
--
-- To apply: paste into the Supabase dashboard SQL editor and run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- scrape_credits
--
-- `razorpay_payment_id` is UNIQUE, which is what makes crediting idempotent.
-- Three separate paths can learn that a pack was paid for — the browser handler,
-- the `order.paid` webhook, and a manual sync — and all three insert. The
-- unique constraint is what stops a customer being granted the same pack three
-- times. It is a nullable column because a hand-granted credit (support, a
-- refund gesture) has no payment behind it.
-- ---------------------------------------------------------------------------
create table public.scrape_credits (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users (id) on delete cascade,

  -- Positive for a purchase, negative for a spend once quotas exist.
  credits             integer not null check (credits <> 0),

  -- 'topup_small' | 'topup_large' | 'manual'. Text rather than an enum so that
  -- adding a pack is a change to plans.ts, not a migration on a money table.
  source              text not null,

  razorpay_order_id   text,
  razorpay_payment_id text unique,

  -- What was actually charged, in paise. Stored rather than derived: the
  -- catalogue price can change later, and a receipt must not change with it.
  amount_paise        integer not null default 0 check (amount_paise >= 0),

  note                text,
  created_at          timestamptz not null default now()
);

create index scrape_credits_owner_idx
  on public.scrape_credits (owner_id, created_at desc);

alter table public.scrape_credits enable row level security;

-- Read-only to the owner, exactly like `subscriptions`. There is deliberately
-- no insert, update or delete policy: nothing a browser sends may mint credit.
-- All writes go through the service-role client, and only after a Razorpay
-- payment signature has been verified.
create policy "read own credits" on public.scrape_credits
  for select using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- scrape_credit_balance
--
-- The sum, so no page has to remember to add the rows up itself and no two
-- pages can disagree about someone's balance.
--
-- `security_invoker = on` matters: without it the view would run as its owner
-- and bypass the RLS policy above, handing every user everyone else's balance.
-- ---------------------------------------------------------------------------
create view public.scrape_credit_balance
with (security_invoker = on) as
select
  owner_id,
  coalesce(sum(credits), 0)::integer as balance
from public.scrape_credits
group by owner_id;
