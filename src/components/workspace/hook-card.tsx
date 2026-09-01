import { ArrowUpRight } from "lucide-react";
import type { Hook } from "@/lib/analytics/hooks";

/**
 * One title shape, with the evidence it was drawn from.
 *
 * Server component, no chart library — same reasoning as pattern-panel.tsx.
 *
 * THE EXAMPLES ARE THE POINT, not decoration. A claim like "questions do well"
 * is worth nothing on its own; three real titles that a reader can click
 * through to is a claim they can check. Every hook rendered here has at least
 * one, guaranteed by buildHookLibrary.
 *
 * AN UNRELIABLE HOOK IS DRAWN FAINTLY, never hidden and never dressed up. A
 * shape seen three times is real information — it is just not yet a trend, and
 * the difference is the sample size printed next to it.
 */
export function HookCard({ hook }: { hook: Hook }) {
  return (
    <article
      className={
        hook.isReliable
          ? "border-border/60 bg-card/40 rounded-xl border p-4"
          : "border-border/40 bg-card/20 rounded-xl border p-4"
      }
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3
          className={
            hook.isReliable
              ? "text-sm font-medium"
              : "text-muted-foreground text-sm font-medium"
          }
        >
          {hook.label}
        </h3>

        <p className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
          {hook.meanScore.toFixed(1)}x · {hook.sampleSize} title
          {hook.sampleSize === 1 ? "" : "s"}
        </p>
      </header>

      <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
        {hook.guidance}
        {/*
          Stated on the card itself rather than in a legend somewhere. A reader
          scanning one card needs to know THIS number is thin, at the moment
          they read it.
        */}
        {!hook.isReliable && (
          <span className="text-muted-foreground/70">
            {" "}
            Too few so far to call this a trend — judge it from the titles.
          </span>
        )}
      </p>

      <ul className="mt-3 space-y-1.5">
        {hook.examples.map((example) => (
          <li key={example.url}>
            <a
              href={example.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-baseline gap-2 text-xs"
            >
              <span className="text-muted-foreground shrink-0 font-mono tabular-nums">
                {example.outlierScore.toFixed(1)}x
              </span>
              <span className="group-hover:text-foreground text-muted-foreground min-w-0 flex-1 truncate transition-colors">
                {example.title}
              </span>
              <ArrowUpRight
                className="text-muted-foreground/50 size-3 shrink-0"
                aria-hidden
              />
            </a>
          </li>
        ))}
      </ul>
    </article>
  );
}
