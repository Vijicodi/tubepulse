-- ============================================================================
-- 0019_plan_switch.sql — room for a plan switch in flight
--
-- A switch (Creator -> Studio, monthly -> yearly, …) is a NEW Razorpay
-- subscription, because Razorpay cannot change the plan on a UPI mandate.
-- Until that new one is paid, the customer must keep the plan they have — so
-- the new subscription's id waits here instead of overwriting
-- razorpay_subscription_id. When it is paid, the server cancels the old one,
-- refunds its unused days, and moves the new id across (lib/billing/store.ts
-- completeSwitch). An abandoned switch leaves the current plan untouched.
--
-- Safe to re-run.
-- ============================================================================

alter table public.subscriptions
  add column if not exists switch_subscription_id text;

create index if not exists subscriptions_switch_idx
  on public.subscriptions (switch_subscription_id)
  where switch_subscription_id is not null;
