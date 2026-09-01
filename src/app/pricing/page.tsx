import type { Metadata } from "next";
import { LiquidCursor } from "@/components/landing/liquid-cursor";
import { Pricing } from "@/components/landing/pricing";
import { ScrollChoreography } from "@/components/landing/scroll-choreography";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { toBillingCycle } from "@/lib/billing/plans";
import { getBillingState } from "@/lib/billing/store";
import { isBillingConfigured, isYearlyConfigured } from "@/lib/env";
import { isCheckoutConfigured, isSupabaseConfigured } from "@/lib/public-env";
import { getUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Pricing — TubePulse",
  description:
    "Plans priced per channel scrape. Start free, move up only when it stops being enough.",
};

/**
 * The public pricing page.
 *
 * Shares the landing page's client islands, minus the Preloader — the intro
 * curtain belongs to the front door only. Someone arriving here from the nav
 * has already seen it, and replaying it on every route would be theatre.
 *
 * Payments ARE wired — see the note at the top of
 * `components/landing/pricing.tsx`. This page reads the visitor's subscription
 * so the Pro card can say "Your plan" rather than trying to sell it to someone
 * who already bought it. Which means it must never be cached.
 */
export const dynamic = "force-dynamic";

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  // Set when someone clicked Go Pro while signed out: they are returned to the
  // card they actually chose, at the price they actually saw.
  const { cycle } = await searchParams;
  const user = isSupabaseConfigured ? await getUser() : null;
  const billing = user ? await getBillingState() : null;

  return (
    <>
      <SmoothScroll />
      <ScrollChoreography />
      <LiquidCursor />
      <Pricing
        signedIn={Boolean(user)}
        currentPlan={billing?.subscribedTier ?? null}
        // Both halves must be present: the browser needs the key id to open
        // checkout, the server needs the secret and plan id to create the
        // subscription. Either missing means the button should not pretend.
        canCheckout={isCheckoutConfigured && isBillingConfigured()}
        // Hides the monthly/yearly toggle entirely when the annual Razorpay
        // plan is not set up. A switch that produces an error is worse than no
        // switch at all.
        canYearly={isYearlyConfigured()}
        initialCycle={toBillingCycle(cycle ?? "monthly") ?? "monthly"}
      />
    </>
  );
}
