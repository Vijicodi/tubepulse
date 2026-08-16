import { Aurora } from "@/components/brand/aurora";
import { LogoMark } from "@/components/brand/logo";

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

        <div className="relative flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-full bg-white/15 backdrop-blur-sm">
            <LogoMark className="size-5" />
          </span>
          <span className="text-[0.95rem] font-semibold tracking-tight">TubePulse</span>
        </div>

        <div className="relative max-w-lg py-12 lg:py-0">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium backdrop-blur-sm">
            Voice-first creator intelligence
          </span>

          <h2 className="mt-6 text-4xl leading-[1.05] font-semibold tracking-tight text-balance lg:text-5xl">
            Find the signal. Shape the idea. Say it out loud.
          </h2>

          <p className="mt-5 max-w-md text-base text-white/80">
            A conversational workspace for competitor research, outlier discovery,
            and evidence-backed video ideas.
          </p>
        </div>

        <p className="relative text-xs text-white/65">
          Private workspaces protected by Supabase authentication
        </p>
      </section>

      {/* Form side */}
      <section className="bg-background flex items-center justify-center px-6 py-12 lg:px-10">
        {children}
      </section>
    </div>
  );
}
