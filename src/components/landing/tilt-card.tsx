"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A glass panel that tilts in 3D toward the cursor.
 *
 * Real perspective, not a scale-up pretending to be depth: the card rotates on
 * two axes, a specular highlight tracks the pointer across its surface, and the
 * children can be pushed forward on the Z axis with `data-depth` so the panel
 * has actual layers rather than one flat face.
 *
 * All transform and custom-property writes — no layout, no paint of anything
 * expensive — so it stays smooth on a laptop trackpad.
 */
export function TiltCard({
  children,
  className,
  intensity = 8,
}: {
  children: React.ReactNode;
  className?: string;
  /** Maximum rotation in degrees. Above ~12 it stops reading as a surface. */
  intensity?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;

    // Y rotation follows horizontal movement, X rotation is inverted so the
    // card leans away from the cursor the way a physical panel would.
    el.style.setProperty("--rx", `${(0.5 - py) * intensity}deg`);
    el.style.setProperty("--ry", `${(px - 0.5) * intensity}deg`);
    el.style.setProperty("--px", `${px * 100}%`);
    el.style.setProperty("--py", `${py * 100}%`);
  }

  function onPointerLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }

  return (
    <div className="[perspective:1200px]">
      <div
        ref={ref}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        className={cn(
          "glass-liquid relative rounded-3xl transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          "[transform:rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] [transform-style:preserve-3d]",
          className,
        )}
      >
        <span className="glass-sheen" aria-hidden />

        {/* Specular highlight that follows the pointer across the glass.
            Uses Tailwind's named-group variant, not an arbitrary selector — the
            hand-written `[.group\/tilt:hover_&]` form emitted CSS that Turbopack
            refused to parse, and neither typecheck nor lint noticed. Only the
            build did. */}
        <span
          aria-hidden
          className="group-hover/tilt:opacity-100 pointer-events-none absolute inset-0 rounded-3xl opacity-0 transition-opacity duration-500"
          style={{
            background:
              "radial-gradient(340px circle at var(--px,50%) var(--py,50%), color-mix(in oklab, white 12%, transparent), transparent 65%)",
          }}
        />

        <div className="relative [transform:translateZ(28px)] [transform-style:preserve-3d]">
          {children}
        </div>
      </div>
    </div>
  );
}
