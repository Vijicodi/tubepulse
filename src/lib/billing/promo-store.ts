import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PromoCodeRow } from "@/lib/supabase/types";
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
  amountPaise,
  ownerId,
}: {
  rawCode: string;
  target: PromoTarget;
  amountPaise: number;
  ownerId: string;
}): Promise<PromoResult> {
  const promo = await findPromo(rawCode);
  if (!promo) return { ok: false, reason: "That code does not exist." };

  return evaluatePromo({
    promo,
    target,
    amountPaise,
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
  discountPaise,
  reference,
}: {
  promoCode: string;
  ownerId: string;
  target: PromoTarget;
  discountPaise: number;
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
    discount_paise: discountPaise,
    // The partial unique index treats this sentinel as "does not count towards
    // the once-per-user rule", which is how a repeatable code stays repeatable.
    razorpay_reference: promo.repeatable ? "repeatable" : reference,
  });

  // 23505 = the once-per-user index. Already recorded; nothing to do.
  if (error && error.code !== "23505") {
    throw new Error(`Could not record the promo redemption: ${error.message}`);
  }
}

/** Database row → the shape the pure rules expect. */
function toPromoCode(row: PromoCodeRow): PromoCode {
  return {
    code: row.code,
    kind: row.kind,
    value: row.value,
    scope: row.scope,
    maxDiscountPaise: row.max_discount_paise,
    minAmountPaise: row.min_amount_paise,
    razorpayOfferId: row.razorpay_offer_id,
    active: row.active,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    maxRedemptions: row.max_redemptions,
    redemptionCount: row.redemption_count,
    repeatable: row.repeatable,
    description: row.description,
  };
}
