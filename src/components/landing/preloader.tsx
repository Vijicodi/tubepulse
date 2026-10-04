"use client";

import { useEffect, useRef, useState } from "react";
import { BrandWordmark } from "@/components/brand/logo";
import { INTRO_SEEN_COOKIE } from "./intro-cookie";

/**
 * The longest the curtain may hold the page, measured from navigation start
 * rather than from hydration, so a slow phone's script time counts against it.
 */
const DEADLINE_MS = 550;
/** The beat at 100 before the panels part. */
const HOLD_MS = 120;
/** How long the panels take to slide away. */
const EXIT_MS = 600;

function rememberSeen() {
  try {
    document.cookie = `${INTRO_SEEN_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // A blocked cookie only means the intro plays again next time.
  }
}

/**
 * The loading screen.
 *
 * An honest one, within a budget. The counter climbs as real work finishes —
 * fonts ready, the document parsed — not on a fake timer. But it USED to wait
 * for the window load event as well, which waits on every image and video on
 * the page, and that held first-time visitors for 4 to 6 seconds behind a
 * curtain covering a hero that was already server-rendered and readable.
 *
 * So the real signals now race a deadline: whichever is first gets the counter
 * to 100, and the curtain is clear within about a second of navigation. A CSS
 * failsafe in index.css (.tp-preloader) fades it regardless if hydration is
 * late, and the page does not render it at all once the cookie says the intro
 * has been seen, or for prefers-reduced-motion.
 */
export function Preloader() {
  const [progress, setProgress] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Hidden by CSS already for reduced motion; this just removes the node.
    // Dismissed on the next frame rather than synchronously: setting state
    // directly in an effect body triggers a cascading render.
    if (reduced) {
      rememberSeen();
      const skip = requestAnimationFrame(() => setGone(true));
      return () => cancelAnimationFrame(skip);
    }

    // Lock scroll while the curtain is up, so a trackpad flick during load does
    // not leave someone halfway down a page they have not seen.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    let raf = 0;
    let settled = 0;
    const timers: number[] = [];

    // Real signals. DOMContentLoaded, not load: load waits for every image and
    // video below the fold, none of which the first screen needs.
    const signals: Promise<unknown>[] = [
      document.fonts?.ready ?? Promise.resolve(),
      new Promise<void>((resolve) => {
        if (document.readyState !== "loading") return resolve();
        document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
      }),
    ];
    signals.forEach((signal) => {
      signal.finally(() => {
        settled += 1;
      });
    });

    function tick() {
      raf = requestAnimationFrame(tick);
      setProgress((current) => {
        const fromSignals = 25 + (settled / signals.length) * 75;
        // The deadline floor: by DEADLINE_MS after navigation the counter is
        // at 100 whatever the signals say.
        const fromClock = (performance.now() / DEADLINE_MS) * 100;
        const ceiling = Math.min(Math.max(fromSignals, fromClock), 100);
        // Ease into the ceiling so the number decelerates instead of jumping.
        const next = current + Math.max((ceiling - current) * 0.22, 1);
        const capped = Math.min(next, ceiling);

        if (capped >= 99.5 && !doneRef.current) {
          doneRef.current = true;
          rememberSeen();
          timers.push(
            window.setTimeout(() => {
              setLeaving(true);
              // Give scroll back as the panels start to part, not after.
              document.body.style.overflow = previousOverflow;
            }, HOLD_MS),
            window.setTimeout(() => setGone(true), HOLD_MS + EXIT_MS + 50),
          );
        }
        return capped;
      });
    }
    tick();

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((timer) => window.clearTimeout(timer));
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (gone) return null;

  const shown = Math.round(progress);

  return (
    <div
      /*
       * pointer-events-none is load-bearing, not cosmetic.
       *
       * The exit runs in two stages: the panels slide away, and the element is
       * only removed once they have finished. In the gap between, the
       * curtain is invisible but still a full-viewport element at z-90 — and
       * it swallowed every click on the page. The pricing CTAs looked broken
       * because they are the first thing anyone reaches for on a cold load;
       * the nav was just as dead. Skipping the intro on a repeat visit hid it
       * from us, since a reload never shows the curtain and "fixes" it.
       *
       * Nothing in here is interactive, so refusing pointer events outright
       * is correct at every stage, not only while leaving.
       */
      className="tp-preloader pointer-events-none fixed inset-0 z-[90]"
      role="status"
      aria-live="polite"
      aria-label={`Loading, ${shown} percent`}
    >
      {/* Two panels that split apart, rather than a single fade. The seam is
          where the brand gradient shows through. */}
      <div
        className={`bg-background absolute inset-x-0 top-0 h-1/2 transition-transform duration-[600ms] ${
          leaving ? "-translate-y-full" : "translate-y-0"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.76, 0, 0.24, 1)" }}
      />
      <div
        className={`bg-background absolute inset-x-0 bottom-0 h-1/2 transition-transform duration-[600ms] ${
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
