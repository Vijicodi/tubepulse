/**
 * Turning whatever the user pasted into an Instagram profile we can scrape.
 *
 * People paste all of these and expect them to work:
 *   @nasa
 *   nasa
 *   instagram.com/nasa
 *   https://www.instagram.com/nasa/
 *   https://instagram.com/nasa/reels/
 *
 * Pure function, no I/O — the same reason the YouTube parser is pure, and the
 * same cheap quality.
 *
 * HASHTAG AND LOCATION URLS ARE REJECTED, deliberately. The actor accepts them
 * and would happily scrape a tag feed, but this product researches competitors —
 * a hashtag is not a competitor, and its posts belong to hundreds of accounts
 * whose median means nothing.
 */

export interface ParsedProfile {
  /** Canonical handle, always with the @. */
  handle: string;
  /** Canonical URL handed to the scraper. */
  profileUrl: string;
  /** The bare username, which is what appears in the actor's output. */
  username: string;
}

export class InvalidProfileInputError extends Error {
  constructor(input: string, reason?: string) {
    super(
      reason ??
        `Could not read an Instagram profile from "${input}". ` +
          `Try a handle like @nasa or a full profile URL.`,
    );
    this.name = "InvalidProfileInputError";
  }
}

/** Instagram usernames: letters, digits, dots and underscores, up to 30. */
const USERNAME_PATTERN = /^@?([A-Za-z0-9._]{1,30})$/;

/**
 * Path segments that are Instagram's own, not a username. `/p/` and `/reel/`
 * point at a single post; the rest are feeds or app pages.
 */
const RESERVED = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "stories",
  "explore",
  "accounts",
  "direct",
  "about",
  "developer",
  "legal",
  "privacy",
  "terms",
]);

export function parseProfileInput(input: string): ParsedProfile {
  const trimmed = input.trim();
  if (trimmed === "") throw new InvalidProfileInputError(input);

  // A bare handle, with or without the @.
  if (!trimmed.includes("/") && USERNAME_PATTERN.test(trimmed)) {
    return profile(trimmed.replace(/^@/, ""));
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new InvalidProfileInputError(input);
  }

  if (!/(^|\.)instagram\.com$/i.test(url.hostname)) {
    throw new InvalidProfileInputError(input);
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const first = segments[0];

  if (!first) throw new InvalidProfileInputError(input);

  if (first === "explore") {
    throw new InvalidProfileInputError(
      input,
      "That is a hashtag or location feed, not an account. TubePulse researches " +
        "competitors, and a tag's posts belong to hundreds of accounts whose " +
        "median means nothing. Paste a profile instead.",
    );
  }

  if (first === "p" || first === "reel" || first === "tv") {
    throw new InvalidProfileInputError(
      input,
      "That link points at a single post, not an account. Paste the profile it " +
        "belongs to — for example instagram.com/nasa.",
    );
  }

  if (RESERVED.has(first.toLowerCase()) || !USERNAME_PATTERN.test(first)) {
    throw new InvalidProfileInputError(input);
  }

  return profile(first);
}

function profile(username: string): ParsedProfile {
  return {
    username,
    handle: `@${username}`,
    profileUrl: `https://www.instagram.com/${username}/`,
  };
}
