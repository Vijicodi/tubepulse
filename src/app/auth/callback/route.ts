import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback — where Google sends the user back.
 *
 * Google returns an authorization code. We exchange it for a Supabase session,
 * which writes the session cookies, then send the user where they were going.
 *
 * The exchange must happen server-side: it is the step that turns a public
 * redirect into an authenticated session, and doing it in the browser would
 * expose the code to any script on the page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/projects";
  const errorDescription = url.searchParams.get("error_description");

  if (errorDescription) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorDescription)}`, url.origin),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=Google%20did%20not%20return%20a%20code.", url.origin),
    );
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
    );
  }

  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/projects";
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
