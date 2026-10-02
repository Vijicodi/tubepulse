import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy policy — TubePulse",
  description: "What TubePulse collects, why, who processes it, and how to delete it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro={`${LEGAL.brand} collects what it needs to run your account and your research, and nothing to sell. This page says exactly what that is.`}
    >
      <h2>Who is responsible</h2>
      <p>
        {LEGAL.brand} is operated by {LEGAL.legalName}, who is responsible for your
        personal data. Contact: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your email address, and your name and
          profile picture if you sign in with Google. Passwords are handled by our
          authentication provider and never stored in readable form.
        </li>
        <li>
          <strong>What you research:</strong> the channels and profiles you add, the
          projects you create, ideas you save and dates you plan. The videos and posts
          we read are public information published by those accounts.
        </li>
        <li>
          <strong>Payments:</strong> your plan, its status and Razorpay&rsquo;s
          subscription ID. Card, UPI and bank details are entered on Razorpay&rsquo;s
          own window and <strong>never reach us</strong>.
        </li>
        <li>
          <strong>Voice input</strong> (paid plans, only when you press the
          microphone): the recording is sent for transcription and not kept.
        </li>
        <li>
          <strong>Usage records:</strong> which runs you started and when, so we can
          count your plan&rsquo;s allowance and show your run history.
        </li>
      </ul>
      <p>
        We use no advertising or analytics trackers. The only cookies are the ones
        that keep you signed in.
      </p>

      <h2>Who processes it for us</h2>
      <p>We use these services to run TubePulse, each only for the job listed:</p>
      <ul>
        <li>Supabase: account sign-in and database storage.</li>
        <li>Google: sign-in, if you choose &ldquo;Continue with Google&rdquo;.</li>
        <li>Razorpay: payments and autopay mandates.</li>
        <li>Apify and Firecrawl: reading public YouTube and Instagram pages.</li>
        <li>OpenAI: generating ideas and summaries, and transcribing voice input.</li>
        <li>Vercel: hosting the website.</li>
        <li>An email delivery provider: sending sign-in codes.</li>
      </ul>
      <p>
        Some of these process data outside India. We do not sell or rent your
        personal data to anyone.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your account and research for as long as your account exists.
        Payment records are kept as long as Indian tax and accounting law requires.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask us for a copy of your data, to correct it, or to delete your
        account and everything in it. Email{" "}
        <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> from your account&rsquo;s
        email address and we will act within 30 days. TubePulse is not meant for
        anyone under 18.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes, the date at the top changes too. For a significant
        change we will email account holders before it takes effect.
      </p>
    </LegalPage>
  );
}
