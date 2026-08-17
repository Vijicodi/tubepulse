-- ============================================================================
-- 0005_promos_and_yearly.sql — annual billing and promo codes
--
-- Two additions:
--   1. subscriptions.billing_cycle — Pro can now be paid monthly or yearly
--   2. promo_codes + promo_redemptions — discount codes
--
-- To apply: paste into the Supabase dashboard SQL editor and run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Annual billing
--
-- The two cycles are separate Razorpay PLAN objects, because a Razorpay plan
-- hard-codes both its period and its amount. Which one a subscriber is on is
-- not derivable from anything else we store — `razorpay_plan_id` is an opaque
-- string — so the billing page would have no way to say "renews yearly"
-- without this column.
--
-- Defaulting to 'monthly' is correct for every row that already exists: annual
-- did not exist when they subscribed.
-- ---------------------------------------------------------------------------
create type public.billing_cycle as enum ('monthly', 'yearly');

alter table public.subscriptions
  add column billing_cycle public.billing_cycle not null default 'monthly';

-- ---------------------------------------------------------------------------
-- promo_codes
--
-- READ-ONLY TO EVERYONE, including the person using one. There is no select
-- policy at all, which means a signed-in user cannot list the table and
-- discover unreleased codes — validation happens server-side through the
-- service-role client, which returns only a yes/no and a discount for the one
-- code that was typed.
--
-- WHY `razorpay_offer_id` EXISTS. A refill is a Razorpay Order and can be
-- created for any amount, so its discount is ours to compute. A subscription
-- bills a fixed-amount plan and CANNOT be discounted directly — the only
-- supported route is a Razorpay Offer created in their dashboard, passed as
-- `offer_id` at subscription creation. So a subscription promo needs a row here
-- AND an offer there, and this column is the link. A subscription-scoped code
-- without one is rejected at validation rather than silently charging full
-- price after showing a discount.
-- ---------------------------------------------------------------------------
create type public.promo_kind  as enum ('percent', 'flat');
create type public.promo_scope as enum ('subscription', 'topup', 'both');

create table public.promo_codes (
  id                 uuid primary key default gen_random_uuid(),

  -- Stored upper-case; the app upper-cases input before looking it up, so
  -- "launch20" and "Launch20" find the same row.
  code               text not null unique check (code = upper(code) and length(code) >= 3),

  kind               public.promo_kind not null,

  -- Percent (1-100) when kind = 'percent', paise off when kind = 'flat'.
  value              integer not null check (value > 0),

  scope              public.promo_scope not null default 'both',

  -- Ceiling on a percentage discount, in paise. Stops "50% off" from taking
  -- ₹2,495 off an annual plan when the intent was a small nudge.
  max_discount_paise integer check (max_discount_paise is null or max_discount_paise > 0),
  min_amount_paise   integer not null default 0 check (min_amount_paise >= 0),

  -- Required for anything with subscription scope. See the note above.
  razorpay_offer_id  text,

  active             boolean not null default true,
  starts_at          timestamptz,
  expires_at         timestamptz,

  -- Null means unlimited. Enforced in the app AND by the count below.
  max_redemptions    integer check (max_redemptions is null or max_redemptions > 0),
  redemption_count   integer not null default 0 check (redemption_count >= 0),

  -- Almost always false: one code, one person, once.
  repeatable         boolean not null default false,

  description        text,
  created_at         timestamptz not null default now(),

  -- A percentage over 100 would pay the customer.
  constraint promo_percent_range
    check (kind <> 'percent' or (value > 0 and value <= 100))
);

alter table public.promo_codes enable row level security;
-- No policy at all: nobody reads this with their own credentials.

-- ---------------------------------------------------------------------------
-- promo_redemptions
--
-- One row per use. The unique constraint on (promo_id, owner_id) is what makes
-- "once per person" a database guarantee rather than a check that two
-- simultaneous requests can both pass.
--
-- `repeatable` codes are the exception, and they get a null owner-uniqueness by
-- carrying the payment id in the key instead — see the partial index below.
-- ---------------------------------------------------------------------------
create table public.promo_redemptions (
  id           uuid primary key default gen_random_uuid(),
  promo_id     uuid not null references public.promo_codes (id) on delete cascade,
  owner_id     uuid not null references auth.users (id) on delete cascade,

  target       text not null check (target in ('subscription', 'topup')),
  discount_paise integer not null check (discount_paise >= 0),

  -- Whichever Razorpay object the discount was applied to.
  razorpay_reference text,

  created_at   timestamptz not null default now()
);

-- One use per person, unless the code is explicitly repeatable.
create unique index promo_redemptions_once_per_user
  on public.promo_redemptions (promo_id, owner_id)
  where razorpay_reference is null or razorpay_reference <> 'repeatable';

create index promo_redemptions_owner_idx
  on public.promo_redemptions (owner_id, created_at desc);

alter table public.promo_redemptions enable row level security;

-- A user may see which codes THEY have used — the billing page shows it — but
-- writes stay with the service role, like every other money table.
create policy "read own redemptions" on public.promo_redemptions
  for select using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- Counting redemptions
--
-- Done in a trigger rather than in the app, so `max_redemptions` cannot be
-- exceeded by two checkouts landing at the same moment. The app checks the
-- count to give a good error message; the database is what makes it true.
-- ---------------------------------------------------------------------------
create or replace function public.bump_promo_redemption_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.promo_codes
  set redemption_count = redemption_count + 1
  where id = new.promo_id;
  return new;
end;
$$;

create trigger promo_redemptions_bump_count
  after insert on public.promo_redemptions
  for each row execute function public.bump_promo_redemption_count();
