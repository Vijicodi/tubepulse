import { NextResponse } from "next/server";
import { z } from "zod";
import { PLAN_PRICES, toBillingCycle, toPaidPlanKey } from "@/lib/billing/plans";
import { checkPromo } from "@/lib/billing/promo-store";
import { createServerClient } from "@/lib/supabase/server";

/**
 * POST /api/billing/promo — check a code and price it, without charging.
 *
 * Preview only. Whatever this returns is for showing a struck-through price;
 * it grants nothing, and checkout re-runs the identical check server-side
 * rather than trusting the figure the browser was handed. A code can expire or
 * be fully claimed in the seconds between the two calls, and the request to
 * this endpoint could have been made by anyone.
 *
 * Requires a session, so that once-per-person can be evaluated — and so the
 * endpoint cannot be used anonymously to brute-force code names.
 *
 * The amount is derived from the named product, never sent by the client. A
 * body that could say `amountPaise: 100000` would report a 20% code as ₹200 off.
 */

export const runtime = "nodejs";

const bodySchema = z.object({
  code: z.string().min(1).max(64),
  target: z.enum(["subscription", "topup"]),
  /** Which subscription cycle, when target is "subscription". */
  cycle: z.string().optional(),
  /** Which tier, when target is "subscription". */
  plan: z.string().optional(),
});

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, reason: "Sign in to use a code." }, { status: 401 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ ok: false, reason: "Malformed request." }, { status: 400 });
  }

  const amountCents = amountFor(body.data);
  if (amountCents === null) {
    return NextResponse.json(
      { ok: false, reason: "We could not work out what that code applies to." },
      { status: 400 },
    );
  }

  const cycle = toBillingCycle(body.data.cycle ?? "monthly") ?? "monthly";

  // The tier matters, not just the amount: a tiered code gives Creator 30%,
  // Studio 40% and Max 50%. Omitting this would quietly price every tier at
  // the code's fallback rate.
  const planKey = toPaidPlanKey(body.data.plan ?? "") ?? undefined;

  const result = await checkPromo({
    rawCode: body.data.code,
    target: body.data.target,
    cycle,
    planKey,
    amountCents,
    ownerId: user.id,
  });

  // 200 either way. A rejected code is a normal answer to a normal question,
  // not an HTTP error — and a 4xx here would make the client treat "expired"
  // and "the server fell over" as the same thing.
  return NextResponse.json(
    result.ok
      ? {
          ok: true,
          code: result.code,
          label: result.label,
          discountCents: result.discountCents,
          finalCents: result.finalCents,
          originalCents: amountCents,
          // The disclosure. A checkout that hides this is how a promo becomes
          // a chargeback — see renewalNoticeFor in promo.ts.
          renewalNotice: result.renewalNotice,
          // Drives the "discount ends" countdown at the card step.
          cyclesCovered: result.cyclesCovered,
          renewsAtCents: result.renewsAtCents,
        }
      : { ok: false, reason: result.reason },
  );
}

/**
 * The list price of whatever is being discounted. Server-side, always.
 *
 * Only subscriptions remain — refill packs were retired with the move to four
 * tiers, so a "topup" target has nothing left to price and returns null rather
 * than guessing.
 */
function amountFor(body: {
  target: "subscription" | "topup";
  cycle?: string;
  plan?: string;
}): number | null {
  if (body.target !== "subscription") return null;

  const cycle = toBillingCycle(body.cycle ?? "monthly");
  const plan = toPaidPlanKey(body.plan ?? "");

  return cycle && plan ? PLAN_PRICES[plan][cycle].priceCents : null;
}
