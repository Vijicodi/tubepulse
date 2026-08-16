"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Auth server actions.
 *
 * These run on the server, so the browser never handles a Supabase admin call
 * and the session cookie is written by the server rather than by client JS.
 *
 * The sign-up flow deliberately uses a SIX-DIGIT CODE rather than a magic link.
 * Supabase sends a link by default; the code is available in the same email
 * template as `{{ .Token }}`. See docs/auth-setup.md for the one template edit
 * that switches it over.
 */

export type AuthResult = { error: string | null };

export async function signUpWithPassword(
  _prev: AuthResult,
  formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!email) return { error: "Enter your email address." };
  if (password.length < 8) {
    return { error: "Use at least 8 characters for your password." };
  }

  const supabase = await createServerClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: displayName ? { display_name: displayName } : undefined,
    },
  });

  if (error) return { error: friendly(error.message) };

  // No session yet — the account is unconfirmed until the code is entered.
  redirect(`/login/verify?email=${encodeURIComponent(email)}`);
}

export async function signInWithPassword(
  _prev: AuthResult,
  formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/projects");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Supabase returns the same message for "wrong password" and "not
    // confirmed" in some configurations. Point unconfirmed users at the code.
    if (/confirm/i.test(error.message)) {
      redirect(`/login/verify?email=${encodeURIComponent(email)}`);
    }
    return { error: friendly(error.message) };
  }

  redirect(safeNext(next));
}

export async function verifyEmailCode(
  _prev: AuthResult,
  formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim();
  const token = String(formData.get("code") ?? "").replace(/\D/g, "");

  if (token.length !== 6) return { error: "Enter the 6-digit code from your email." };

  const supabase = await createServerClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

  if (error) return { error: friendly(error.message) };

  redirect("/projects");
}

export async function resendCode(
  _prev: AuthResult,
  formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  const supabase = await createServerClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });

  if (error) return { error: friendly(error.message) };
  return { error: null };
}

export async function signInWithGoogle(formData: FormData) {
  const next = safeNext(String(formData.get("next") ?? "/projects"));
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";

  const supabase = await createServerClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });

  if (error || !data.url) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "Google sign-in is unavailable.")}`);
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Only ever redirect within this app — never to a URL an attacker supplied. */
function safeNext(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/projects";
}

/** Supabase messages are terse and sometimes leak internals. Say what to do. */
function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return "That email and password do not match an account.";
  }
  if (/already registered/i.test(message)) {
    return "An account with that email already exists. Try logging in instead.";
  }
  if (/token has expired|expired/i.test(message)) {
    return "That code has expired. Send yourself a new one.";
  }
  if (/invalid.*(token|otp)/i.test(message)) {
    return "That code is not right. Check the email and try again.";
  }
  if (/rate limit|too many/i.test(message)) {
    return "Too many attempts. Wait a minute and try again.";
  }
  return message;
}
