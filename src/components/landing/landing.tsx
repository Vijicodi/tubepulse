import Link from "next/link";
import {
  ArrowUpRight,
  Crosshair,
  FileSearch,
  Gauge,
  Quote,
  Radar,
  Ruler,
  Scale,
  Sparkles,
  Workflow,
} from "lucide-react";
import { BrandWordmark } from "@/components/brand/logo";
import { MagneticButton } from "@/components/landing/magnetic-button";
import { OrbitField } from "@/components/landing/orbit-field";
import { PulseField } from "@/components/landing/pulse-field";
import { SiteNav } from "@/components/landing/site-nav";
import { TiltCard } from "@/components/landing/tilt-card";
import { PLANS, spellOutCapitalised } from "@/lib/billing/plans";

/**
 * The landing page.
 *
 * A server component. Everything animated is a small client island mounted by
 * page.tsx — the markup, copy and structure here ship as HTML, so the page has
 * real content before a single byte of JavaScript arrives.
 *
 * Animation is opted into with data attributes read by ScrollChoreography.
 * Section markup stays readable; the timing language lives in one file.
 *
 * TWO DESIGN RULES, both learned by getting them wrong first:
 *
 * 1. Colour is an accent, never a field. The brand gradient goes on hairlines,
 *    small marks and at most one phrase per section. A large soft purple wash
 *    with a gradient on every heading is the house style of generated pages.
 * 2. The display face is an editorial serif and emphasis is its italic. Huge
 *    tight bold sans is the other half of that same house style.
 *
 * Every claim here is checked against docs/product.md. No invented adoption
 * numbers. The product argues evidence over vibes; the marketing page does not
 * get an exemption.
 */

const STEPS = [
  {
    icon: Radar,
    label: "01 / Collect",
    title: "Paste a channel. Walk away.",
    body: "Two to six minutes, running in the background. You get a live status card in under a second, then you are free to go and do literally anything else.",
  },
  {
    icon: Crosshair,
    label: "02 / Compare",
    title: "Score every video against its own channel.",
    body: "Not a global benchmark, and definitely not the mean — one runaway video hauls a mean up high enough to hide every other outlier behind it. The median does not flinch.",
  },
  {
    icon: Sparkles,
    label: "03 / Commit",
    title: "Up to eight ideas, each showing its working.",
    body: "Each one cites the videos it came from and wears the confidence the model actually reported. Especially the embarrassing ones.",
  },
];

const STATS = [
  { value: 2, suffix: "–6 min", label: "For a full channel pull" },
  { value: 8, suffix: " ideas", label: "Each one with citations" },
  { value: 1, suffix: " project", label: "Everything hangs off it" },
];

const CAPABILITIES = [
  {
    icon: Scale,
    title: "Median scoring",
    body: "Every video measured against its own channel's midpoint, so a big number on a big channel stops flattering itself.",
  },
  {
    icon: FileSearch,
    title: "Web enrichment",
    body: "Context from beyond YouTube, so an idea turns up already knowing what the rest of the internet said about it.",
  },
  {
    icon: Gauge,
    title: "Honest confidence",
    body: "The model's own number, unrounded. A 41% stays a 41% rather than being quietly promoted to a recommendation.",
  },
  {
    icon: Workflow,
    title: "Nothing blocks",
    body: "Slow work goes to a queue. Close the tab, make tea, come back — the scrape got on with it.",
  },
  {
    icon: Ruler,
    title: "Scored against itself",
    body: "A million views means nothing without a baseline. Every video is measured against its own channel's median, so a big channel's flop cannot masquerade as a hit.",
  },
  {
    icon: Quote,
    title: "Receipts attached",
    body: "Each idea links the videos behind it, so you can argue with it properly instead of just vibing.",
  },
];

const NOT_THIS = [
  "Publishing, scheduling or uploading to YouTube",
  "Thumbnail generation or design tooling",
  "Teams, sharing or permissions beyond your own rows",
  "Analytics on your own channel — Studio already does that well",
];

const FAQS = [
  {
    q: "Do I need the competitor's permission?",
    a: "No. Everything used is public: the videos, the view counts, the upload dates. It is the same information anyone can read on the channel page, gathered and compared properly.",
  },
  {
    q: "Why the median and not the average?",
    a: "One breakout video pulls an average up far enough to hide every other outlier on the channel. The median sits in the middle regardless, so a video that beats it has genuinely beaten that channel's normal.",
  },
  {
    q: "How long does a channel take?",
    a: "Two to six minutes for a full pull, running in the background so you can close the tab. If a scrape returns 480 of 500 videos that is a success — the dropped ones are counted and logged, not silently ignored.",
  },
  {
    q: "What happens to my research?",
    a: "It stays in your own project. Row-level security is enabled on every table in the same migration that creates it, so the database itself refuses to hand your rows to anyone else.",
  },
];

