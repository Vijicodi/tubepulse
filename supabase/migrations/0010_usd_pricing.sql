-- ============================================================================
-- 0010_usd_pricing.sql — four USD tiers, and promos that know when they stop
--
-- Two changes, both additive. Nothing is dropped or renamed, so an existing
-- row keeps working and a re-run of this file is a no-op.
--
-- 1. PROMO DURATION. A Razorpay Offer attached to a subscription discounts
--    EVERY billing cycle unless the offer itself was created with a cycle
--    limit. The obvious way to build "30% off your first year" therefore
--    produces "30% off forever", and nobody notices until the second renewal.
--    `applies_to_cycles` records what the offer was actually configured with,
--    and `renews_at_cents` is the number the checkout discloses. A first-cycle
--    code with no renewal price is refused at validation rather than shipped.
--
-- 2. USD COLUMNS. Money is stored in the currency's minor unit, and that unit
--    is now cents rather than paise. The paise columns are LEFT IN PLACE and
--    left nullable: they hold the history of every promo priced before the
--    switch, and dropping them would destroy that for no gain. New rows write
--    the cents columns; old rows keep their paise.
--
-- To apply: paste into the Supabase dashboard SQL editor and run.
-- ============================================================================

-- --- 1. Promo duration ------------------------------------------------------

do $$
begin
  create type promo_duration as enum ('first_cycle_only', 'forever');
exception
  when duplicate_object then null;
end $$;

alter table public.promo_codes
  add column if not exists applies_to_cycles promo_duration not null default 'forever';

-- What the customer pays once the discount stops, in cents. Required by the
-- application layer whenever applies_to_cycles is 'first_cycle_only' — it is
-- what the renewal disclosure shows. Nullable here because a 'forever' code
-- genuinely has no such number.
alter table public.promo_codes
  add column if not exists renews_at_cents integer;

-- --- 2. USD amounts ---------------------------------------------------------

alter table public.promo_codes
  add column if not exists max_discount_cents integer;

alter table public.promo_codes
  add column if not exists min_amount_cents integer not null default 0;

alter table public.promo_redemptions
  add column if not exists discount_cents integer not null default 0;

-- The old paise columns become optional rather than disappearing. A row written
-- before the currency switch keeps its value; a row written after simply has
-- nothing to put there.
alter table public.promo_codes
  alter column max_discount_paise drop not null;

alter table public.promo_codes
  alter column min_amount_paise drop default;

do $$
begin
  alter table public.promo_codes alter column min_amount_paise drop not null;
exception
  when others then null;
end $$;

do $$
begin
  alter table public.promo_redemptions alter column discount_paise drop not null;
exception
  when others then null;
end $$;

-- --- 3. The subscription's tier ---------------------------------------------

-- `plan_key` already exists as text and already defaults to 'pro'. Four tiers
-- means that default is now wrong for every new row, and 'pro' is not a plan
-- any more. Repointing the default costs nothing and stops a webhook that
-- arrives without a plan_key note from writing a key the app cannot resolve.
--
-- EXISTING 'pro' ROWS ARE LEFT ALONE on purpose. There are no paying
-- subscribers on the old pricing, so there is nothing to migrate; and if one
-- did exist, silently moving them to a differently-priced tier is the last
-- thing a billing system should do without being asked.
alter table public.subscriptions
  alter column plan_key set default 'creator';

-- No new RLS policy anywhere. Every table touched here already carries one from
-- the migration that created it, and a new column inherits it.
