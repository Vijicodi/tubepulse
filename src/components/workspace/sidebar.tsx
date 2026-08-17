"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { LogoLockup } from "@/components/brand/logo";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

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
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
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

      <Link
        href="/projects/new"
        onClick={onNavigate}
        className="bg-muted/50 hover:bg-muted lift hover:border-border/80 flex items-center justify-center gap-2 rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium hover:-translate-y-px"
      >
        <Plus className="size-4" aria-hidden />
        New project
      </Link>
    </nav>
  );
}
