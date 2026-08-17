/**
 * How many digits the email confirmation code has.
 *
 * This MUST match the Supabase dashboard setting at
 * Authentication → Sign In / Providers → Email → "Email OTP Length".
 * Supabase generates the code; this app only validates and renders it. When the
 * two disagree the code simply cannot be entered, and nothing warns you — the
 * box is one digit short and the error blames the code.
 *
 * It lives here because the number was previously repeated in six places across
 * the server action and the verify panel, which is exactly how it drifted.
 */
export const OTP_LENGTH = 6;

/** Indexes for rendering one input slot per digit. */
export const OTP_SLOTS = Array.from({ length: OTP_LENGTH }, (_, i) => i);
