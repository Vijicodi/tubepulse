import Image from "next/image";
import wordmark from "@/../public/brand/tubepulse-wordmark.png";
import { cn } from "@/lib/utils";

/**
 * The TubePulse brand.
 *
 * This renders the supplied artwork in `public/brand/` and nothing else. An
 * earlier version redrew the mark as SVG so it could be recoloured and
 * animated; that was the wrong call — the logo is the one thing in the design
 * that is not ours to reinterpret.
 *
 * The file is a wide lockup (mark + wordmark, 2172x724, exactly 3:1) with
 * "Tube" in white, so it is designed for dark grounds. Statically imported, so
 * Next reads the real dimensions at build time and reserves the right space —
 * no layout shift.
 *
 * WHY quality={100}. Next re-encodes images at quality 75 by default, which is
 * fine for a photograph and visibly wrong for a logo: this mark is a smooth
 * violet-to-red gradient, and lossy compression puts banding and mush straight
 * through it. It rendered soft in the sidebar for exactly that reason. A logo
 * is the one image on the page nobody should have to look at twice, and at
 * these dimensions the extra bytes are trivial.
 *
 * `sizes` is a PROP rather than a constant, because this same artwork is drawn
 * at 32px tall in the sidebar and 200px wide in the preloader. One shared
 * `sizes` string meant every placement asked for the wrong resolution — too
 * little for the big one, and needlessly much for the small.
 */

export function BrandWordmark({
  className,
  priority = false,
  /** CSS width of the largest place this instance is drawn. Drives the srcset. */
  sizes = "240px",
}: {
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <Image
      src={wordmark}
      alt="TubePulse"
      priority={priority}
      sizes={sizes}
      quality={100}
      className={cn("h-auto w-auto select-none", className)}
    />
  );
}

/**
 * Wordmark plus an optional line underneath, for the sidebar.
 * The subtitle is ours; the artwork above it is not touched.
 */
export function LogoLockup({
  className,
  subtitle,
}: {
  className?: string;
  subtitle?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {/* ~96px wide on screen; ask for 192 so a 2x display has real pixels. */}
      <BrandWordmark className="max-h-8 w-auto" sizes="192px" priority />
      {subtitle && (
        <span className="text-muted-foreground pl-0.5 text-[0.7rem]">{subtitle}</span>
      )}
    </div>
  );
}
