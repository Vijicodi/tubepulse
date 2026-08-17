import { cn } from "@/lib/utils";
import { RevealGroup } from "./reveal-group";

/**
 * The right-hand panel every workspace page fills.
 *
 * Kept as one component so the title row reads identically on every page. A
 * page that wants a different header is a page that should explain why.
 *
 * It used to carry a "LIVE WORKSPACE" eyebrow and a "Private Supabase data"
 * note. Both were removed — they described the plumbing to whoever built it,
 * not the work to whoever uses it.
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

      <RevealGroup>{children}</RevealGroup>
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
