import { Landing } from "@/components/landing/landing";
import { LiquidCursor } from "@/components/landing/liquid-cursor";
import { Preloader } from "@/components/landing/preloader";
import { ScrollChoreography } from "@/components/landing/scroll-choreography";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { isSupabaseConfigured } from "@/lib/public-env";
import { getUser } from "@/lib/supabase/server";

/**
 * The root is the public landing page.
 *
 * It used to be a redirect to /login, back when there was no landing page to
 * show. Middleware no longer bounces signed-in visitors away from "/", so this
 * renders for everyone — and reads the session so the page can point an
 * already-signed-in visitor at their workspace instead of a sign-up form.
 *
 * Reading the session makes this route dynamic rather than statically
 * prerendered. That is a real cost for a marketing page, and it is paid
 * knowingly: middleware already calls getUser() on every request to "/" to
 * refresh the token, so the round trip happens either way.
 *
 * The four imports below are client islands, each doing one job, so a failure
 * in any one of them leaves a readable page rather than a blank screen:
 *
 *   Preloader          the intro curtain, driven by real load progress
 *   SmoothScroll       Lenis, bridged to GSAP's ticker
 *   ScrollChoreography every scroll-triggered animation, read from data attrs
 *   LiquidCursor       the glass cursor, pointer-fine devices only
 */
export default async function RootPage() {
  // Without Supabase configured there is no session to read, and getUser()
  // would throw on a missing URL. The landing page still renders — it is the
  // one page that works before any setup is done.
  const user = isSupabaseConfigured ? await getUser() : null;

  return (
    <>
      <Preloader />
      <SmoothScroll />
      <ScrollChoreography />
      <LiquidCursor />
      <Landing signedIn={Boolean(user)} />
    </>
  );
}
