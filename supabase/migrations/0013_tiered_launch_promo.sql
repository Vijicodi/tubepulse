-- ============================================================================
-- 0013_tiered_launch_promo.sql — one code, a different percentage per tier
--
-- The launch codes discount the FIRST TWO MONTHLY CYCLES, and the percentage
-- depends on which tier is bought: Creator 30%, Studio 40%, Max 50%. One code,
-- three outcomes. The deeper cut on the higher tier is the point — the code is
-- meant to pull people up the ladder, not merely to be generous.
--
-- WHY NEW COLUMNS RATHER THAN THREE CODES. Three separate codes would mean
-- telling an invitee "use LAUNCH30 unless you pick Studio, then LAUNCH40" —
-- which is a support conversation, and an invitation that reads like homework.
-- One code that simply does the right thing is the product.
--
-- WHY PER-TIER OFFER IDS. A Razorpay Offer carries its own fixed discount and
-- is attached at subscription creation. Three percentages therefore need three
-- offers, selected by the tier being bought. `razorpay_offer_id` (singular)
-- stays for existing single-rate codes; `tier_offer_ids` is the new map.
--
-- ============ THE TRAP, AGAIN, AND IT IS WORSE HERE ============
-- A Razorpay Offer applies to EVERY cycle of a subscription unless the offer
-- is created with a cycle limit. These codes need a limit of 2. There are now
-- SIX offers to create (three tiers x two codes) and every one of them needs
-- it. Miss one, and that tier's discount runs forever for everyone who used
-- that code on it. The application cannot enforce this — it can only refuse to
-- proceed when an offer id is absent, which it does.
--
-- Seeded INACTIVE with null dates deliberately. Nothing is redeemable until
-- the offers exist at Razorpay and the window is set.
-- ============================================================================

-- 'first_two_cycles' joins the duration enum. Postgres cannot add an enum
-- value inside a transaction that then uses it, so this is its own statement.
alter type promo_duration add value if not exists 'first_two_cycles';

-- Monthly-only scope. The existing 'subscription_yearly' has an annual twin;
-- these codes are the monthly counterpart and must not fire on annual plans,
-- where a two-cycle discount would mean two YEARS.
alter type promo_scope add value if not exists 'subscription_monthly';

-- ---------------------------------------------------------------------------
-- Per-tier configuration.
--
-- {"creator":30,"studio":40,"agency":50} — percent off, keyed by PLAN KEY.
-- Note the key is `agency`: the tier is DISPLAYED as "Max" but its internal
-- key stays `agency`, because renaming it would orphan live Razorpay
-- subscriptions and there is no database constraint that would catch a miss.
alter table public.promo_codes
  add column if not exists tier_percents jsonb;

-- {"creator":"offer_xxx","studio":"offer_yyy","agency":"offer_zzz"}
-- Each MUST be an offer created with a cycle limit of 2. See the trap above.
alter table public.promo_codes
  add column if not exists tier_offer_ids jsonb;

comment on column public.promo_codes.tier_percents is
  'Percent off per plan key. When set, overrides `value` for that tier.';
comment on column public.promo_codes.tier_offer_ids is
  'Razorpay offer id per plan key. Every one must have a 2-cycle limit.';

-- ---------------------------------------------------------------------------
-- The countdown needs the subscription to remember its own promo.
--
-- Without these, "your discount ends after two more months" cannot be shown to
-- somebody already subscribed — the promo row knows the RULE but not WHEN this
-- particular customer started. `promo_cycles_remaining` is decremented by the
-- webhook as invoices are paid, so the number shown is the number of
-- discounted invoices actually left.
--
-- Nullable throughout: a subscription bought without a code has no promo, and
-- that is not a missing value.
alter table public.subscriptions
  add column if not exists promo_code text;

alter table public.subscriptions
  add column if not exists promo_cycles_total integer
    check (promo_cycles_total is null or promo_cycles_total > 0);

alter table public.subscriptions
  add column if not exists promo_cycles_remaining integer
    check (promo_cycles_remaining is null or promo_cycles_remaining >= 0);

-- What the customer pays once the discount stops. Frozen at checkout, so the
-- figure shown in the countdown is the one they actually agreed to, even if
-- list pricing changes underneath them afterwards.
alter table public.subscriptions
  add column if not exists promo_renews_at_cents integer
    check (promo_renews_at_cents is null or promo_renews_at_cents >= 0);

-- ---------------------------------------------------------------------------
-- The two launch codes.
--
-- INACTIVE, with no window and no offer ids. Activating one before its three
-- Razorpay offers exist would show a discount at checkout and then charge full
-- price, so `active` stays false until the offers are real. `evaluatePromo`
-- independently refuses any subscription code with no offer id, so a mistake
-- here fails loudly at checkout rather than silently overcharging.
--
-- 25 redemptions each: this is a hand-picked launch, and a cap is what makes
-- an invitation feel like one. Change it with the dates.
insert into public.promo_codes (
  code, kind, value, scope, tier_percents, applies_to_cycles,
  active, starts_at, expires_at, max_redemptions, repeatable, description
)
values
  ('LAUNCH', 'percent', 30, 'subscription_monthly',
   '{"creator":30,"studio":40,"agency":50}'::jsonb, 'first_two_cycles',
   false, null, null, 25, false,
   'Launch invite. 30/40/50% off the first two monthly cycles by tier.'),
  ('FOUNDER', 'percent', 30, 'subscription_monthly',
   '{"creator":30,"studio":40,"agency":50}'::jsonb, 'first_two_cycles',
   false, null, null, 25, false,
   'Founder invite. 30/40/50% off the first two monthly cycles by tier.')
on conflict (code) do nothing;
