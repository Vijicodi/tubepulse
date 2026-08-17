"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Real depth, not decoration.
 *
 * The card leans very slightly toward the pointer and lifts a highlight with
 * it. That is the "3D" here — perspective you can feel on something you were
 * already looking at — rather than an abstract particle field floating behind
 * the data, which reads as noise nobody can interpret.
 *
 * DELIBERATELY RESTRAINED: 6 degrees, and the transition is short. This is a
 * tool that stays open all day; a card that wobbles is charming once and
 * irritating by Thursday.
 *
 * TOUCH DEVICES GET NOTHING. There is no pointer to follow, and a tilt that
 * fires on tap feels like a bug. `pointerType` is checked rather than screen
 * width, because a small laptop still has a mouse.
 *
 * No JavaScript runs until the pointer is actually over the card, and the
 * transform is written straight to style — no React state, so moving the mouse
 * never triggers a render.
 */
export function Tilt({
  children,
  className,
  /** Maximum lean, in degrees. */
  max = 6,
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const allowed = useRef(true);

  function handleMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") {
      allowed.current = false;
      return;
    }

    const element = ref.current;
    if (!element || !allowed.current) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const bounds = element.getBoundingClientRect();
    // -0.5 … 0.5 from the centre of the card.
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;

    element.style.transform = `perspective(900px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg) translateZ(0)`;
    element.style.setProperty("--tilt-x", `${(x * 100 + 50).toFixed(1)}%`);
    element.style.setProperty("--tilt-y", `${(y * 100 + 50).toFixed(1)}%`);
  }

  function reset() {
    const element = ref.current;
    if (!element) return;
    element.style.transform = "";
  }

  return (
    <div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={reset}
      className={cn(
        // group-hover/tilt: the NAMED variant. Never hand-write a group
        // selector like [.group\/tilt:hover_&]: — it emits CSS Turbopack
        // refuses to parse, and it fails the build while passing typecheck
        // and lint. See the trap in AGENTS.md.
        "group/tilt relative transition-transform duration-200 ease-out will-change-transform",
        className,
      )}
    >
      {/* The highlight follows the pointer, which is what sells the depth. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-200 group-hover/tilt:opacity-100"
        style={{
          background:
            "radial-gradient(340px circle at var(--tilt-x, 50%) var(--tilt-y, 50%), color-mix(in oklab, var(--brand-2) 14%, transparent), transparent 65%)",
        }}
      />
      {children}
    </div>
  );
}
