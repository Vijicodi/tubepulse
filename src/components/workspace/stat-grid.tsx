import { Tilt } from "./tilt";
/**
 * The row of headline numbers that sits above a workspace page's detail.
 *
 * Extracted from the Outliers page so Idea lab could not quietly invent a
 * second visual language for the same idea. The nav learned this lesson the
 * expensive way: two copies of one thing drifted within a day.
 *
 * Presentation only — every value arrives already formatted, because the server
 * component that has the data is also the place that knows how it should read.
 *
 * The tilt lives HERE rather than at each call site, so every page showing
 * these tiles leans the same way and none of them can forget.
 */

export interface StatTile {
  label: string;
  /** Already formatted. This component never touches Intl. */
  value: string;
  note: string;
}

export function StatGrid({ tiles }: { tiles: StatTile[] }) {
  return (
    <Tilt className="rounded-xl">
      <div className="border-border/60 bg-border/60 grid gap-px overflow-hidden rounded-xl border sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="bg-background p-5">
            <p className="text-muted-foreground font-mono text-[0.6rem] tracking-[0.16em] uppercase">
              {tile.label}
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
              {tile.value}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">{tile.note}</p>
          </div>
        ))}
      </div>
    </Tilt>
  );
}
