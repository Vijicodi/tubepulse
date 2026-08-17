import { ArrowUpRight, Infinity as InfinityIcon } from "lucide-react";
import { BrandWordmark } from "@/components/brand/logo";
import { ProPlans } from "@/components/billing/pro-plans";
import { RefillCards } from "@/components/billing/refill-cards";
import { MagneticButton } from "@/components/landing/magnetic-button";
import { OrbitField } from "@/components/landing/orbit-field";
import { SiteNav } from "@/components/landing/site-nav";
import { TiltCard } from "@/components/landing/tilt-card";
import {
  type BillingCycle,
  PLANS,
  PRO_PRICES,
  TOPUP_LIST,
  formatRupees,
  perScrapeRupees,
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

const PRO = PLANS.pro;
const FREE = PLANS.free;

/** Sign up, then come back here rather than dumping them in the workspace. */
const SIGNUP_HREF = "/login?mode=signup&next=/pricing";

// The plan cards themselves live in <ProPlans>, which is a client component
// because the monthly/yearly switch changes the price in place. Everything on
// this page outside that block stays server-rendered.

const FAQS = [
  {
    q: "What exactly is one scrape?",
    a: `One full pull of a channel's catalogue — up to ${PRO.videosPerScrape} videos on Pro, scored, with ideas generated on top. Re-running the same channel next month to catch new uploads counts again, because it is genuinely another pull.`,
  },
  {
    q: `Why ${PRO.scrapes} and not fifty?`,
    a: "Because every scrape spends real money at Apify and OpenAI, and a number we cannot afford is a number we would quietly claw back later through worse results. Fifteen deliberate channel reads a month is more competitor research than most people do in a year.",
  },
  {
    q: "Why is there a daily cap on a paid plan?",
    a: `The same reason your AI subscription has one. Pro allows ${PRO.dailyCap} scrapes a day inside the monthly ${PRO.scrapes}, so one enthusiastic afternoon cannot drain the month. It applies to the plan's scrapes only — a refill you have bought outright is yours to spend the same day. The cap is on this page rather than in an email you get afterwards.`,
  },
  {
    q: "Is yearly actually cheaper?",
    a: `Yes, by ${yearlySavingPercent()}% — ${formatRupees(PRO_PRICES.yearly.priceRupees)} for the year against ${formatRupees(PRO_PRICES.monthly.priceRupees * 12)} paid monthly. Twelve months for the price of ten. The page shows both the per-month figure and the amount that actually leaves your account, because quoting only the first is how people get surprised at checkout.`,
  },
  {
    q: "How do I pay?",
    a: "Razorpay — UPI Autopay, cards, netbanking or wallets. It renews itself each month until you stop it. Prices are in rupees and settle to an Indian account, which is the entire reason this is not Stripe.",
  },
  {
    q: "Do unused scrapes roll over?",
    a: `No, and pretending otherwise would be the kind of small print this page is trying to avoid. The monthly allowance resets on your billing date. Refill packs are different — you bought those outright, so they never expire.`,
  },
  {
    q: "Why are refills more expensive per scrape?",
    a: `Because the subscription should always be the better deal. Pro works out at ${formatRupees(Math.round(perScrapeRupees(PRO)))} a scrape and a refill at about ${formatRupees(Math.round(perScrapeRupees(TOPUP_LIST[0])))}. If a refill were cheaper we would just be teaching you to cancel the plan and buy packs instead, which helps nobody.`,
  },
  {
    q: "Can I cancel?",
    a: "Any time, from the billing page, in two clicks. That also switches off the autopay mandate at Razorpay, so nothing further can be charged — you are never asked to cancel the same thing twice. You keep Pro until the period you already paid for runs out, then your projects and saved ideas stay readable on the free tier.",
  },
];

export function Pricing({
  signedIn = false,
  isPro = false,
  canCheckout = false,
  canYearly = false,
  initialCycle = "monthly",
}: {
  signedIn?: boolean;
  isPro?: boolean;
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
            {spellOutCapitalised(FREE.scrapes)} free scrapes.
            <br />
            <span className="display-accent text-accent-gradient">
              Then a very reasonable conversation.
            </span>
          </h1>
          <div className="rule-brand mx-auto mt-11 w-40" aria-hidden />
          <p className="text-muted-foreground mx-auto mt-9 max-w-xl text-lg leading-relaxed">
            Plans count scrapes, not seats, because a scrape is the thing that
            actually costs money to run. Monthly or yearly, one upgrade, and a
            cancel button that works on the first click.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------- plans */}
      <section className="px-6 pb-24">
        <ProPlans
          signedIn={signedIn}
          isPro={isPro}
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

      {/* ----------------------------------------------------------- refills */}
      <section className="border-border/40 border-t px-6 py-24">
        <div className="mx-auto max-w-4xl">
          <div data-reveal="up" data-stagger className="mb-10 text-center">
            <p className="label-mono mb-5">Ran out early</p>
            <h2 className="font-display text-[clamp(2rem,4vw,3.2rem)]">
              Refills, for the weeks
              <span className="display-accent"> you get obsessive.</span>
            </h2>
          </div>

          <div data-reveal="up" data-stagger>
            <RefillCards
              signedIn={signedIn}
              canCheckout={canCheckout}
              tone="landing"
            />
          </div>

          <p
            className="text-muted-foreground/70 mx-auto mt-8 max-w-xl text-center text-xs leading-relaxed"
            data-reveal="up"
          >
            Deliberately a little dearer per scrape than the plan
            ({formatRupees(Math.round(perScrapeRupees(PRO)))} on Pro). The
            subscription should always be the better deal, otherwise we would be
            teaching you to cancel it. Packs never expire.
          </p>
        </div>
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
              Pro allows {PRO.dailyCap} scrapes a day inside the monthly{" "}
              {PRO.scrapes}. Not because we enjoy limits, but because every
              scrape spends real money at Apify and OpenAI, and one determined
              afternoon can drain a month.
            </p>
            <p className="text-muted-foreground mt-4 leading-relaxed">
              It applies to the plan only. A refill you have bought is yours to
              use the same day — selling you scrapes and then asking you to come
              back tomorrow would be a strange way to take money.
            </p>
            <p className="text-muted-foreground mt-5 leading-relaxed">
              Your AI subscription works the same way. The difference is that
              this page tells you the number before you pay rather than after.
            </p>
          </div>

          <div data-reveal="right" className="group/tilt">
            <TiltCard className="p-9">
              <p className="label-mono mb-8">What Pro actually gets you</p>
              <dl className="space-y-6">
                {[
                  { k: "Scrapes a month", v: String(PRO.scrapes) },
                  { k: "Scrapes a day", v: String(PRO.dailyCap) },
                  { k: "Videos per scrape", v: String(PRO.videosPerScrape) },
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
            {spellOutCapitalised(FREE.scrapes)} scrapes is plenty
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
            The free tier needs no card. Pro renews at{" "}
            {formatRupees(PRO.priceRupees)} a month and can be cancelled from the
            billing page at any time, which also stops the mandate at Razorpay.
          </p>
        </div>
      </section>

      <footer className="border-border/40 border-t px-6 py-14">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-8 sm:flex-row">
          <BrandWordmark className="max-h-8 w-auto" />
          <p className="text-muted-foreground text-xs">
            Prices in Indian rupees, inclusive of applicable taxes. Payments and
            autopay handled by Razorpay.
          </p>
        </div>
      </footer>
    </div>
  );
}
