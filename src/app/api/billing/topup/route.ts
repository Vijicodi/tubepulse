import { NextResponse } from "next/server";
import { z } from "zod";
import { TOPUPS, toTopupKey } from "@/lib/billing/plans";
import { checkPromo } from "@/lib/billing/promo-store";
import { createTopupOrder, RazorpayError } from "@/lib/razorpay/client";
import { assertModeMatchesEnvironment } from "@/lib/env";
import { createServerClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/public-env";

/**
 * POST /api/billing/topup — buy a refill pack.
 *
 * Creates a one-off Razorpay ORDER and returns its id. Nothing is charged here;
 * the browser opens checkout with the id and pays there.
 *
 * The request body names a PACK, never an amount. The price and the scrape
 * count both come from the server-side catalogue — a browser that could send
 * `{ amount: 100 }` would buy fifteen scrapes for a rupee.
 *
 * Unlike the subscription, this has no "already bought" guard on purpose:
 * buying two refills is a legitimate thing to want to do.
 */

export const runtime = "nodejs";

const bodySchema = z.object({
  pack: z.string().min(1),
  promoCode: z.string().max(64).optional(),
});

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to buy a refill." }, { status: 401 });
  }

  // Fail loudly rather than take a payment that never becomes money.
  assertModeMatchesEnvironment();

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Which pack?" }, { status: 400 });
  }

  const key = toTopupKey(body.data.pack);
  if (!key) {
    return NextResponse.json({ error: "No such refill pack." }, { status: 400 });
  }

  const topup = TOPUPS[key];

  // Re-validate the code from scratch. The preview endpoint's answer was given
  // to a browser; this is the one that decides what is charged. Refills are
  // Orders, so the discount is simply a smaller amount — no Razorpay Offer
  // needed, unlike the subscription.
  let chargePaise = topup.pricePaise;
  const rawCode = body.data.promoCode?.trim();

  if (rawCode) {
    const promo = await checkPromo({
      rawCode,
      target: "topup",
      amountPaise: topup.pricePaise,
      ownerId: user.id,
    });

    if (!promo.ok) {
      // Refuse rather than quietly charging full price to someone who typed a
      // code and was shown a discount.
      return NextResponse.json({ error: promo.reason }, { status: 400 });
    }

    chargePaise = promo.finalPaise;
  }

  let order;
  try {
    order = await createTopupOrder({
      topup,
      ownerId: user.id,
      email: user.email ?? null,
      amountPaise: chargePaise,
      promoCode: rawCode ? rawCode.toUpperCase() : null,
    });
  } catch (error) {
    const message =
      error instanceof RazorpayError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not reach Razorpay.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({
    orderId: order.id,
    keyId: publicEnv.razorpayKeyId,
    amount: chargePaise,
    listAmount: topup.pricePaise,
    packName: topup.name,
    scrapes: topup.scrapes,
    email: user.email ?? "",
  });
}
