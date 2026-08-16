import { redirect } from "next/navigation";

/**
 * The root is a router, not a page.
 *
 * Middleware sends signed-in visitors to /projects before this runs. Anyone who
 * reaches here is signed out, or Supabase is not configured yet — either way,
 * /login is where they need to be.
 */
export default function RootPage() {
  redirect("/login");
}
