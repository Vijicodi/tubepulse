import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Contact us — TubePulse",
  description: "How to reach the people who run TubePulse.",
};

export default function ContactPage() {
  return (
    <LegalPage
      title="Contact us"
      intro={`Questions about your account, a payment or a refund: write to us and a person replies within ${LEGAL.replyWithin}.`}
    >
      <dl>
        <dt>Business</dt>
        <dd>
          {LEGAL.brand}, operated by {LEGAL.legalName}
        </dd>
        <dt>Email</dt>
        <dd>
          <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
        </dd>
        {LEGAL.phone && (
          <>
            <dt>Phone</dt>
            <dd>{LEGAL.phone}</dd>
          </>
        )}
        {LEGAL.address && (
          <>
            <dt>Address</dt>
            <dd>{LEGAL.address}</dd>
          </>
        )}
        <dt>Hours</dt>
        <dd>Monday to Saturday, 10am to 6pm IST</dd>
      </dl>

      <h2>Payments and billing</h2>
      <p>
        For a charge you don&rsquo;t recognise, a payment taken twice, or a plan that
        did not switch on after paying, email us with the email address on your
        account and, if you have it, the Razorpay payment ID from your receipt. You
        can also cancel, and see what you are on, from the Billing page inside the
        app. The <Link href="/refunds">cancellation and refunds policy</Link> explains
        what happens to your money.
      </p>
    </LegalPage>
  );
}
