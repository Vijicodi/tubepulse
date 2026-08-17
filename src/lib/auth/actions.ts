"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { OTP_LENGTH } from "./otp";
import { friendly } from "./messages";

/**
 * Auth server actions.
 *
 * These run on the server, so the browser never handles a Supabase admin call
 * and the session cookie is written by the server rather than by client JS.
 *
 * The sign-up flow deliberately uses a NUMERIC CODE rather than a magic link.
 * Supabase sends a link by default; the code is available in the same email
 * template as `{{ .Token }}`. See docs/auth-setup.md for the one template edit
 * that switches it over.
 *
 * The code's length is OTP_LENGTH in ./otp.ts and must match the Supabase
 * dashboard setting. Never inline the number here again.
 */

export type AuthResult = { error: string | null };

export async function signUpWithPassword(
  _prev: AuthResult,
  formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const next = safeNext(String(formData.get("next") ?? "/projects"));

  if (!email) return { error: "Enter your email address." };
  if (password.length < 8) {
    return { error: "Use at least 8 characters for your password." };
  }

  const supabase = await createServerClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: displayName ? { display_name: displayName } : undefined,
    },
  });

  if (error) return { error: friendly(error.message) };

  // Supabase does NOT error when the email already has an account. It returns
  // 200 with a fabricated user so that an attacker cannot use this endpoint to
  // discover which addresses are registered. The one honest signal is that
  // `identities` comes back EMPTY — a genuinely new sign-up has exactly one.
  //
  // Without this check the person is sent to the code screen for an email that
  // will never arrive, which is precisely the dead end that got reported.
  //
  // The trade: saying "already exists" does leak that an address is registered.
  // That is the ordinary bargain almost every consumer product makes, because
  // the alternative silently strands real people on a screen that cannot work.
  if (data.user && data.user.identities?.length === 0) {
    return {
      error: "An account with that email already exists. Log in instead, or reset your password.",
    };
  }

  // No session yet — the account is unconfirmed until the code is entered.
  // `next` rides along so verifying returns them where they were going. This
  // redirect used to drop it, which is why clicking Go Pro, signing up and
  // entering the code landed on /projects instead of back at checkout.
  redirect(
    `/login/verify?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`,
  );
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
  const next = safeNext(String(formData.get("next") ?? "/projects"));

  if (token.length !== OTP_LENGTH) {
    return { error: `Enter the ${OTP_LENGTH}-digit code from your email.` };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

  if (error) return { error: friendly(error.message) };

  redirect(next);
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

/**
 * Step one of a password reset: email a code.
 *
 * Always reports success, even for an address with no account. Reporting
 * "no such user" here would hand anyone a free membership oracle, and unlike
 * the sign-up case above there is no dead end being created — nobody is left
 * waiting on a screen that cannot work, because the code screen is reached
 * either way.
 */
export async function requestPasswordReset(
  _prev: AuthResult,
  formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  const supabase = await createServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);

  // Rate limiting is the one failure worth surfacing — it is actionable.
  if (error && /rate limit|too many/i.test(error.message)) {
    return { error: friendly(error.message) };
  }

  redirect(`/login/reset?email=${encodeURIComponent(email)}`);
}

/**
 * Step two: exchange the emailed code for a session, then set the password.
 *
 * `type: "recovery"` is what makes the code from the Reset Password template
 * valid here; "email" is for confirming a new sign-up and will not verify it.
 */
export async function resetPassword(
  _prev: AuthResult,
  formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim();
  const token = String(formData.get("code") ?? "").replace(/\D/g, "");
  const password = String(formData.get("password") ?? "");

  if (token.length !== OTP_LENGTH) {
    return { error: `Enter the ${OTP_LENGTH}-digit code from your email.` };
  }
  if (password.length < 8) {
    return { error: "Use at least 8 characters for your new password." };
  }

  const supabase = await createServerClient();

  const { error: verifyError } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "recovery",
  });
  if (verifyError) return { error: friendly(verifyError.message) };

  // verifyOtp leaves a session in place, which is what authorises the change.
  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) return { error: friendly(updateError.message) };

  redirect("/projects");
}

export async function signInWithGoogle(formData: FormData) {
  const next = safeNext(String(formData.get("next") ?? "/projects"));
  const origin = (await headers()).get("origin") ?? "http://localhost:3111";

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
