import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteNav } from "@/components/landing/site-nav";
import { isSupabaseConfigured } from "@/lib/public-env";
import { getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Page not found — TubePulse" };

/**
 * The site-wide 404, for any URL that matches no route.
 *
 * Without this file Next served its default: black text on a white page, no
 * logo, no way back. It also injected its own body styles, which is what
 * washed the dark sidebar grey whenever a workspace page called notFound().
 * The workspace now has its own not-found inside the shell; this one is for
 * everything else.
 *
 * Reads the session only to point a signed-in visitor at their projects, the
 * place they were most likely trying to reach.
 */
export default async function NotFound() {
  const user = isSupabaseConfigured ? await getUser().catch(() => null) : null;

  return (
    <div className="bg-background text-foreground relative isolate min-h-svh overflow-hidden">
      <SiteNav signedIn={Boolean(user)} />

      {/* Same dim brand field the landing hero sits on, smaller and off
          centre, so the page reads as ours without competing with the words. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-[38%] left-[30%] -z-10 h-[40vh] w-[50vw] -translate-x-1/2 -translate-y-1/2 rounded-[50%] opacity-[0.14] blur-[100px]"
        style={{ background: "var(--brand-gradient)" }}
      />

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex min-h-svh max-w-3xl flex-col justify-center px-6 pt-32 pb-24 outline-none"
      >
        <p className="label-mono">Error 404 · Nothing at this address</p>

        <h1 className="font-display mt-6 text-[clamp(2.8rem,9vw,5.5rem)] text-balance">
          This page was never{" "}
          <span className="display-accent text-accent-gradient">recorded.</span>
        </h1>

        <div className="rule-brand mt-10 w-32" aria-hidden />

        <p className="text-muted-foreground mt-8 max-w-[52ch] text-lg leading-relaxed">
          The link may be old, or the address mistyped. Nothing you saved has
          moved — it is all where you left it.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          {user ? (
            <Button asChild size="lg" className="bg-brand-gradient text-white">
              <Link href="/projects">
                Back to your projects
                <ArrowUpRight aria-hidden />
              </Link>
            </Button>
          ) : null}
          <Button asChild size="lg" variant={user ? "outline" : "default"}>
            <Link href="/">
              <ArrowLeft aria-hidden />
              TubePulse home
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
