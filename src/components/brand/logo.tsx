import { cn } from "@/lib/utils";

/**
 * The TubePulse mark, drawn as vector rather than loaded as an image.
 *
 * Why not the PNG: the mark appears at 28px in the sidebar and 200px on the
 * login screen, needs to sit on both dark and light grounds, and needs to glow.
 * An SVG scales without blur, takes its gradient from brand tokens, and can be
 * animated. The PNG in /public/brand is kept for og-images and README use.
 *
 * The gradient — violet → magenta → red — is the brand. It is defined once
 * here and referenced everywhere else through CSS custom properties.
 */

export function LogoMark({
  className,
  glow = false,
}: {
  className?: string;
  glow?: boolean;
}) {
  const gradientId = glow ? "tp-mark-glow" : "tp-mark";

  return (
    <svg
      viewBox="0 0 120 120"
      role="img"
      aria-label="TubePulse"
      className={cn("block", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="18" y1="12" x2="96" y2="112" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--brand-1)" />
          <stop offset="52%" stopColor="var(--brand-2)" />
          <stop offset="100%" stopColor="var(--brand-3)" />
        </linearGradient>
      </defs>

      {/* The P: a slab that shears from the top-left, wraps into the bowl, and
          drops a second sheared foot — the pulse. Drawn as two filled paths so
          the counter of the bowl stays crisp at any size. */}
      <path
        d="M30 16 H74 a30 30 0 0 1 0 60 H46 l14 -22 h14 a8 8 0 0 0 0 -16 H16 Z"
        fill={`url(#${gradientId})`}
      />
      <path
        d="M40 82 H74 L58 104 H24 Z"
        fill={`url(#${gradientId})`}
        opacity="0.92"
      />
    </svg>
  );
}

export function LogoLockup({
  className,
  markClassName,
  subtitle,
}: {
  className?: string;
  markClassName?: string;
  subtitle?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className={cn("size-8 shrink-0", markClassName)} />
      <div className="min-w-0 leading-tight">
        <div className="text-[0.95rem] font-semibold tracking-tight">
          Tube<span className="text-brand-gradient">Pulse</span>
        </div>
        {subtitle && (
          <div className="text-muted-foreground truncate text-[0.7rem]">{subtitle}</div>
        )}
      </div>
    </div>
  );
}
