import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms & conditions — TubePulse",
  description: "The terms for using TubePulse and paying for a plan.",
};

export default function TermsPage() {
  const courts = LEGAL.jurisdiction ? `the courts at ${LEGAL.jurisdiction}` : "the courts in India";

  return (
    <LegalPage
      title="Terms & conditions"
      intro={`These terms are an agreement between you and ${LEGAL.legalName}, who operates ${LEGAL.brand} at ${LEGAL.site}. By creating an account or paying for a plan, you accept them.`}
    >
      <h2>The service</h2>
      <p>
        {LEGAL.brand} reads public YouTube and Instagram data for the accounts you
        choose, scores how their videos and posts performed, and generates ideas and
        summaries with AI. What each plan includes is listed on the{" "}
        <Link href="/pricing">pricing page</Link>.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be 18 or older and give a real email address.</li>
        <li>Keep your login to yourself; you are responsible for what happens under it.</li>
        <li>One person per account. Ask us about team use.</li>
      </ul>

      <h2>Plans, payment and renewal</h2>
      <ul>
        <li>
          Paid plans are subscriptions billed monthly or yearly in Indian rupees,
          inclusive of applicable taxes, through Razorpay.
        </li>
        <li>
          When you subscribe you authorise an autopay mandate. It renews
          automatically at the price shown until you cancel.
        </li>
        <li>
          Each plan includes a number of research runs a month and a daily limit.
          Unused runs do not roll over.
        </li>
        <li>
          We may change prices for future periods. We will tell you by email before a
          change affects your renewal, and you can cancel before it does.
        </li>
        <li>
          Cancellation and refunds are covered by our{" "}
          <Link href="/refunds">cancellation and refunds policy</Link>.
        </li>
      </ul>

      <h2>Fair use</h2>
      <ul>
        <li>Use TubePulse only to research public content. Don&rsquo;t try to read private accounts.</li>
        <li>Follow YouTube&rsquo;s and Instagram&rsquo;s own terms when you use what you find.</li>
        <li>Don&rsquo;t resell access, share accounts, or try to get around plan limits or security.</li>
      </ul>
      <p>We may suspend an account that breaks these rules, after telling you why where we can.</p>

      <h2>AI output and data</h2>
      <p>
        Ideas, scores and summaries are generated from public data and AI models. They
        can be wrong or incomplete; check them before relying on them. Each idea
        cites its source videos so you can. The ideas you generate are yours to use.
      </p>

      <h2>Our liability</h2>
      <p>
        We work to keep {LEGAL.brand} available and accurate, but it is provided as
        it is. To the extent the law allows, our total liability to you for any claim
        is limited to the amount you paid us in the three months before it. We are not
        liable for lost profits or indirect losses.
      </p>

      <h2>Ending the agreement</h2>
      <p>
        You can stop using {LEGAL.brand} and cancel at any time. We can close the
        service or an account with notice, and will refund any unused paid period if
        we close the service itself.
      </p>

      <h2>Law and disputes</h2>
      <p>
        These terms are governed by the laws of India. Disputes go to {courts}. Before
        that, email <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>; most problems
        are fixed faster that way.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        If we change these terms, the date at the top changes. For a significant
        change we will email account holders before it takes effect.
      </p>
    </LegalPage>
  );
}
