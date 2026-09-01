import { ArrowUpRight, Infinity as InfinityIcon } from "lucide-react";
import { BrandWordmark } from "@/components/brand/logo";
import { ProPlans } from "@/components/billing/pro-plans";
import { MagneticButton } from "@/components/landing/magnetic-button";
import { OrbitField } from "@/components/landing/orbit-field";
import { SiteNav } from "@/components/landing/site-nav";
import { TiltCard } from "@/components/landing/tilt-card";
import {
  type BillingCycle,
  type PaidPlanKey,
  HIGHLIGHTED_PLAN,
  PLANS,
  PLAN_PRICES,
  formatUsd,
  spellOutCapitalised,
  yearlySavingPercent,
} from "@/lib/billing/plans";

/**
 * The pricing page.
 *
 * PAYMENTS ARE LIVE. "Go Pro" opens Razorpay and sets up a real monthly autopay
 * mandate. Quota enforcement is NOT built yet — the app still counts no scrapes
 * — so today a subscriber pays for a promise the code does not police. That is
 * the next piece of work, and it is deliberately separate: mixing "may they
 * pay" with "have they run out" would make both harder to verify.
 *
 * EVERY NUMBER ON THIS PAGE COMES FROM `lib/billing/plans.ts`. Nothing here is
 * typed as a literal, because the previous version of this file promised 30
 * scrapes for ₹399 while the intended plan was 15 for ₹499 — and a marketing
 * page that contradicts the charge is not a copy problem, it is a refund. The
 * economics behind the numbers are written up in that same file.
 *
 * REFILL PACKS are a SEPARATE Razorpay product — one-off Orders, no mandate —
 * with their own route, their own webhook event and their own ledger table.
 * They are priced ABOVE the Pro per-scrape rate on purpose, and the page shows
 * that arithmetic rather than asserting it: a refill that undercuts the plan
 * teaches people to cancel the plan.
 *
 * WHAT IS WIRED
 *   POST /api/billing/checkout     creates the subscription
 *   POST /api/webhooks/razorpay    signature-checked, decides who is Pro
 *   POST /api/billing/sync         polling fallback, same as the Apify job
 *   POST /api/billing/cancel       cancels the mandate at Razorpay first
 *   POST /api/billing/topup        creates a one-off order for a refill pack
 *   POST /api/billing/topup/confirm  verifies it, then grants the credits
 *   /billing                       the signed-in management screen
 */

const PRO = PLANS[HIGHLIGHTED_PLAN];
const FREE = PLANS.free;

/** Sign up, then come back here rather than dumping them in the workspace. */
const SIGNUP_HREF = "/login?mode=signup&next=/pricing";

// The plan cards themselves live in <ProPlans>, which is a client component
// because the monthly/yearly switch changes the price in place. Everything on
// this page outside that block stays server-rendered.

const FAQS = [
  {
    q: "What exactly is one run?",
    a: `One billable action: a full pull of a channel's catalogue — up to ${PRO.videosPerRun} videos on ${PRO.name}, scored — or a generation of ideas from a channel already pulled, or a transcript. All three cost real money to run, so all three count. Re-running the same channel next month counts again, because it is genuinely another pull.`,
  },
  {
    q: `Why ${PRO.runs} runs and not five hundred?`,
    a: `Because every run spends real money at Apify and OpenAI, and a number we cannot afford is a number we would quietly claw back later through worse results. The allowances are sized to what each kind of creator actually gets through in a month — ${PLANS.creator.runs} for one channel, ${PLANS.studio.runs} for a few, ${PLANS.agency.runs} for tracking a whole field at once.`,
  },
  {
    q: "Why is there a daily cap on a paid plan?",
    a: `The same reason your AI subscription has one. ${PRO.name} allows ${PRO.dailyCap} runs a day inside the monthly ${PRO.runs}, so one enthusiastic afternoon cannot drain the month. Every tier has a cap sized to its own allowance. It is on this page rather than in an email you get afterwards.`,
  },
  {
    q: "Is yearly actually cheaper?",
    a: `Yes, by ${yearlySavingPercent()}% — ${formatUsd(PLAN_PRICES[HIGHLIGHTED_PLAN].yearly.priceUsd)} for the year against ${formatUsd(PLAN_PRICES[HIGHLIGHTED_PLAN].monthly.priceUsd * 12)} paid monthly. Twelve months for the price of ten. The page shows both the per-month figure and the amount that actually leaves your account, because quoting only the first is how people get surprised at checkout.`,
  },
  {
    q: "What is the difference between the models?",
    a: `${PLANS.creator.name} runs a fast model built for volume — quick, cheap, and good at finding patterns. ${PLANS.studio.name} and ${PLANS.agency.name} run an advanced reasoning model that is noticeably better on ambiguous niches, where the right angle is not obvious from the titles alone. It is stated here rather than discovered later.`,
  },
  {
    q: "Why is Instagram only on the higher tiers?",
    a: `Because Instagram data costs four to six times what YouTube data costs, per item. Putting it on every tier would mean cutting everyone's allowance to pay for it. It sits on ${PLANS.studio.name} and ${PLANS.agency.name}, where the price covers it honestly.`,
  },
  {
    q: "How do I pay?",
    a: "Razorpay — cards, UPI Autopay, netbanking or wallets. It renews itself until you stop it. Card details are entered in Razorpay's own window and never reach us.",
  },
  {
    q: "Do unused runs roll over?",
    a: "No, and pretending otherwise would be the kind of small print this page is trying to avoid. The monthly allowance resets on your billing date.",
  },
  {
    q: "Can I change plans later?",
    a: `Yes, in both directions, from the billing page. Moving up takes effect when the new plan starts; moving down leaves you on what you paid for until that period ends. Nothing is lost either way — your projects and saved ideas are yours regardless of tier.`,
  },
  {
    q: "Can I cancel?",
    a: `Any time, from the billing page, in two clicks. That also switches off the autopay mandate at Razorpay, so nothing further can be charged — you are never asked to cancel the same thing twice. You keep your plan until the period you already paid for runs out, then your projects and saved ideas stay readable on ${FREE.name}.`,
  },
];

