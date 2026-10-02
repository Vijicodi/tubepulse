import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Shipping & delivery — TubePulse",
  description: "How a TubePulse plan is delivered after payment.",
};

export default function ShippingPage() {
  return (
    <LegalPage
      title="Shipping & delivery"
      intro="TubePulse is online software. Nothing is shipped; your plan is delivered to your account the moment payment is confirmed."
    >
      <h2>No physical goods</h2>
      <p>
        We sell subscriptions to a web application at {LEGAL.site}. No physical
        product is sold or shipped, so there are no shipping charges and no delivery
        address is needed.
      </p>

      <h2>When you get access</h2>
      <ul>
        <li>
          Your paid plan switches on <strong>immediately</strong> after Razorpay
          confirms the payment, usually within a few seconds. The Billing page shows
          the plan and its renewal date.
        </li>
        <li>
          If your plan has not switched on within <strong>15 minutes</strong> of a
          successful payment, press <strong>Refresh</strong> on the Billing page. If it
          still shows the free plan, email{" "}
          <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> with your Razorpay
          payment ID and we will fix it, or refund you under our{" "}
          <Link href="/refunds">refunds policy</Link>.
        </li>
        <li>
          Research results are delivered inside the app, usually within 2 to 6
          minutes of starting a run.
        </li>
      </ul>
    </LegalPage>
  );
}
