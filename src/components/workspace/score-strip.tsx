"use client";

import { useState } from "react";
import { StatGrid } from "./stat-grid";

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

function formatViews(views: number): string {
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(views);
}

export function ScoreStrip({ videos }: { videos: StripVideo[] }) {
  const [active, setActive] = useState<StripVideo | null>(null);

  if (videos.length === 0) return null;

  // The axis always shows at least 0–4x so short strips are not misleadingly
  // zoomed, and stretches when a channel genuinely goes further.
  const maxScore = Math.max(4, Math.ceil(Math.max(...videos.map((v) => v.score))));
  const ticks = Array.from({ length: maxScore + 1 }, (_, i) => i);
  const toPercent = (score: number) => (Math.min(score, maxScore) / maxScore) * 100;

  return (
    <div className="relative">
      {/* ------------------------------------------------------------- axis */}
      <div className="relative h-[4.5rem]">
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
        {videos.map((video) => {
          const breakout = video.score >= BREAKOUT;
          // Deterministic vertical scatter so overlapping scores stay countable
          // instead of stacking into one mark.
          // Hash the WHOLE id: the first character alone put every video from
          // one channel in the same row, which stacked them into a line.
          let hash = 0;
          for (let i = 0; i < video.id.length; i += 1) {
            hash = (hash * 31 + video.id.charCodeAt(i)) >>> 0;
          }
          const lane = hash % 7;

          return (
            <button
              key={video.id}
              type="button"
              onMouseEnter={() => setActive(video)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(video)}
              onBlur={() => setActive(null)}
              onClick={() => window.open(video.url, "_blank", "noreferrer")}
              aria-label={`${video.title} — ${video.score.toFixed(1)} times median, ${formatViews(video.views)} views`}
              className="focus-visible:ring-ring absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform hover:scale-150 focus-visible:ring-2 focus-visible:outline-none"
              style={{
                left: `${toPercent(video.score)}%`,
                top: `${14 + lane * 9}%`,
                // ≥8px hit area even for the small marks.
                width: breakout ? "0.7rem" : "0.5rem",
                height: breakout ? "0.7rem" : "0.5rem",
                // A ring in the surface colour keeps overlapping dots separate.
                background: breakout ? "var(--brand-3)" : "var(--brand-1)",
                boxShadow: "0 0 0 2px var(--background)",
                opacity: breakout ? 1 : 0.55,
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
              {active.score.toFixed(1)}× · {formatViews(active.views)} views
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
          value: videos.toLocaleString("en-IN"),
          note: `across ${channels} ${channels === 1 ? "channel" : "channels"}`,
        },
        {
          label: "Breakouts",
          value: breakouts.toLocaleString("en-IN"),
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
