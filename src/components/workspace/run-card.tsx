import { ChevronRight } from "lucide-react";
import { costOf, formatCost } from "@/lib/billing/cost";
import { formatDuration, parseTrail } from "@/lib/jobs/trail";
import type { JobRow } from "@/lib/supabase/types";

/**
 * One run, with what it cost and what the agent did.
 *
 * A server component: everything here is derived from a row, and the
 * disclosure sections are native `<details>` rather than React state — the same
 * choice the idea card makes, for the same reason. No JavaScript ships for a
 * triangle, and the content is inside the page for Ctrl+F and for print even
 * while collapsed.
 *
 * BOTH SECTIONS ARE GATED, and the gate is passed in rather than read here, so
 * this component cannot disagree with the plan catalogue about who sees what.
 */

const KIND_LABELS: Record<string, string> = {
  channel_scrape: "Channel research",
  idea_generation: "Idea generation",
  transcript: "Transcript",
};

const STEP_LABELS: Record<string, string> = {
  collect: "Collect",
  score: "Score",
  enrich: "Enrich",
  generate: "Generate",
  store: "Store",
  captions: "Captions",
  summarise: "Summarise",
};

const STATUS_STYLES: Record<string, string> = {
  succeeded: "text-[var(--brand-2)]",
  failed: "text-destructive",
  running: "text-muted-foreground",
  queued: "text-muted-foreground",
};

export function RunCard({
  job,
  showCost,
  showTrail,
}: {
  job: JobRow;
  /** Studio and above. The per-run cost breakdown. */
  showCost: boolean;
  /** Max only. The full agent and tool-call trail. */
  showTrail: boolean;
}) {
  const usage = job.usage;
  const cost = usage ? costOf(usage) : null;
  const trail = parseTrail(job.trail);

  return (
    <article className="surface-raised rounded-xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold tracking-tight">
            {KIND_LABELS[job.kind] ?? job.kind}
          </h3>
          <p className="text-muted-foreground mt-1 text-xs">
            {new Date(job.created_at).toLocaleString("en-US", {
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {/*
            The cost sits beside the status because that is the pair someone
            scans for: did it work, and what did it take.
          */}
          {showCost && cost && cost.lines.length > 0 && (
            <span className="font-mono text-sm tabular-nums">
              {formatCost(cost.totalCents)}
            </span>
          )}
          <span
            className={`font-mono text-[0.6rem] tracking-[0.16em] uppercase ${
              STATUS_STYLES[job.status] ?? "text-muted-foreground"
            }`}
          >
            {job.status}
          </span>
        </div>
      </div>

      {job.error && <p className="text-destructive mt-3 text-sm">{job.error}</p>}

      {/* ------------------------------------------------- cost breakdown */}
      {showCost && cost && cost.lines.length > 0 && (
        <details className="group border-border/50 mt-4 border-t pt-3">
          <summary className="text-muted-foreground hover:text-foreground marker:content-none flex cursor-pointer list-none items-center gap-2 font-mono text-[0.6rem] tracking-[0.16em] uppercase transition-colors">
            <ChevronRight
              aria-hidden
              className="size-3.5 transition-transform duration-200 group-open:rotate-90"
            />
            What this run cost
          </summary>

          <dl className="mt-3 space-y-2">
            {cost.lines.map((line) => (
              <div
                key={`${line.provider}-${line.detail}`}
                className="flex items-baseline justify-between gap-4 text-sm"
              >
                <dt className="text-muted-foreground min-w-0">
                  <span className="text-foreground">{line.provider}</span>
                  {" — "}
                  {line.detail}
                </dt>
                <dd className="shrink-0 font-mono tabular-nums">
                  {formatCost(line.cents)}
                </dd>
              </div>
            ))}

            <div className="border-border/50 flex items-baseline justify-between gap-4 border-t pt-2 text-sm font-medium">
              <dt>Total</dt>
              <dd className="font-mono tabular-nums">{formatCost(cost.totalCents)}</dd>
            </div>
          </dl>

          {/*
            SAID PLAINLY, because it is true. Nothing here queries a provider's
            billing API — these are observed counts multiplied by a rate table
            we maintain. Presenting an estimate as an invoice would be the
            dishonest version of a feature whose whole point is transparency.
          */}
          <p className="text-muted-foreground/70 mt-3 text-xs">
            Estimated from what this run actually used, at current provider
            rates. Your plan price does not change with it.
          </p>
        </details>
      )}

      {/* ---------------------------------------------------- agent trail */}
      {showTrail && trail.length > 0 && (
        <details className="group border-border/50 mt-4 border-t pt-3">
          <summary className="text-muted-foreground hover:text-foreground marker:content-none flex cursor-pointer list-none items-center gap-2 font-mono text-[0.6rem] tracking-[0.16em] uppercase transition-colors">
            <ChevronRight
              aria-hidden
              className="size-3.5 transition-transform duration-200 group-open:rotate-90"
            />
            Agent trail
          </summary>

          <ol className="mt-3 space-y-2">
            {trail.map((step, index) => (
              <li
                key={`${step.step}-${index}`}
                className="flex items-baseline justify-between gap-4 text-sm"
              >
                <span className="min-w-0">
                  <span className="text-muted-foreground font-mono text-xs">
                    {String(index + 1).padStart(2, "0")}
                  </span>{" "}
                  <span className="font-medium">
                    {STEP_LABELS[step.step] ?? step.step}
                  </span>{" "}
                  <span className="text-muted-foreground">{step.detail}</span>
                  {step.error && (
                    <span className="text-destructive block text-xs">{step.error}</span>
                  )}
                </span>

                {/*
                  Zero is not shown. Some steps are recorded after the fact by a
                  webhook that never timed them, and "0ms" would be a claim
                  about speed rather than an absence of data.
                */}
                {step.ms > 0 && (
                  <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
                    {formatDuration(step.ms)}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}
