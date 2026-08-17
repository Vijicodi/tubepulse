-- ============================================================================
-- launch-promo.sql — the LAUNCH20 code
--
-- NOT a migration. Migrations are schema history and are never edited once
-- applied; this is data you may want to change, re-run or switch off, so it
-- lives apart and is not picked up by `npm run db:sql`.
--
-- ---------------------------------------------------------------------------
-- READ THIS BEFORE RUNNING. There are TWO steps and the order matters.
--
-- STEP 1 — create the Razorpay Offer, because a subscription cannot be
--          discounted without one.
--
--   A refill is a Razorpay *Order* and is created for whatever amount we ask
--   for, so the app computes that discount itself. The subscription bills a
--   fixed-amount *Plan*, and Razorpay provides no way to charge less than the
--   plan says — the only supported route is an Offer.
--
--   In the Razorpay Dashboard:
--     Subscriptions  ->  + Create New Offer
--       Type                  Percentage
--       Value                 20
--       Applicable on         FIRST PAYMENT ONLY   <-- important, see below
--       Applies to plans      both TubePulse Pro plans
--
--   Copy the offer id. It looks like  offer_QxxxxxxxxxxxxX.
--
--   "First payment only" matters because the app's copy promises a discount on
--   the first month or year, not forever. An offer set to every cycle would
--   quietly hand out 20% for life — on the annual plan that is ₹998 a year,
--   permanently, to everyone who ever typed the code.
--
-- STEP 2 — paste that id into the insert below, replacing REPLACE_ME, then run
--          this file in the Supabase SQL editor.
--
--   If you leave REPLACE_ME in place the code still works on refills, and the
--   app refuses it on subscriptions with "That code is not set up for
--   subscriptions yet". That refusal is deliberate: the alternative is showing
--   somebody ₹399 and charging them ₹499.
-- ---------------------------------------------------------------------------
--
-- WHAT THIS CODE COSTS YOU, worst case, on the expensive model:
--
--   Monthly  ₹499 -> ₹399   first month   ~37% margin that month, then 49%
--   Yearly   ₹4,990 -> ₹4,490 (capped)    ~33% margin that year, then 40%
--   Refill   ₹449 -> ₹359                 ~46% margin on that pack
--
-- The ₹500 cap is why the annual figure is not worse. An uncapped 20% takes
-- ₹998 off the annual plan and leaves about 25% — thin enough that a single
-- heavy user in that first year is unprofitable. The cap keeps the headline
-- ("20% off") while bounding the damage on the biggest ticket.
--
-- 100 redemptions at roughly ₹100 each is about ₹10,000 of margin spent to buy
-- 100 first purchases. That is the budget being approved by running this.
-- ============================================================================

insert into public.promo_codes (
  code,
  kind,
  value,
  scope,
  max_discount_paise,
  min_amount_paise,
  razorpay_offer_id,
  active,
  expires_at,
  max_redemptions,
  repeatable,
  description
)
values (
  'LAUNCH20',
  'percent',
  20,
  -- Works on the subscription AND on refills.
  'both',
  -- Cap the discount at ₹500 so 20% off the annual plan does not become ₹998.
  50000,
  -- No minimum: it should work on the ₹149 refill too.
  0,
  -- STEP 1 above. Leave as REPLACE_ME and it is refills-only.
  'REPLACE_ME',
  true,
  -- Three months. A launch code with no end date is a permanent price cut.
  now() + interval '3 months',
  100,
  -- One use per person. Almost never change this.
  false,
  'Launch discount — 20% off the first payment, capped at ₹500.'
)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Useful afterwards
-- ---------------------------------------------------------------------------

-- Has anyone used it?
--   select c.code, c.redemption_count, c.max_redemptions
--   from public.promo_codes c where c.code = 'LAUNCH20';

-- Switch it off immediately, without deleting the history:
--   update public.promo_codes set active = false where code = 'LAUNCH20';

-- Add the offer id later, once Razorpay has one:
--   update public.promo_codes
--   set razorpay_offer_id = 'offer_XXXXXXXXXXXX'
--   where code = 'LAUNCH20';

-- Never touch redemption_count by hand — a trigger maintains it.
