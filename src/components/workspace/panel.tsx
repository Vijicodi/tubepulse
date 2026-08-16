import { cn } from "@/lib/utils";

/**
 * The right-hand panel every workspace page fills.
 *
 * Kept as one component so the "LIVE WORKSPACE" eyebrow, the title row and the
 * "Private Supabase data" note stay identical on all seven pages. A page that
 * wants a different header is a page that should explain why.
 */
export function WorkspacePanel({
  title,
  description,
  badge,
  action,
  children,
}: {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="animate-rise flex min-h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[0.65rem] font-medium tracking-[0.18em] text-[var(--brand-2)] uppercase">
          Live workspace
        </p>
        <p className="text-muted-foreground shrink-0 text-xs">Private Supabase data</p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          {badge}
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="text-muted-foreground max-w-prose text-sm">{description}</p>
          )}
        </div>
        {action}
      </div>

      {children}
    </div>
  );
}

/** The neutral "nothing here yet" state, used by every not-yet-built page. */
export function EmptyState({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-muted/25 text-muted-foreground rounded-2xl border border-dashed px-6 py-8 text-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The small pill above a title, e.g. "Source-grounded". */
export function PanelBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-muted/50 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs">
      <span className="size-1.5 rounded-full bg-[var(--brand-2)]" aria-hidden />
      {children}
    </span>
  );
}
