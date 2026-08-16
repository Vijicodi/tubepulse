import { cn } from "@/lib/utils";

/**
 * The gradient bloom behind the login panel.
 *
 * This is the "3D" in the design: not a WebGL scene, but layered radial fields
 * at different blur radii and drift speeds. Depth comes from parallax between
 * the layers, so it reads as volume while costing nothing to render — it is
 * three divs and a blur, and it is smooth on a phone.
 *
 * Purely decorative, so it is hidden from assistive technology.
 */
export function Aurora({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      {/* Base wash — sets the violet ground the other layers sit on. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 20% 15%, var(--brand-1) 0%, transparent 62%)," +
            "radial-gradient(100% 80% at 80% 85%, var(--brand-3) 0%, transparent 58%)",
          opacity: 0.85,
        }}
      />

      {/* Mid bloom — the magenta core, drifting slowly. */}
      <div
        className="animate-drift absolute top-1/4 left-1/3 h-[46rem] w-[46rem] -translate-x-1/2 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, var(--brand-2) 0%, transparent 68%)",
          opacity: 0.55,
          animationDuration: "22s",
        }}
      />

      {/* Foreground highlight — smaller, faster, offset. The speed difference
          between this and the layer above is what produces the parallax. */}
      <div
        className="animate-drift absolute right-1/4 bottom-1/5 h-[28rem] w-[28rem] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--brand-1) 70%, white) 0%, transparent 66%)",
          opacity: 0.4,
          animationDuration: "15s",
          animationDirection: "reverse",
        }}
      />

      {/* Fine grain, so the large gradients never band on a cheap panel. */}
      <div
        className="absolute inset-0 opacity-[0.16] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
