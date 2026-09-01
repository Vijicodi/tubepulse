import { formatLift, type Bucket, type Pattern, type TraitComparison } from "@/lib/analytics/patterns";

/**
 * How a pattern is drawn: a bar per bucket, scaled against the strongest.
 *
 * Server components, no chart library. These are one-dimensional comparisons —
 * a bar and a number say everything a plotting library would, and shipping one
 * for this would be several hundred kilobytes to draw a rectangle.
 *
 * AN UNRELIABLE BUCKET IS DRAWN DIFFERENTLY, not hidden. Hiding it would leave
 * a reader wondering where their Thursdays went; showing it in full confidence
 * would be a claim the sample cannot support. So it is drawn faintly with its
 * sample size stated, which is the honest middle.
 */

function Bar({ bucket, max }: { bucket: Bucket; max: number }) {
  const width = max === 0 ? 0 : (bucket.meanScore / max) * 100;

  return (
    <div className="flex items-center gap-3">
      <span
        className={
          bucket.isReliable
            ? "w-28 shrink-0 text-sm"
            : "text-muted-foreground w-28 shrink-0 text-sm"
        }
      >
        {bucket.label}
      </span>

      <div className="bg-muted/40 h-2 flex-1 overflow-hidden rounded-full">
        <div
          className={
            bucket.isReliable
              ? "bg-brand-gradient h-full rounded-full"
              : "bg-muted-foreground/30 h-full rounded-full"
          }
          style={{ width: `${Math.max(width, 1)}%` }}
        />
      </div>

      <span className="text-muted-foreground w-24 shrink-0 text-right font-mono text-xs tabular-nums">
        {bucket.meanScore.toFixed(1)}x
        {/*
          The sample size is stated on the thin ones, because that is exactly
          when a reader needs to know not to trust the bar.
        */}
        {!bucket.isReliable && ` · ${bucket.sampleSize}`}
      </span>
    </div>
  );
}

export function PatternPanel({
  title,
  description,
  pattern,
  bestLabel,
}: {
  title: string;
  description: string;
  pattern: Pattern;
  /** How to phrase the headline finding, e.g. "Best day". */
  bestLabel: string;
}) {
  const max = Math.max(...pattern.buckets.map((bucket) => bucket.meanScore), 0);

  return (
    <section className="surface-raised rounded-xl p-5">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-semibold tracking-tight">{title}</h3>
        {pattern.best && (
          <span className="text-accent-gradient shrink-0 font-mono text-xs">
            {bestLabel}: {pattern.best.label}
          </span>
        )}
      </div>

      <p className="text-muted-foreground mt-1 text-sm">{description}</p>

      {pattern.buckets.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">
          Not enough scored videos yet.
        </p>
      ) : (
        <div className="mt-4 space-y-2.5">
          {pattern.buckets.map((bucket) => (
            <Bar key={bucket.label} bucket={bucket} max={max} />
          ))}
        </div>
      )}

      {/*
        Said once, under the bars, when any of them are thin. A reader who
        cannot tell which numbers to trust will either trust all of them or
        none, and both are wrong.
      */}
      {pattern.buckets.some((bucket) => !bucket.isReliable) && (
        <p className="text-muted-foreground/70 mt-4 text-xs">
          Faded bars have too few videos to mean much yet — the number beside
          them is the sample size. Research more of this channel to firm them up.
        </p>
      )}
    </section>
  );
}

export function TraitPanel({ traits }: { traits: TraitComparison[] }) {
  const reliable = traits.filter((trait) => trait.isReliable);

  return (
    <section className="surface-raised rounded-xl p-5">
      <h3 className="font-semibold tracking-tight">What the titles do</h3>
      <p className="text-muted-foreground mt-1 text-sm">
        Each row compares titles that do this against the ones that do not, on
        this channel. Above 1.0x means it helped here.
      </p>

      {reliable.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">
          Not enough videos on both sides of any comparison yet.
        </p>
      ) : (
        <dl className="mt-4 space-y-2.5">
          {reliable.map((trait) => (
            <div
              key={trait.label}
              className="flex items-baseline justify-between gap-4 text-sm"
            >
              <dt className="min-w-0">{trait.label}</dt>
              <dd className="flex shrink-0 items-baseline gap-3">
                <span className="text-muted-foreground font-mono text-xs">
                  {trait.withTrait.sampleSize} of{" "}
                  {trait.withTrait.sampleSize + trait.withoutTrait.sampleSize}
                </span>
                <span
                  className={
                    // Colour carries the direction, because "0.6x" and "1.6x"
                    // look identical at a glance and mean opposite things.
                    trait.lift >= 1.15
                      ? "font-mono tabular-nums text-[var(--brand-2)]"
                      : trait.lift <= 0.85
                        ? "text-muted-foreground font-mono tabular-nums"
                        : "font-mono tabular-nums"
                  }
                >
                  {formatLift(trait.lift)}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