export function Landing({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <div className="tp-landing tp-no-js bg-background text-foreground relative">
      <div className="grain" aria-hidden />

      <SiteNav signedIn={signedIn} current="overview" />

      {/* -------------------------------------------------------------- hero */}
      {/* pt-32 clears the fixed nav. Without it the eyebrow is vertically
          centred into the back of the nav pill on short viewports. */}
      <section className="relative flex min-h-[100svh] items-center justify-center overflow-hidden px-6 pt-32 pb-24">
        <PulseField />

        {/* Dim and small on purpose — it seats the headline, it is not the
            design. The mesh is the design. */}
        <div
          aria-hidden
          className="animate-drift pointer-events-none absolute top-1/2 left-1/2 -z-0 h-[34vh] w-[42vw] -translate-x-1/2 -translate-y-1/2 rounded-[50%] opacity-[0.16] blur-[100px]"
          style={{ background: "var(--brand-gradient)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-0"
          style={{
            background:
              "radial-gradient(120% 80% at 50% 50%, transparent 28%, color-mix(in oklab, var(--background) 90%, transparent) 100%)",
          }}
        />

        <div
          className="relative z-10 mx-auto max-w-5xl text-center"
          data-reveal="up"
          data-stagger
        >
          <p className="label-mono mb-8">Evidence-backed creator intelligence</p>

          <h1 className="font-display text-[clamp(3.2rem,10vw,9.5rem)]">
            Your competitors
            <br />
            already ran the{" "}
            <span className="display-accent text-accent-gradient">experiments.</span>
          </h1>

          <div className="rule-brand mx-auto mt-12 w-40" aria-hidden />

          <p className="text-muted-foreground mx-auto mt-10 max-w-xl text-lg leading-relaxed text-balance">
            Paste a channel. We pull their real numbers, find the videos that quietly
            beat their own median, and hand you ranked ideas with the receipts
            still stapled on.
          </p>

          <div className="mt-11 flex flex-wrap items-center justify-center gap-4">
            <MagneticButton href={signedIn ? "/projects" : "/login?mode=signup"}>
              {signedIn ? "Open your workspace" : "Research a channel"}
              <ArrowUpRight className="ml-2 inline size-4" aria-hidden />
            </MagneticButton>
            {!signedIn && (
              <MagneticButton href="/pricing" variant="glass">
                See pricing
              </MagneticButton>
            )}
          </div>
        </div>

        <div
          aria-hidden
          className="label-mono absolute inset-x-0 bottom-8 flex justify-center"
        >
          Scroll
        </div>
      </section>

      {/* ----------------------------------------------------------- marquee */}
      <section className="border-border/40 overflow-hidden border-y py-12">
        <div
          data-marquee="-24"
          className="font-display text-muted-foreground/20 flex w-max items-center gap-12 text-[10vw] whitespace-nowrap"
        >
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex items-center gap-12">
              Medians, not means
              <span aria-hidden className="text-accent-gradient">
                ✳
              </span>
            </span>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------- stats */}
      <section
        id="numbers"
        className="mx-auto grid max-w-6xl gap-14 px-6 py-32 sm:grid-cols-3"
      >
        {STATS.map((stat) => (
          <div key={stat.label} data-reveal="up" data-stagger>
            <div className="font-display flex items-baseline text-7xl sm:text-8xl">
              <span data-count={stat.value}>0</span>
              <span className="text-muted-foreground ml-1 text-2xl">{stat.suffix}</span>
            </div>
            <div className="rule-brand mt-6 w-16" aria-hidden />
            <p className="text-muted-foreground mt-5 text-sm">{stat.label}</p>
          </div>
        ))}
      </section>

      {/* ------------------------------------------------------ pinned steps */}
      <section
        id="how"
        data-pin
        className="relative flex min-h-[100svh] items-center overflow-hidden px-6"
      >
        <div className="mx-auto grid w-full max-w-6xl gap-16 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="label-mono mb-6">How it works</p>
            <h2 className="font-display text-[clamp(2.6rem,5.5vw,4.8rem)]">
              Three steps.
              <br />
              <span className="display-accent">No guesswork.</span>
            </h2>
            <div className="rule-brand mt-9 w-24" aria-hidden />
          </div>

          {/* Each step occupies the same cell and cross-fades on scroll while
              the section is pinned. */}
          <div className="relative min-h-[24rem]">
            {STEPS.map((step) => (
              <article
                key={step.label}
                data-pin-step
                className="absolute inset-0 flex flex-col justify-center"
              >
                <span className="bg-brand-gradient mb-7 grid size-14 place-items-center rounded-2xl text-white">
                  <step.icon className="size-6" aria-hidden />
                </span>
                <p className="label-mono mb-4">{step.label}</p>
                <h3 className="font-display mb-5 text-[clamp(2rem,3.6vw,3.2rem)]">
                  {step.title}
                </h3>
                <p className="text-muted-foreground max-w-lg text-lg leading-relaxed">
                  {step.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- feature: the idea */}
      <section
        id="why"
        className="mx-auto grid max-w-6xl items-center gap-16 px-6 py-32 lg:grid-cols-2"
      >
        <div data-reveal="left" data-stagger>
          <p className="label-mono mb-6">The non-obvious bit</p>
          <h2 className="font-display text-[clamp(2.4rem,5vw,4.2rem)]">
            A 500k-view video can be a{" "}
            <span className="display-accent text-accent-gradient">flop.</span>
          </h2>
          <div className="rule-brand mt-8 w-24" aria-hidden />
          <p className="text-muted-foreground mt-8 max-w-lg text-lg leading-relaxed">
            On a channel averaging two million, it is a disappointment. On one
            averaging twenty thousand, it is the best thing that ever happened to
            them. Absolute view counts tell you almost nothing.
          </p>
          <p className="text-muted-foreground mt-5 max-w-lg text-lg leading-relaxed">
            So every video is scored against its own channel&apos;s median. That
            one decision is most of the accuracy in this product.
          </p>
        </div>

        <div data-reveal="right" data-parallax="-40" className="group/tilt">
          <TiltCard className="p-10">
            <Quote className="text-muted-foreground/40 mb-7 size-9" aria-hidden />
            <blockquote className="font-display text-[clamp(1.8rem,2.6vw,2.6rem)] leading-tight">
              Absolute view counts are meaningless.
              <span className="display-accent"> Relative ones are the product.</span>
            </blockquote>
            <div className="rule-brand mt-9 w-full" aria-hidden />
            <figcaption className="label-mono mt-6">
              docs/product.md — the one non-obvious idea
            </figcaption>
          </TiltCard>
        </div>
      </section>

      {/* -------------------------------------------- the shape of a channel */}
      <section
        id="shape"
        className="relative flex min-h-[92svh] items-center overflow-hidden px-6 py-24"
      >
        <OrbitField />

        <div
          className="relative mx-auto max-w-2xl text-center"
          data-reveal="scale"
          data-stagger
        >
          <p className="label-mono mb-7">What a channel actually looks like</p>
          <h2 className="font-display text-[clamp(2.4rem,5.5vw,4.6rem)]">
            Most videos sit in the middle.
            <br />
            <span className="display-accent text-accent-gradient">
              The edges are the story.
            </span>
          </h2>
          <p className="text-muted-foreground mx-auto mt-9 max-w-lg text-lg leading-relaxed">
            Every point is a video, placed by how far it beat or missed the
            channel&apos;s median. The crowded middle is that channel on an
            ordinary Tuesday. The stragglers at the edge are why you are here.
          </p>
        </div>
      </section>

      {/* --------------------------------------------- feature: the receipts */}
      <section id="receipts" className="border-border/40 border-t">
        <div className="mx-auto grid max-w-6xl items-center gap-16 px-6 py-32 lg:grid-cols-2">
          <div
            data-reveal="scale"
            data-parallax="-25"
            className="group/tilt order-2 lg:order-1"
          >
            <TiltCard className="p-9">
              <p className="label-mono mb-7">Generated ideas</p>
              <div className="space-y-6">
                {[
                  { title: "Why nobody finishes your intro", confidence: 82 },
                  { title: "The 8-minute retention cliff, tested", confidence: 64 },
                  { title: "Rebuilding a thumbnail from the numbers", confidence: 41 },
                ].map((idea) => (
                  <div key={idea.title}>
                    <div className="flex items-baseline justify-between gap-6">
                      <span className="text-sm font-medium">{idea.title}</span>
                      <span className="label-mono shrink-0">{idea.confidence}%</span>
                    </div>
                    {/* The bar is the confidence drawn honestly — a 41% looks
                        like a 41%. */}
                    <div className="bg-muted/30 mt-3 h-1 overflow-hidden rounded-full">
                      <div
                        className="bg-brand-gradient h-full rounded-full"
                        style={{ width: `${idea.confidence}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </TiltCard>
            <p className="text-muted-foreground/70 mt-4 text-center text-xs">
              Illustrative. Real ideas cite the videos they came from.
            </p>
          </div>

          <div data-reveal="right" data-stagger className="order-1 lg:order-2">
            <p className="label-mono mb-6">Receipts included</p>
            <h2 className="font-display text-[clamp(2.4rem,5vw,4.2rem)]">
              Including the{" "}
              <span className="display-accent text-accent-gradient">
                unflattering ones.
              </span>
            </h2>
            <div className="rule-brand mt-8 w-24" aria-hidden />
            <p className="text-muted-foreground mt-8 max-w-lg text-lg leading-relaxed">
              Every idea carries the confidence the model actually reported. A 41%
              stays 41%. Rounding it up to something reassuring would make the
              number worthless, and you would stop trusting the 82% too.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ capabilities */}
      <section id="capabilities" className="border-border/40 border-t px-6 py-32">
        <div className="mx-auto max-w-6xl">
          <div data-reveal="up" data-stagger className="mb-20 max-w-2xl">
            <p className="label-mono mb-6">What is in the box</p>
            <h2 className="font-display text-[clamp(2.4rem,5vw,4.2rem)]">
              Six things it does
              <br />
              <span className="display-accent">properly.</span>
            </h2>
          </div>

          <div className="grid gap-x-12 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((item) => (
              <div key={item.title} data-reveal="up" data-stagger>
                <span className="border-border/70 text-foreground mb-6 grid size-12 place-items-center rounded-xl border">
                  <item.icon className="size-5" aria-hidden />
                </span>
                <h3 className="font-display mb-3 text-2xl">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- not this */}
      <section className="border-border/40 border-t px-6 py-32">
        <div className="mx-auto grid max-w-6xl gap-16 lg:grid-cols-[1fr_1.1fr]">
          <div data-reveal="left" data-stagger>
            <p className="label-mono mb-6">Deliberately out of scope</p>
            <h2 className="font-display text-[clamp(2.2rem,4.4vw,3.6rem)]">
              What it will
              <br />
              <span className="display-accent">never do.</span>
            </h2>
            <p className="text-muted-foreground mt-8 max-w-md leading-relaxed">
              A tool that claims to do everything does nothing in particular. These are
              refusals, not a roadmap with the dates rubbed off.
            </p>
          </div>

          <ul data-reveal="right" data-stagger className="flex flex-col justify-center">
            {NOT_THIS.map((item) => (
              <li
                key={item}
                className="border-border/50 flex items-baseline gap-5 border-b py-6 last:border-0"
              >
                <span className="label-mono shrink-0">No</span>
                <span className="text-lg">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* -------------------------------------------------------------- faqs */}
      <section id="faq" className="border-border/40 border-t px-6 py-32">
        <div className="mx-auto max-w-4xl">
          <div data-reveal="up" data-stagger className="mb-16">
            <p className="label-mono mb-6">Reasonable questions</p>
            <h2 className="font-display text-[clamp(2.2rem,4.4vw,3.6rem)]">
              Asked before you
              <span className="display-accent"> ask them.</span>
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
      <section id="start" className="relative overflow-hidden px-6 py-44">
        <div
          aria-hidden
          className="animate-drift pointer-events-none absolute top-1/2 left-1/2 h-[36vh] w-[62vw] -translate-x-1/2 -translate-y-1/2 rounded-[50%] opacity-[0.18] blur-[110px]"
          style={{ background: "var(--brand-gradient)" }}
        />
        <div
          className="relative mx-auto max-w-3xl text-center"
          data-reveal="clip"
          data-stagger
        >
          <h2 className="font-display text-[clamp(2.8rem,7.5vw,6.5rem)]">
            Go and be
            <br />
            <span className="display-accent text-accent-gradient">
              suspiciously well informed.
            </span>
          </h2>
          <div className="rule-brand mx-auto mt-11 w-48" aria-hidden />
          <p className="text-muted-foreground mx-auto mt-9 max-w-lg text-lg">
            {spellOutCapitalised(PLANS.free.runs)} free runs a month is more than
            enough to catch us bluffing.
          </p>
          <div className="mt-12 flex flex-wrap justify-center gap-4">
            <MagneticButton href={signedIn ? "/projects" : "/login?mode=signup"}>
              {signedIn ? "Back to your workspace" : "Start with one channel"}
              <ArrowUpRight className="ml-2 inline size-4" aria-hidden />
            </MagneticButton>
            <MagneticButton href="/pricing" variant="glass">
              Compare plans
            </MagneticButton>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ footer */}
      <footer className="border-border/40 border-t px-6 py-14">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-8 sm:flex-row">
          <BrandWordmark className="max-h-8 w-auto" />
          <nav className="flex gap-8 text-sm">
            <Link
              href="/pricing"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </Link>
          </nav>
          <p className="text-muted-foreground text-xs">
            For creators researching a niche they do not yet dominate.
          </p>
        </div>
      </footer>
    </div>
  );
}
