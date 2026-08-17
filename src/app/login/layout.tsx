import { Aurora } from "@/components/brand/aurora";
import { BrandWordmark } from "@/components/brand/logo";

/**
 * The split login shell.
 *
 * Left: the brand statement over the animated gradient bloom.
 * Right: whatever auth step we are on (credentials, or the 6-digit code).
 *
 * On phones the left panel collapses to a compact header so the form is above
 * the fold rather than below a full-height decoration.
 */
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Brand side */}
      <section className="relative isolate flex flex-col justify-between overflow-hidden px-8 py-8 text-white lg:px-14 lg:py-14">
        <Aurora />

        <div className="relative">
          <BrandWordmark className="max-h-9 w-auto" sizes="140px" priority />
        </div>

        <div className="relative max-w-lg py-12 lg:py-0">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium backdrop-blur-sm">
            Research that answers back
          </span>

          <h2 className="mt-6 text-4xl leading-[1.05] font-semibold tracking-tight text-balance lg:text-5xl">
            Borrow the pattern.
            Never the video.
          </h2>

          <p className="mt-5 max-w-md text-base text-white/80">
            Competitor research, outlier discovery and video ideas that arrive
            with their homework already done.
          </p>
        </div>

        <p className="relative text-xs text-white/65">
          Your research stays yours — enforced by row-level security, not by a promise
        </p>
      </section>

      {/* Form side */}
      <section className="bg-background flex items-center justify-center px-6 py-12 lg:px-10">
        {children}
      </section>
    </div>
  );
}
