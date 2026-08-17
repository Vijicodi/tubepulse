/**
 * Turning Supabase's auth errors into something a person can act on.
 *
 * Pure and separate from actions.ts because that file is `"use server"`, which
 * may only export async functions — so this could not be exported, and
 * therefore could not be tested. It went untested and shipped a bug: see the
 * "expired or is invalid" case below.
 */

export function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return "That email and password do not match an account.";
  }
  if (/already registered/i.test(message)) {
    return "An account with that email already exists. Try logging in instead.";
  }
  // Supabase returns the single string "Token has expired or is invalid" for
  // both a wrong code and a stale one, so we cannot tell them apart. Say so,
  // rather than asserting "expired" and sending someone to hunt the wrong
  // problem. Order matters: test this combined form before the plain /expired/.
  if (/expired or is invalid|invalid or has expired/i.test(message)) {
    return "That code is wrong or has expired. Check the email, or send yourself a new one.";
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
