import { NextResponse } from "next/server";
import { z } from "zod";
import { PRO_PRICES, TOPUPS, toBillingCycle, toTopupKey } from "@/lib/billing/plans";
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
  /** Which pack, when target is "topup". */
  pack: z.string().optional(),
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

  const amountPaise = amountFor(body.data);
  if (amountPaise === null) {
    return NextResponse.json(
      { ok: false, reason: "We could not work out what that code applies to." },
      { status: 400 },
    );
  }

  const result = await checkPromo({
    rawCode: body.data.code,
    target: body.data.target,
    amountPaise,
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
          discountPaise: result.discountPaise,
          finalPaise: result.finalPaise,
          originalPaise: amountPaise,
        }
      : { ok: false, reason: result.reason },
  );
}

/** The list price of whatever is being discounted. Server-side, always. */
function amountFor(body: {
  target: "subscription" | "topup";
  cycle?: string;
  pack?: string;
}): number | null {
  if (body.target === "subscription") {
    const cycle = toBillingCycle(body.cycle ?? "monthly");
    return cycle ? PRO_PRICES[cycle].pricePaise : null;
  }

  const pack = toTopupKey(body.pack ?? "");
  return pack ? TOPUPS[pack].pricePaise : null;
}
