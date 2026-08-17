import Link from "next/link";
import { BrandWordmark } from "@/components/brand/logo";

/**
 * The floating glass nav, shared by the landing and pricing pages.
 *
 * It was duplicated across both and drifted immediately — one had a Pricing
 * link the other did not. One component, two callers.
 *
 * The bland version was a plain frosted pill. Four things give it something to
 * look at without turning it into a toolbar:
 *
 *   1. A gradient hairline along the top edge, where light would catch.
 *   2. A live status dot that actually pulses.
 *   3. A brand-tinted glow bleeding out beneath it, so it sits ON the page
 *      rather than floating in front of an unrelated background.
 *   4. Links that reveal a gradient underline on hover.
 */
export function SiteNav({
  signedIn = false,
  current,
}: {
  signedIn?: boolean;
  current?: "overview" | "pricing";
}) {
  const links =
    current === "pricing"
      ? [{ href: "/", label: "Overview" }]
      : [{ href: "/pricing", label: "Pricing" }];

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center p-4 sm:p-6">
      <div className="relative w-full max-w-5xl">
        {/* Glow beneath the pill, so it reads as lit rather than pasted on. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-10 -bottom-3 h-8 rounded-full opacity-30 blur-2xl"
          style={{ background: "var(--brand-gradient)" }}
        />

        <nav className="glass-liquid relative flex items-center justify-between rounded-full py-2.5 pr-2.5 pl-5 sm:pl-6">
          <span className="glass-sheen" aria-hidden />
          {/* The light-catching top edge. */}
          <span className="rule-brand absolute inset-x-8 top-0 opacity-70" aria-hidden />

          <div className="relative flex items-center gap-4">
            <Link href="/" aria-label="TubePulse home">
              {/* Bigger than it was — the mark was getting lost against a
                  headline four hundred pixels tall. */}
              <BrandWordmark className="max-h-9 w-auto sm:max-h-10" sizes="150px" priority />
            </Link>

            <span
              className="border-border/60 text-muted-foreground hidden items-center gap-2 rounded-full border px-3 py-1 md:inline-flex"
              title="Scrapers are running normally"
            >
              <span className="relative flex size-1.5">
                <span className="bg-brand-gradient absolute inline-flex size-full animate-ping rounded-full opacity-70" />
                <span className="bg-brand-gradient relative inline-flex size-1.5 rounded-full" />
              </span>
              <span className="label-mono">All systems scraping</span>
            </span>
          </div>

          <div className="relative flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground hover:text-foreground group relative hidden rounded-full px-4 py-2.5 text-sm transition-colors sm:block"
              >
                {link.label}
                <span className="rule-brand absolute inset-x-4 bottom-1.5 scale-x-0 transition-transform duration-300 group-hover:scale-x-100" />
              </Link>
            ))}

            {!signedIn && (
              <Link
                href="/login"
                className="text-muted-foreground hover:text-foreground group relative hidden rounded-full px-4 py-2.5 text-sm transition-colors sm:block"
              >
                Sign in
                <span className="rule-brand absolute inset-x-4 bottom-1.5 scale-x-0 transition-transform duration-300 group-hover:scale-x-100" />
              </Link>
            )}

            <Link
              href={signedIn ? "/projects" : "/login?mode=signup"}
              data-cursor-grow
              className="bg-brand-gradient focus-visible:ring-ring relative overflow-hidden rounded-full px-5 py-2.5 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="glass-sheen" aria-hidden />
              <span className="relative">
                {signedIn ? "Go to workspace" : "Start free"}
              </span>
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
