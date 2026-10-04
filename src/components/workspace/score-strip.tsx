"use client";

import { useMemo, useRef, useState } from "react";
import { StatGrid } from "./stat-grid";
import { assignLanes, nearestPoint } from "@/lib/analytics/hit-test";
import { formatCompact, formatNumber } from "@/lib/format";

/**
 * Where a channel's videos sit against its own median.
 *
 * FORM. The job is distribution plus identity: "how does this channel normally
 * perform, and which videos escaped it?" One axis, one series per channel, laid
 * out as small multiples — one strip each — so channels are compared by reading
 * down the page rather than by cramming them onto shared axes.
 *
 * COLOUR. Magnitude, not category. A single hue deepening with score, and one
 * reserved highlight for a genuine breakout. Because there is one series per
 * strip, no legend box is needed — the heading names it. Size and a label carry
 * the breakout too, so it is never colour alone.
 *
 * The median sits at 1.0x by definition. That gridline is the whole product in
 * one mark: everything left of it is the channel's ordinary work.
 */

export interface StripVideo {
  id: string;
  title: string;
  score: number;
  views: number;
  url: string;
}

/** A breakout: three times the channel's own median. */
const BREAKOUT = 3;

const LANES = 7;

/** Vertical position of each lane, as a percentage of the strip's height. */
const laneTop = (lane: number) => 14 + lane * 9;

/** How far from a dot's centre the pointer may be and still mean that dot. */
const HIT_RADIUS_PX = 14;

/**
 * A dot's preferred lane: deterministic vertical scatter so overlapping scores
 * stay countable instead of stacking into one mark. Hash the WHOLE id: the first character alone put
 * every video from one channel in the same row, which stacked them into a line.
 */
function laneOf(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % LANES;
}

