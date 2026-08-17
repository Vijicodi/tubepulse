"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * One channel's outliers, collapsible.
 *
 * A project with four competitors used to be four full tables stacked down the
 * page, which meant scrolling past a hundred rows to reach the fourth channel.
 * Collapsed, every channel is one line and the whole project fits on a screen;
 * open, it is the same table as before.
 *
 * The first channel opens by default so the page is never a column of closed
 * doors — you land on something, and choose whether to open the rest.
 */
export function ChannelSection({
  name,
  href,
  median,
  total,
  unit = "video",
  showMedianLabel = true,
  defaultOpen = false,
  children,
}: {
  name: string;
  /** Where the competitor's own page lives, if there is one. */
  href?: string;
  /** Already formatted — the server does the number formatting. */
  median: string;
  total: number;
  /** "video" or "post", so the count reads correctly per platform. */
  unit?: string;
  /**
   * False for Instagram, where `median` carries the reel/post mix instead. An
   * account has two medians there, and labelling the mix "median" would be
   * wrong twice over.
   */
  showMedianLabel?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border-border/50 overflow-hidden rounded-xl border">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="hover:bg-muted/30 focus-visible:ring-ring flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <ChevronRight
            aria-hidden
            className={`text-muted-foreground size-4 shrink-0 transition-transform duration-200 ${
              open ? "rotate-90" : ""
            }`}
          />

          <span className="min-w-0 flex-1 truncate font-semibold tracking-tight">
            {name}
          </span>

          <span className="text-muted-foreground shrink-0 font-mono text-[0.62rem] tracking-[0.14em] whitespace-nowrap uppercase">
            {showMedianLabel ? `median ${median}` : median} · {total}{" "}
            {total === 1 ? unit : `${unit}s`}
          </span>
        </button>
      </h3>

      {open && (
        <div className="border-border/50 border-t p-4">
          {href && (
            <Link
              href={href}
              className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-xs underline underline-offset-2"
            >
              See everything about this account
            </Link>
          )}
          {children}
        </div>
      )}
    </section>
  );
}
