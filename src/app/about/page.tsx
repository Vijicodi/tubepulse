import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL } from "@/lib/legal";
import { PLANS } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "About us — TubePulse",
  description: "What TubePulse is, who runs it, and how it works.",
};

export default function AboutPage() {
  return (
    <LegalPage
      title="About us"
      intro="TubePulse is competitor research for YouTube and Instagram creators. It finds the videos that beat their own channel's average and turns them into ideas you can check."
    >
      <h2>What we do</h2>
      <p>
        Paste a competitor&rsquo;s YouTube channel or Instagram profile. TubePulse
        reads their public videos and posts, scores each one against that
        account&rsquo;s own median, and shows you the breakouts. From those breakouts
        it proposes video ideas, each one citing the videos it came from, so you can
        see the reasoning instead of trusting it.
      </p>
      <p>
        It also pulls transcripts of public videos, shows when and how long the
        winning videos are, keeps a shortlist of saved ideas, and lets you plan them
        onto a calendar.
      </p>

      <h2>Who it is for</h2>
      <p>
        Creators, small studios and agencies who want to decide what to make next
        from evidence rather than guesswork.
      </p>

      <h2>How it is sold</h2>
      <p>
        {PLANS.free.name} is free with {PLANS.free.runs} research runs a month. Paid
        plans are monthly or yearly subscriptions billed in Indian rupees through
        Razorpay. Every price and limit is on the <Link href="/pricing">pricing page</Link>.
      </p>

      <h2>Who runs TubePulse</h2>
      <p>
        {LEGAL.brand} ({LEGAL.site}) is owned and operated by <strong>{LEGAL.legalName}</strong>.
        You can reach us at <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>; see the{" "}
        <Link href="/contact">contact page</Link> for everything else.
      </p>
    </LegalPage>
  );
}
