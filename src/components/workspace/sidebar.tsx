"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LifeBuoy, Lock, Plus } from "lucide-react";
import { LogoLockup } from "@/components/brand/logo";
import { NAV_ITEMS } from "@/lib/nav";
import { SUPPORT_EMAIL } from "@/lib/support";
import { cn } from "@/lib/utils";
import type { ProjectCap } from "@/lib/projects/limit";

/**
 * The workspace sidebar.
 *
 * The active item gets a gradient rail on its left edge rather than a filled
 * background — it survives a theme change, and it keeps the item's own label
 * readable instead of fighting a coloured fill behind it.
 *
 * Items whose feature is not built yet stay visible but are marked "soon". A
 * greyed-out item you can still see is honest; hiding it makes the product look
 * smaller than it is about to be.
 */
export function Sidebar({
  onNavigate,
  planCard,
  projectCap,
}: {
  onNavigate?: () => void;
  /**
   * Present only when the plan cannot open another project. The button then
   * says so and goes to billing, instead of leading to a form that refuses.
   */
  projectCap?: ProjectCap | null;
  /**
   * The plan-and-usage card, rendered by the layout as a SERVER component and
   * passed through as a slot.
   *
   * It arrives already-rendered rather than as data because this component is
   * `"use client"` (it needs usePathname for the active rail) while the card's
   * numbers come from a database read under RLS. Passing the element keeps that
   * read on the server; passing the data would drag the quota into the client
   * bundle and put the allowance behind a fetch on every page.
   */
  planCard?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Workspace"
      className="bg-card/40 flex h-full w-64 shrink-0 flex-col gap-6 border-r px-3 py-5"
    >
      <Link
        href="/projects"
        onClick={onNavigate}
        className="rounded-lg px-2 py-1 transition-opacity hover:opacity-80"
      >
        <LogoLockup subtitle="Competitor research" />
      </Link>

      <ul className="flex flex-1 flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-muted/60 text-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted/35 hover:text-foreground",
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="bg-brand-gradient absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 rounded-full"
                  />
                )}
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
                {!item.ready && (
                  <span className="text-muted-foreground/70 ml-auto text-[0.62rem] tracking-wide uppercase">
                    soon
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {planCard}

      {projectCap?.reached ? (
        <Link
          href="/billing"
          onClick={onNavigate}
          title={projectCap.message}
          className="border-border/70 text-muted-foreground hover:text-foreground hover:border-border flex flex-col items-center gap-0.5 rounded-lg border border-dashed px-3 py-2 text-center transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Lock className="size-3.5" aria-hidden />
            Project limit reached
          </span>
          <span className="text-[0.7rem]">
            {projectCap.upgradeTo ? `More projects on ${projectCap.upgradeTo}` : "See your plan"}
          </span>
        </Link>
      ) : (
        <Link
          href="/projects/new"
          onClick={onNavigate}
          className="bg-muted/50 hover:bg-muted lift hover:border-border/80 flex items-center justify-center gap-2 rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium hover:-translate-y-px"
        >
          <Plus className="size-4" aria-hidden />
          New project
        </Link>
      )}

      {/* Paying customers are the ones who most need a way to reach a human,
          and hunting for it on the marketing site is the wrong errand at the
          wrong moment. Quiet by default; it is a reassurance, not a call to
          action. */}
      <a
        href={`mailto:${SUPPORT_EMAIL}`}
        className="text-muted-foreground/70 hover:text-foreground flex items-center justify-center gap-2 px-3 pb-1 text-xs transition-colors"
      >
        <LifeBuoy className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{SUPPORT_EMAIL}</span>
      </a>
    </nav>
  );
}
