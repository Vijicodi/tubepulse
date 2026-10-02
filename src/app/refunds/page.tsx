import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Cancellation & refunds — TubePulse",
  description: "How to cancel a TubePulse subscription and when money is refunded.",
};

export default function RefundsPage() {
  return (
    <LegalPage
      title="Cancellation & refunds"
      intro="Cancel any time from the Billing page in two clicks. You keep what you paid for until the end of that period, and nothing is charged after it."
    >
      <h2>Cancelling</h2>
      <ul>
        <li>
          Open <strong>Billing</strong> inside the app and choose <strong>Cancel
          subscription</strong>. This also stops the autopay mandate at Razorpay, so no
          further charge can be attempted. You never need to cancel twice.
        </li>
        <li>
          Your paid plan stays active until the end of the period you already paid
          for, monthly or yearly. After that your account moves to the free plan.
          Your projects and saved ideas stay readable.
        </li>
        <li>
          If you can&rsquo;t reach the Billing page, email{" "}
          <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> from your account&rsquo;s
          email address and we will cancel it for you.
        </li>
      </ul>

      <h2>Refunds</h2>
      <p>
        Subscription fees are <strong>not refunded</strong> once a billing period has
        started, including for unused research runs or a partly used month or year.
        Cancelling stops the next charge; it does not refund the current one.
      </p>
      <p>We refund in full when the mistake is ours or the payment system&rsquo;s:</p>
      <ul>
        <li>you were charged twice for the same period;</li>
        <li>money left your account but the payment failed, or your plan never switched on;</li>
        <li>you were charged after you had already cancelled.</li>
      </ul>
      <p>
        Email <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> within 30 days of
        the charge with your account email and the Razorpay payment ID. Approved
        refunds go back to the original payment method within{" "}
        <strong>5&ndash;7 working days</strong>; your bank may take a few more days to
        show it.
      </p>

      <h2>Changing plans</h2>
      <p>
        Razorpay fixes the amount of an autopay mandate, so moving to another plan
        means cancelling the current one and starting the new one. You keep the
        current plan until its paid period ends. See{" "}
        <Link href="/pricing">pricing</Link> for every plan.
      </p>
    </LegalPage>
  );
}
