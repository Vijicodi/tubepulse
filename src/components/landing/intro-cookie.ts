/**
 * Cookie that marks the landing intro as seen.
 *
 * Its own module because the page (a server component) reads it and the
 * Preloader (a client component) writes it. Exported from the "use client"
 * file, the server would receive a client reference, not the string.
 */
export const INTRO_SEEN_COOKIE = "tp-intro-seen";