export function Pricing({
  signedIn = false,
  currentPlan = null,
  canCheckout = false,
  canYearly = false,
  initialCycle = "monthly",
}: {
  signedIn?: boolean;
  /** The tier they are already on, so its card says so instead of selling it. */
  currentPlan?: PaidPlanKey | null;
  /** False when Razorpay keys are missing, so the CTA points elsewhere. */
  canCheckout?: boolean;
  /** False when the yearly Razorpay plan is not configured; hides the toggle. */
  canYearly?: boolean;
  /** Preselected cycle, from ?cycle= after a signed-out Go Pro round trip. */
  initialCycle?: BillingCycle;
}) {
  return (
    <div className="tp-landing tp-no-js bg-background text-foreground relative">
      <div className="grain" aria-hidden />
      <SiteNav signedIn={signedIn} current="pricing" />

      {/* -------------------------------------------------------------- head */}
      <section className="relative overflow-hidden px-6 pt-44 pb-24">
        <OrbitField />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(110% 70% at 50% 30%, transparent 20%, color-mix(in oklab, var(--background) 92%, transparent) 100%)",
          }}
        />

        <div
          className="relative mx-auto max-w-3xl text-center"
          data-reveal="up"
          data-stagger
        >
          <p className="label-mono mb-8">Pricing</p>
          <h1 className="font-display text-[clamp(2.8rem,7vw,6rem)]">
            {spellOutCapitalised(FREE.runs)} free runs a month.
            <br />
            <span className="display-accent text-accent-gradient">
              Then a very reasonable conversation.
            </span>
          </h1>
          <div className="rule-brand mx-auto mt-11 w-40" aria-hidden />
          <p className="text-muted-foreground mx-auto mt-9 max-w-xl text-lg leading-relaxed">
            Plans count research runs, because a run is the thing that actually
            costs money. Monthly or yearly, one upgrade, and a cancel button
            that works on the first click.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------- plans */}
      <section className="px-6 pb-24">
        <ProPlans
          signedIn={signedIn}
          currentPlan={currentPlan}
          canCheckout={canCheckout}
          canYearly={canYearly}
          initialCycle={initialCycle}
        />

        <p
          className="text-muted-foreground/70 mx-auto mt-10 max-w-xl text-center text-xs leading-relaxed"
          data-reveal="up"
        >
          Charged automatically by Razorpay until you stop it. UPI Autopay,
          cards, netbanking and wallets. Card details are entered in
          Razorpay&rsquo;s own window and never reach us.
        </p>
      </section>

      {/* --------------------------------------------------------- fair use */}
      <section className="border-border/40 border-t px-6 py-28">
        <div className="mx-auto grid max-w-5xl items-center gap-14 lg:grid-cols-[1fr_1fr]">
          <div data-reveal="left" data-stagger>
            <p className="label-mono mb-6">Fair use, said out loud</p>
            <h2 className="font-display text-[clamp(2rem,4vw,3.2rem)]">
              There is a daily cap,
              <span className="display-accent"> and we are not hiding it.</span>
            </h2>
            <p className="text-muted-foreground mt-8 leading-relaxed">
              {PRO.name} allows {PRO.dailyCap} runs a day inside the monthly{" "}
              {PRO.runs}. Not because we enjoy limits, but because every
              run spends real money at Apify and OpenAI, and one determined
              afternoon can drain a month.
            </p>
            <p className="text-muted-foreground mt-4 leading-relaxed">
              Every tier has one, sized to its allowance, so a month cannot be
              drained in a couple of afternoons.
            </p>
            <p className="text-muted-foreground mt-5 leading-relaxed">
              Your AI subscription works the same way. The difference is that
              this page tells you the number before you pay rather than after.
            </p>
          </div>

          <div data-reveal="right" className="group/tilt">
            <TiltCard className="p-9">
              <p className="label-mono mb-8">What {PRO.name} gets you</p>
              <dl className="space-y-6">
                {[
                  { k: "Runs a month", v: String(PRO.runs) },
                  { k: "Runs a day", v: String(PRO.dailyCap) },
                  { k: "Videos per run", v: String(PRO.videosPerRun) },
                  { k: "Instagram posts per run", v: String(PRO.postsPerRun) },
                  { k: "Ideas per generation", v: "up to 8" },
                ].map((row) => (
                  <div
                    key={row.k}
                    className="border-border/50 flex items-baseline justify-between border-b pb-5 last:border-0 last:pb-0"
                  >
                    <dt className="text-muted-foreground text-sm">{row.k}</dt>
                    <dd className="font-display text-3xl">{row.v}</dd>
                  </div>
                ))}
              </dl>
              <div className="text-muted-foreground mt-8 flex items-center gap-3 text-xs">
                <InfinityIcon className="size-4 shrink-0" aria-hidden />
                Reading, sorting and re-reading what you already scraped is
                unlimited. You only pay to fetch, never to look.
              </div>
            </TiltCard>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- faq */}
      <section className="border-border/40 border-t px-6 py-32">
        <div className="mx-auto max-w-4xl">
          <div data-reveal="up" data-stagger className="mb-16">
            <p className="label-mono mb-6">Before you ask</p>
            <h2 className="font-display text-[clamp(2.2rem,4.4vw,3.6rem)]">
              The awkward
              <span className="display-accent"> questions.</span>
            </h2>
          </div>

          <div className="grid gap-x-14 gap-y-12 sm:grid-cols-2">
            {FAQS.map((faq) => (
              <div key={faq.q} data-reveal="up" data-stagger>
                <h3 className="font-display mb-4 text-2xl">{faq.q}</h3>
                <p className="text-muted-foreground leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- cta */}
      <section className="relative overflow-hidden px-6 py-40">
        <div
          aria-hidden
          className="animate-drift pointer-events-none absolute top-1/2 left-1/2 h-[32vh] w-[58vw] -translate-x-1/2 -translate-y-1/2 rounded-[50%] opacity-[0.16] blur-[110px]"
          style={{ background: "var(--brand-gradient)" }}
        />
        <div
          className="relative mx-auto max-w-3xl text-center"
          data-reveal="clip"
          data-stagger
        >
          <h2 className="font-display text-[clamp(2.4rem,6vw,5rem)]">
            {spellOutCapitalised(FREE.runs)} runs a month is plenty
            <br />
            <span className="display-accent text-accent-gradient">
              to catch us bluffing.
            </span>
          </h2>
          <div className="mt-12 flex justify-center">
            <MagneticButton href={signedIn ? "/projects" : SIGNUP_HREF}>
              {signedIn ? "Open your workspace" : "Start free"}
              <ArrowUpRight className="ml-2 inline size-4" aria-hidden />
            </MagneticButton>
          </div>
          <p className="text-muted-foreground/70 mx-auto mt-10 max-w-lg text-xs leading-relaxed">
            The free tier needs no card. {PRO.name} renews at{" "}
            {formatUsd(PRO.priceUsd)} a month and can be cancelled from the
            billing page at any time, which also stops the mandate at Razorpay.
          </p>
        </div>
      </section>

      <footer className="border-border/40 border-t px-6 py-14">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-8 sm:flex-row">
          <BrandWordmark className="max-h-8 w-auto" />
          <p className="text-muted-foreground text-xs">
            Prices in US dollars, inclusive of applicable taxes. Payments and
            autopay handled by Razorpay.
          </p>
        </div>
      </footer>
    </div>
  );
}
