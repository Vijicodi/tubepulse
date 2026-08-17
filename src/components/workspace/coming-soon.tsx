import type { LucideIcon } from "lucide-react";

/**
 * The panel a `ready: false` page shows.
 *
 * The three unfinished routes stay reachable from the sidebar on purpose: a
 * link that goes nowhere reads as a broken app, and hiding them makes the
 * product look smaller than it is. So the page says plainly what it will do and
 * what it is waiting on, and shows the real control in a disabled state so the
 * shape of the finished thing is visible.
 *
 * `/transcript` established this pattern by hand. Nothing here invents a date,
 * a number or a claim that is not already in docs/product.md.
 */
export function ComingSoon({
  icon: Icon,
  heading,
  what,
  blockedBy,
  children,
}: {
  icon: LucideIcon;
  /** What the feature is, as a sentence fragment used for the heading. */
  heading: string;
  /** What it will do, in plain words. */
  what: string;
  /** What has to exist first. Honest, not a date. */
  blockedBy: string;
  /** The real control, rendered disabled, so the shape is visible. */
  children?: React.ReactNode;
}) {
  return (
    <div className="surface-raised rounded-2xl p-6">
      <div className="flex items-start gap-3">
        <span className="bg-muted/60 grid size-10 shrink-0 place-items-center rounded-xl">
          <Icon className="text-muted-foreground size-5" aria-hidden />
        </span>
        <div>
          <h3 className="font-semibold tracking-tight">{heading}</h3>
          <p className="text-muted-foreground mt-1 max-w-prose text-sm">{what}</p>
        </div>
      </div>

      {children && <div className="mt-5">{children}</div>}

      <p className="text-muted-foreground mt-3 text-xs">{blockedBy}</p>
    </div>
  );
}
