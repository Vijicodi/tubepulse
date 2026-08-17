"use client";

import { useEffect, useRef } from "react";

/**
 * The custom cursor: a glass lens that follows the pointer and reacts to what
 * is under it.
 *
 * Two elements, not one. A small dot that tracks the pointer exactly, and a
 * larger lens that lags behind it. The gap between them is the entire effect —
 * a single element moving at one speed reads as a laggy cursor rather than a
 * designed one.
 *
 * Over anything interactive the lens swells and the dot shrinks, so the cursor
 * itself tells you what is clickable.
 *
 * Only mounts on devices with a fine pointer. A custom cursor on a touchscreen
 * is a bug, and `cursor: none` on a device with no cursor would be a trap.
 */

const INTERACTIVE = "a, button, [role='button'], input, textarea, select, [data-cursor-grow]";

export function LiquidCursor() {
  const lensRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!fine.matches) return;

    const lens = lensRef.current;
    const dot = dotRef.current;
    if (!lens || !dot) return;

    // Start off screen so neither element flashes in the top-left corner before
    // the first pointer event arrives.
    const pos = { x: -200, y: -200 };
    const lensPos = { x: -200, y: -200 };
    let scale = 1;
    let scaleTarget = 1;
    let visible = false;

    function onMove(event: PointerEvent) {
      pos.x = event.clientX;
      pos.y = event.clientY;

      if (!visible) {
        visible = true;
        lens!.style.opacity = "1";
        dot!.style.opacity = "1";
      }

      const overInteractive = (event.target as Element | null)?.closest?.(INTERACTIVE);
      scaleTarget = overInteractive ? 2.4 : 1;
    }

    function onDown() {
      scaleTarget *= 0.8;
    }
    function onUp() {
      scaleTarget = scaleTarget < 1.6 ? 1 : 2.4;
    }
    function onLeave() {
      visible = false;
      lens!.style.opacity = "0";
      dot!.style.opacity = "0";
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    let frame = 0;
    function tick() {
      frame = requestAnimationFrame(tick);

      // The lens chases; the dot is exact. Different easing values are what
      // create the elastic feel.
      lensPos.x += (pos.x - lensPos.x) * 0.16;
      lensPos.y += (pos.y - lensPos.y) * 0.16;
      scale += (scaleTarget - scale) * 0.14;

      lens!.style.transform =
        `translate3d(${lensPos.x}px, ${lensPos.y}px, 0) translate(-50%, -50%) scale(${scale})`;
      dot!.style.transform =
        `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%) scale(${2 - scale * 0.4})`;
    }
    tick();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <>
      <div
        ref={lensRef}
        aria-hidden
        className="cursor-lens size-9 opacity-0 transition-opacity duration-300"
      />
      <div
        ref={dotRef}
        aria-hidden
        className="bg-brand-gradient pointer-events-none fixed top-0 left-0 z-[71] size-1.5 rounded-full opacity-0 transition-opacity duration-300 will-change-transform"
      />
    </>
  );
}
