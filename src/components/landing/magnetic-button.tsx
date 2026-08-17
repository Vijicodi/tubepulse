"use client";

import Link from "next/link";
import { useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The landing page's button.
 *
 * Three things happen on hover, and it needs all three to feel expensive:
 *
 *   1. Magnetism — the button leans toward the cursor and the label leans
 *      further, so it has a sense of mass.
 *   2. A specular sweep that follows the pointer across the glass, tracked as
 *      CSS custom properties so the paint stays on the compositor.
 *   3. The brand gradient blooming out from where the pointer entered.
 *
 * It composes around shadcn's Button rather than editing it — `components/ui/`
 * gets overwritten by the CLI, and this behaviour is ours, not shadcn's.
 *
 * Renders a <Link> when given an `href` and a <button> when given an `onClick`.
 * The pricing page needs both: "Start free" navigates, while "Go Pro" opens the
 * Razorpay window in place. A link that opens a modal is a lie to anyone using
 * a keyboard or a screen reader, so the element follows the behaviour.
 */

export function MagneticButton({
  href,
  onClick,
  disabled = false,
  children,
  variant = "solid",
  className,
}: {
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: "solid" | "glass";
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const wrap = wrapRef.current;
    const label = labelRef.current;
    if (!wrap || !label) return;

    const rect = wrap.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Offsets from centre, normalised to roughly -1..1.
    const dx = (x - rect.width / 2) / (rect.width / 2);
    const dy = (y - rect.height / 2) / (rect.height / 2);

    wrap.style.transform = `translate3d(${dx * 8}px, ${dy * 5}px, 0)`;
    label.style.transform = `translate3d(${dx * 4}px, ${dy * 3}px, 0)`;

    // Feed the sheen position to CSS rather than animating it in JS.
    wrap.style.setProperty("--px", `${(x / rect.width) * 100}%`);
    wrap.style.setProperty("--py", `${(y / rect.height) * 100}%`);
  }

  function onPointerLeave() {
    const wrap = wrapRef.current;
    const label = labelRef.current;
    if (!wrap || !label) return;
    wrap.style.transform = "translate3d(0,0,0)";
    label.style.transform = "translate3d(0,0,0)";
  }

  const surface = cn(
    "group relative isolate inline-flex h-14 items-center justify-center overflow-hidden rounded-full px-9 text-sm font-semibold tracking-tight",
    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent focus-visible:outline-none",
    "disabled:cursor-not-allowed disabled:opacity-60",
    variant === "solid" ? "text-white" : "glass-liquid text-foreground",
    className,
  );

  const inner = (
    <>
      {/* Solid: the brand gradient as the base layer. */}
      {variant === "solid" && (
        <span aria-hidden className="bg-brand-gradient absolute inset-0 -z-10" />
      )}

      {/* The bloom that follows the pointer. Radial, centred on --px/--py. */}
      <span
        aria-hidden
        className="absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(140px circle at var(--px,50%) var(--py,50%), color-mix(in oklab, white 34%, transparent), transparent 70%)",
        }}
      />

      {/* A hairline that catches light along the top edge. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent"
      />

      <span ref={labelRef} className="relative transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]">
        {children}
      </span>
    </>
  );

  return (
    <div
      ref={wrapRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className="inline-block transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform"
    >
      {href ? (
        <Link href={href} data-cursor-grow className={surface}>
          {inner}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          data-cursor-grow
          className={surface}
        >
          {inner}
        </button>
      )}
    </div>
  );
}
