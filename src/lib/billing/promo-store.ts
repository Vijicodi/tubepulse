import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PromoCodeRow } from "@/lib/supabase/types";
import type { BillingCycle, PlanKey } from "@/lib/billing/plans";
import {
  evaluatePromo,
  normaliseCode,
  type PromoCode,
  type PromoResult,
  type PromoTarget,
} from "./promo";

/**
 * Looking a promo code up, and recording that it was used.
 *
 * `promo_codes` has RLS enabled with NO policy at all, so nothing can read it
 * with a user's own credentials — a signed-in visitor cannot list the table and
 * discover unreleased codes. Every read here goes through the service-role
 * client and returns only a verdict for the single code that was typed.
 *
 * The rules themselves live in `promo.ts`, which is pure and tested. This file
 * only fetches rows and writes redemptions.
 */

/** Look up one code. Returns null for anything not found. */
export async function findPromo(rawCode: string): Promise<PromoCode | null> {
  const code = normaliseCode(rawCode);
  if (code === "") return null;

  const { data } = await createAdminClient()
    .from("promo_codes")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  return data ? toPromoCode(data) : null;
}

/** Has this person used this code before? Drives the once-per-user rule. */
export async function hasRedeemed(promoCode: string, ownerId: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { data: promo } = await supabase
    .from("promo_codes")
    .select("id")
    .eq("code", normaliseCode(promoCode))
    .maybeSingle();

  if (!promo) return false;

  const { data } = await supabase
    .from("promo_redemptions")
    .select("id")
    .eq("promo_id", promo.id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  return Boolean(data);
}

/**
 * The whole check, in one call: find it, ask whether this person may use it,
 * and price it.
 *
 * Used by the validate route AND by checkout itself. Checkout must re-run it
 * rather than trusting what the browser was told a moment ago — the code could
 * have expired, been fully claimed, or simply been made up by whoever is
 * posting to the endpoint.
 */
export async function checkPromo({
  rawCode,
  target,
  cycle,
  planKey,
  amountCents,
  ownerId,
}: {
  rawCode: string;
  target: PromoTarget;
  /** Required for subscriptions — an annual-only code needs to know. */
  cycle?: BillingCycle;
  /** Which tier is being bought, so a tiered code picks the right rate. */
  planKey?: PlanKey;
  amountCents: number;
  ownerId: string;
}): Promise<PromoResult> {
  const promo = await findPromo(rawCode);
  if (!promo) return { ok: false, reason: "That code does not exist." };

  return evaluatePromo({
    promo,
    target,
    cycle,
    planKey,
    amountCents,
    alreadyRedeemed: await hasRedeemed(promo.code, ownerId),
  });
}

/**
 * Record a use.
 *
 * The unique index on (promo_id, owner_id) is what actually enforces
 * once-per-person — two simultaneous checkouts can both pass the read above,
 * and only one can win this insert. A collision is therefore not an error
 * worth surfacing: it means the code was already counted.
 *
 * The redemption count on `promo_codes` is bumped by a database trigger, not
 * here, for the same reason.
 */
export async function recordRedemption({
  promoCode,
  ownerId,
  target,
  discountCents,
  reference,
}: {
  promoCode: string;
  ownerId: string;
  target: PromoTarget;
  discountCents: number;
  reference: string | null;
}): Promise<void> {
  const supabase = createAdminClient();

  const { data: promo } = await supabase
    .from("promo_codes")
    .select("id, repeatable")
    .eq("code", normaliseCode(promoCode))
    .maybeSingle();

  if (!promo) return;

  const { error } = await supabase.from("promo_redemptions").insert({
    promo_id: promo.id,
    owner_id: ownerId,
    target,
    discount_cents: discountCents,
    // The partial unique index treats this sentinel as "does not count towards
    // the once-per-user rule", which is how a repeatable code stays repeatable.
    razorpay_reference: promo.repeatable ? "repeatable" : reference,
  });

  // 23505 = the once-per-user index. Already recorded; nothing to do.
  if (error && error.code !== "23505") {
    throw new Error(`Could not record the promo redemption: ${error.message}`);
  }
}

/**
 * Database row → the shape the pure rules expect.
 *
 * The cents columns are read with a paise fallback, because rows written before
 * the currency switch have only the old ones. Nothing converts between the two
 * — a code priced in paise was priced for a plan that no longer exists, so the
 * fallback exists to keep old rows READABLE, not to keep them sellable.
 */
function toPromoCode(row: PromoCodeRow): PromoCode {
  return {
    code: row.code,
    kind: row.kind,
    value: row.value,
    scope: row.scope,
    maxDiscountCents: row.max_discount_cents ?? row.max_discount_paise ?? null,
    minAmountCents: row.min_amount_cents ?? row.min_amount_paise ?? 0,
    razorpayOfferId: row.razorpay_offer_id,
    tierPercents: row.tier_percents,
    tierOfferIds: row.tier_offer_ids,
    appliesToCycles: row.applies_to_cycles,
    renewsAtCents: row.renews_at_cents,
    active: row.active,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    maxRedemptions: row.max_redemptions,
    redemptionCount: row.redemption_count,
    repeatable: row.repeatable,
    description: row.description,
  };
}
