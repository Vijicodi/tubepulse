import {
  InvalidChannelInputError,
  parseChannelInput,
} from "@/lib/youtube/channel-url";
import {
  InvalidProfileInputError,
  parseProfileInput,
} from "@/lib/instagram/profile-url";

/**
 * One paste box, two platforms.
 *
 * THE URL WINS OVER THE TOGGLE. If someone pastes an instagram.com link while
 * the selector still says YouTube, the obvious intent is Instagram — refusing
 * it to defend a dropdown would be the app being right at the user's expense.
 * The selector only decides the ambiguous case, which is a bare handle:
 * "@nasa" is a valid username on both.
 *
 * Pure, so every branch below is testable without a network or a database.
 */

export type Platform = "youtube" | "instagram";

export interface ParsedTarget {
  platform: Platform;
  /** Canonical handle, e.g. "@mkbhd" or "@nasa". */
  handle: string;
  /** Canonical URL handed to the scraper. */
  url: string;
}

export function isPlatform(value: unknown): value is Platform {
  return value === "youtube" || value === "instagram";
}

/** Which platform a string names, or null when it does not name one. */
export function platformFromInput(input: string): Platform | null {
  const trimmed = input.trim().toLowerCase();

  if (/(^|\/\/|\.)instagram\.com(\/|$)/.test(trimmed)) return "instagram";
  if (/(^|\/\/|\.)youtube\.com(\/|$)/.test(trimmed)) return "youtube";
  if (/(^|\/\/|\.)youtu\.be(\/|$)/.test(trimmed)) return "youtube";

  return null;
}

export function parseTarget(input: string, fallback: Platform = "youtube"): ParsedTarget {
  const platform = platformFromInput(input) ?? fallback;

  if (platform === "instagram") {
    const parsed = parseProfileInput(input);
    return { platform, handle: parsed.handle, url: parsed.profileUrl };
  }

  const parsed = parseChannelInput(input);
  return { platform, handle: parsed.handle, url: parsed.channelUrl };
}

/** True for the two errors the parsers throw, so a route can answer 400. */
export function isInvalidTargetError(error: unknown): error is Error {
  return (
    error instanceof InvalidChannelInputError || error instanceof InvalidProfileInputError
  );
}
