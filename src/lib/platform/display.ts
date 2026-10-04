import { parseTarget, type Platform } from "./parse";

/**
 * How an account is named in a sentence the user has to say yes to.
 *
 * Stored handles are not uniform — YouTube keeps "@mkbhd", Instagram rows and
 * older YouTube rows can be a bare "nasa", and a channel saved by id is
 * "UC…". A confirm that reads "Remove @@mkbhd?" or "Remove @UCx…?" looks like
 * the app does not know what it is about to delete, so one place decides.
 */
export function atHandle(handle: string): string {
  const trimmed = handle.trim();
  if (trimmed === "") return trimmed;
  if (trimmed.startsWith("@")) return trimmed;

  // A URL, a YouTube channel id or a phrase is not a handle; an "@" in front
  // of any of them would invent one.
  if (/[\s/]/.test(trimmed) || /^UC[\w-]{22}$/.test(trimmed)) return trimmed;

  return `@${trimmed}`;
}

/**
 * What the voice agent heard, as the handle the research route will use.
 *
 * Run through the same parser the route runs, so the button names the account
 * that would actually be scraped — not the raw transcript, which can be a URL.
 * Falls back to the raw text when the parser refuses it; the route will refuse
 * it too, and saying what was heard is more useful than saying nothing.
 */
export function spokenTargetLabel(channel: string, platform: Platform): string {
  try {
    return atHandle(parseTarget(channel, platform).handle);
  } catch {
    return atHandle(channel);
  }
}
