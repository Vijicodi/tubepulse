"use client";

import { useEffect, useRef, useState } from "react";
import { BrandWordmark } from "@/components/brand/logo";

/**
 * The loading screen.
 *
 * An honest one. The counter is driven by real progress events — fonts becoming
 * ready, the window load event — not a fake timer that always takes 2.4
 * seconds. That matters here for the same reason it matters on the job progress
 * bar in the workspace: the product's whole pitch is evidence over vibes, and a
 * fabricated progress bar is the smallest possible lie to open with.
 *
 * What is choreographed is the exit: once real work is done, the counter
 * finishes, holds for a beat, and the panels split away.
 */
export function Preloader() {
  const [progress, setProgress] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Anyone arriving a second time in the same session has the assets cached;
    // making them watch the intro again is theatre at their expense.
    //
    // Dismissed on the next frame rather than synchronously: the curtain is
    // server-rendered so it covers the first paint, and setting state directly
    // in an effect body triggers a cascading render. One frame is imperceptible.
    const seen = sessionStorage.getItem("tp-intro-seen") === "1";
    if (seen || reduced) {
      const skip = requestAnimationFrame(() => setGone(true));
      return () => cancelAnimationFrame(skip);
    }

    // Lock scroll while the curtain is up, so a trackpad flick during load does
    // not leave someone halfway down a page they have not seen.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    let raf = 0;
    let settled = 0;

    // Real signals. Each one that resolves raises the ceiling the counter may
    // climb to, so the number reflects work actually finished.
    const signals: Promise<unknown>[] = [
      document.fonts?.ready ?? Promise.resolve(),
      new Promise<void>((resolve) => {
        if (document.readyState === "complete") return resolve();
        window.addEventListener("load", () => resolve(), { once: true });
      }),
    ];
    signals.forEach((signal) => {
      signal.finally(() => {
        settled += 1;
      });
    });

    // Never hold the page hostage to a signal that hangs.
    const failsafe = window.setTimeout(() => {
      settled = signals.length;
    }, 4000);

    function tick() {
      raf = requestAnimationFrame(tick);
      setProgress((current) => {
        const ceiling = 25 + (settled / signals.length) * 75;
        // Ease into the ceiling so the number decelerates instead of jumping.
        const next = current + Math.max((ceiling - current) * 0.06, 0.35);
        const capped = Math.min(next, ceiling);

        if (capped >= 99.5 && !doneRef.current) {
          doneRef.current = true;
          sessionStorage.setItem("tp-intro-seen", "1");
          window.setTimeout(() => setLeaving(true), 260);
          window.setTimeout(() => {
            document.body.style.overflow = previousOverflow;
            setGone(true);
          }, 1400);
        }
        return capped;
      });
    }
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(failsafe);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (gone) return null;

  const shown = Math.round(progress);

  return (
    <div
      className="fixed inset-0 z-[90]"
      role="status"
      aria-live="polite"
      aria-label={`Loading, ${shown} percent`}
    >
      {/* Two panels that split apart, rather than a single fade. The seam is
          where the brand gradient shows through. */}
      <div
        className={`bg-background absolute inset-x-0 top-0 h-1/2 transition-transform duration-[900ms] ${
          leaving ? "-translate-y-full" : "translate-y-0"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.76, 0, 0.24, 1)" }}
      />
      <div
        className={`bg-background absolute inset-x-0 bottom-0 h-1/2 transition-transform duration-[900ms] ${
          leaving ? "translate-y-full" : "translate-y-0"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.76, 0, 0.24, 1)" }}
      />

      <div
        className={`absolute inset-0 grid place-items-center transition-opacity duration-300 ${
          leaving ? "opacity-0" : "opacity-100"
        }`}
      >
        <div className="flex w-[min(78vw,520px)] flex-col items-center gap-8">
          <BrandWordmark className="w-44 sm:w-52" sizes="(max-width: 640px) 176px, 208px" priority />

          {/* The bar is the brand gradient revealed by a clip, so the colour
              arrives left-to-right rather than a block sliding across. */}
          <div className="bg-muted/40 relative h-px w-full overflow-hidden">
            <div
              className="bg-brand-gradient absolute inset-y-0 left-0 w-full origin-left"
              style={{ transform: `scaleX(${progress / 100})` }}
            />
          </div>

          <div className="flex w-full items-baseline justify-between">
            <span className="label-mono">Warming up the instruments</span>
            <span
              className="font-display text-foreground text-4xl tabular-nums"
              aria-hidden
            >
              {String(shown).padStart(3, "0")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
