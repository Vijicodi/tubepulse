"use client";

import { useEffect, useRef } from "react";

/**
 * Staggers the direct children of one container into view.
 *
 * Applied once, inside `WorkspacePanel`, so every workspace page gets the same
 * entrance without ten pages each growing their own copy. The nav taught this
 * lesson expensively: two copies of one thing drifted within a day.
 *
 * THE INVISIBLE-FOREVER TRAP, AVOIDED TWICE OVER.
 *
 *   1. `gsap.fromTo`, never `gsap.from`. The start state is opacity 0, and
 *      `from()` reads the CURRENT value as its DESTINATION — so it animates
 *      0 → 0 and the element never appears. Two sections shipped blank that way.
 *   2. The hidden state is set by JAVASCRIPT, not by CSS. The server sends
 *      fully visible markup, so if this bundle fails to load, is blocked, or
 *      throws, the page is still readable. A CSS `opacity: 0` start state would
 *      make a broken script mean a blank workspace, which is a far worse
 *      failure than a missing animation.
 *
 * `prefers-reduced-motion` skips the whole thing rather than speeding it up.
 */
export function RevealGroup({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const targets = Array.from(container.children) as HTMLElement[];
    if (targets.length === 0) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      const { gsap } = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");

      if (cancelled || !ref.current) return;

      gsap.registerPlugin(ScrollTrigger);

      const tweens = targets.map((target, index) =>
        gsap.fromTo(
          target,
          { opacity: 0, y: 16 },
          {
            opacity: 1,
            y: 0,
            duration: 0.5,
            // Only the first few stagger; a long page should not make you wait
            // on a queue to read the bottom of it.
            delay: Math.min(index, 4) * 0.06,
            ease: "power2.out",
            scrollTrigger: { trigger: target, start: "top 92%", once: true },
          },
        ),
      );

      cleanup = () => {
        for (const tween of tweens) {
          tween.scrollTrigger?.kill();
          tween.kill();
        }
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <div ref={ref} className="flex flex-col gap-4">
      {children}
    </div>
  );
}
