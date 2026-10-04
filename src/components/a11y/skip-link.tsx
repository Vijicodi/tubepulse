/**
 * "Skip to content", the first thing Tab reaches on every page.
 *
 * Hidden until focused, then a solid pill over the top-left corner. Without it
 * a keyboard user tabbed through the whole sidebar and topbar (21 stops) before
 * reaching the input on /competitors. Every page's content region carries
 * id="main" — the workspace <main>, the public pages' first section, the 404.
 *
 * z above the landing preloader (z-90), so it is never focused behind it.
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="bg-foreground text-background sr-only z-[100] rounded-full px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--brand-2)]"
    >
      Skip to content
    </a>
  );
}
