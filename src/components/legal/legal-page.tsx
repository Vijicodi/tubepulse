import { SiteNav } from "@/components/landing/site-nav";
import { LegalFooter } from "@/components/legal/legal-footer";
import { LEGAL } from "@/lib/legal";
import { getUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/public-env";

/**
 * The frame every policy page shares: the site's own nav, a readable column,
 * and a footer that links every other policy.
 *
 * Plain on purpose. These pages are read by a payments reviewer and by a
 * customer checking what they agreed to, and both want the words, not motion.
 * No `data-reveal`: the landing styles hide revealed blocks until a script
 * runs, and a policy that is invisible without JavaScript is not published.
 */
export async function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  const user = isSupabaseConfigured ? await getUser() : null;

  return (
    <div className="tp-landing bg-background text-foreground relative min-h-screen">
      <SiteNav signedIn={Boolean(user)} />

      <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 pt-40 pb-24 outline-none">
        <p className="label-mono mb-6">{LEGAL.brand}</p>
        <h1 className="font-display text-[clamp(2.4rem,6vw,4rem)] leading-[1.05] text-balance">
          {title}
        </h1>
        {intro && (
          <p className="text-muted-foreground mt-6 max-w-[62ch] text-lg leading-relaxed">{intro}</p>
        )}
        <p className="text-muted-foreground/80 mt-6 font-mono text-xs">
          Last updated {LEGAL.updated}
        </p>
        <div className="legal-prose border-border/40 mt-12 border-t pt-10">{children}</div>
      </main>

      <LegalFooter />
    </div>
  );
}