export function ScoreStrip({ videos }: { videos: StripVideo[] }) {
  const [active, setActive] = useState<StripVideo | null>(null);
  const axisRef = useRef<HTMLDivElement>(null);

  // Painted lowest score first, so where dots overlap the breakout sits on top.
  const ordered = useMemo(
    () => [...videos].sort((a, b) => a.score - b.score),
    [videos],
  );

  // The axis always shows at least 0–4x so short strips are not misleadingly
  // zoomed, and stretches when a channel genuinely goes further.
  const maxScore = Math.max(4, Math.ceil(Math.max(0, ...videos.map((v) => v.score))));
  const ticks = Array.from({ length: maxScore + 1 }, (_, i) => i);
  const toPercent = (score: number) => (Math.min(score, maxScore) / maxScore) * 100;

  // No two dots on the same spot: a dot drawn exactly over another could not
  // be reached by any pointer rule. 1.5% of the axis is ~16px on a desktop.
  const lanes = useMemo(
    () =>
      assignLanes(
        ordered.map((video) => ({
          id: video.id,
          value: Math.min(video.score, maxScore),
          preferred: laneOf(video.id),
        })),
        LANES,
        maxScore * 0.015,
      ),
    [ordered, maxScore],
  );
  const laneFor = (id: string) => lanes.get(id) ?? laneOf(id);

  if (videos.length === 0) return null;

  /**
   * POINTER HIT-TESTING IS DONE HERE, not by the dots. Each dot used to be its
   * own button, and where two overlapped the one painted last took every
   * click: a dot opened someone else's video, and four could not be clicked
   * at all. The dots now ignore the pointer; the strip finds the dot nearest
   * the pointer, and that one is hovered and opened. Keyboard users still Tab
   * through the dots, which remain real buttons.
   */
  function videoAt(event: React.PointerEvent | React.MouseEvent): StripVideo | null {
    const axis = axisRef.current;
    if (!axis) return null;
    const rect = axis.getBoundingClientRect();
    const id = nearestPoint(
      ordered.map((video) => ({
        id: video.id,
        x: (toPercent(video.score) / 100) * rect.width,
        y: (laneTop(laneFor(video.id)) / 100) * rect.height,
      })),
      event.clientX - rect.left,
      event.clientY - rect.top,
      HIT_RADIUS_PX,
    );
    return id ? (ordered.find((video) => video.id === id) ?? null) : null;
  }

  return (
    <div className="relative">
      {/* ------------------------------------------------------------- axis */}
      <div
        ref={axisRef}
        className={active ? "relative h-[4.5rem] cursor-pointer" : "relative h-[4.5rem]"}
        onPointerMove={(event) => {
          if (event.pointerType !== "mouse") return;
          const hit = videoAt(event);
          if (hit?.id !== active?.id) setActive(hit);
        }}
        onPointerLeave={() => setActive(null)}
        onClick={(event) => {
          // Enter or Space on a focused dot also bubbles a click here, with
          // detail 0 and no pointer position; the dot handles that one.
          if (event.detail === 0) return;
          const hit = videoAt(event);
          if (hit) window.open(hit.url, "_blank", "noreferrer");
        }}
      >
        {/* Recessive gridlines. The 1x line is the median and is the only one
            drawn with any weight. */}
        {ticks.map((tick) => (
          <div
            key={tick}
            aria-hidden
            className={
              tick === 1
                ? "bg-foreground/25 absolute top-0 bottom-5 w-px"
                : "bg-border/50 absolute top-2 bottom-5 w-px"
            }
            style={{ left: `${toPercent(tick)}%` }}
          />
        ))}

        {/* -------------------------------------------------------- the dots */}
        {ordered.map((video) => {
          const breakout = video.score >= BREAKOUT;
          const isActive = active?.id === video.id;

          return (
            <button
              key={video.id}
              type="button"
              onFocus={() => setActive(video)}
              onBlur={() => setActive(null)}
              onClick={(event) => {
                // Only the keyboard reaches here (Enter or Space on a focused
                // dot); pointer clicks are resolved by the strip above.
                if (event.detail !== 0) return;
                window.open(video.url, "_blank", "noreferrer");
              }}
              aria-label={`${video.title} — ${video.score.toFixed(1)} times median, ${formatNumber(video.views)} views`}
              className={`focus-visible:ring-ring pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform focus-visible:ring-2 focus-visible:outline-none ${
                isActive ? "z-10 scale-150" : ""
              }`}
              style={{
                left: `${toPercent(video.score)}%`,
                top: `${laneTop(laneFor(video.id))}%`,
                // ≥8px hit area even for the small marks.
                width: breakout ? "0.7rem" : "0.5rem",
                height: breakout ? "0.7rem" : "0.5rem",
                // A ring in the surface colour keeps overlapping dots separate.
                background: breakout ? "var(--brand-3)" : "var(--brand-1)",
                boxShadow: "0 0 0 2px var(--background)",
                opacity: breakout || isActive ? 1 : 0.55,
              }}
            />
          );
        })}

        {/* --------------------------------------------------------- tick labels */}
        {ticks.map((tick) => (
          <span
            key={tick}
            aria-hidden
            className="text-muted-foreground absolute bottom-0 -translate-x-1/2 font-mono text-[0.6rem] tabular-nums"
            style={{ left: `${toPercent(tick)}%` }}
          >
            {tick}×
          </span>
        ))}
      </div>

      {/* ----------------------------------------------------------- tooltip */}
      {/* Reserved height, so hovering never reflows the page underneath. */}
      <div className="mt-0.5 h-8">
        {active && (
          <div className="bg-popover border-border text-popover-foreground inline-flex max-w-full items-center gap-3 rounded-lg border px-3 py-1.5 text-xs shadow-sm">
            <span className="min-w-0 truncate font-medium">{active.title}</span>
            <span className="text-muted-foreground shrink-0 font-mono tabular-nums">
              {active.score.toFixed(1)}× · {formatCompact(active.views)} views
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The three numbers worth knowing before any chart.
 *
 * Not a chart on purpose: a single value per idea reads faster as a number than
 * as a mark, and these are the ones someone opens the page to find.
 */
export function StatTiles({
  videos,
  breakouts,
  best,
  channels,
}: {
  videos: number;
  breakouts: number;
  best: number | null;
  channels: number;
}) {
  return (
    <StatGrid
      tiles={[
        {
          label: "Videos tracked",
          value: formatNumber(videos),
          note: `across ${channels} ${channels === 1 ? "channel" : "channels"}`,
        },
        {
          label: "Breakouts",
          value: formatNumber(breakouts),
          note: `${BREAKOUT}× their median or better`,
        },
        {
          label: "Best score",
          value: best === null ? "—" : `${best.toFixed(1)}×`,
          note: "highest against its own channel",
        },
      ]}
    />
  );
}
