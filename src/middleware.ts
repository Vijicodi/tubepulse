import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv, isSupabaseConfigured } from "@/lib/public-env";

/**
 * Session refresh + route protection.
 *
 * Supabase access tokens are short-lived. Without this middleware they expire
 * mid-session and the user is silently signed out. It runs on every request,
 * refreshes the token, and writes the new cookies onto the response.
 *
 * It also decides who may see what:
 *   - not signed in, asking for a workspace page  → /login
 *   - signed in, asking for /login                → /projects
 *   - signed in, asking for "/"                   → left alone; the landing
 *     page is public and adapts its own nav
 *
 * Doing the redirect here rather than in each page means a new page cannot
 * forget to protect itself.
 */

const WORKSPACE_PREFIXES = [
  "/projects",
  "/project",
  "/competitors",
  "/outliers",
  "/idea-lab",
  "/saved-ideas",
  "/transcript",
  "/channels",
  "/billing",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Without Supabase configured there is no session to read. Let everything
  // through so the app is still browsable while you are setting keys up.
  if (!isSupabaseConfigured) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalidates the token with Supabase. Do not swap it for
  // getSession(), which trusts the cookie without checking it.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isWorkspace = WORKSPACE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!user && isWorkspace) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Only /login bounces a signed-in user onward. "/" is the public landing
  // page and stays readable while signed in — it swaps its own nav to point at
  // the workspace. Redirecting it meant the marketing page was unreachable by
  // the one person most likely to want to look at it.
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/projects";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and images.
    "/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
