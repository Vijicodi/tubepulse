/**
 * Turning whatever the user pasted into something we can scrape.
 *
 * People paste all of these and expect them to work:
 *   @mkbhd
 *   mkbhd
 *   youtube.com/@mkbhd
 *   https://www.youtube.com/@mkbhd/videos
 *   https://youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ
 *
 * Pure function, no I/O — which is why it is trivially testable and why the
 * tests for it are the cheapest quality we own.
 */

export interface ParsedChannel {
  /** Canonical handle, e.g. "@mkbhd", or the raw channel id for /channel/ URLs. */
  handle: string;
  /** Canonical URL we hand to the scraper. */
  channelUrl: string;
}

export class InvalidChannelInputError extends Error {
  constructor(input: string) {
    super(
      `Could not read a YouTube channel from "${input}". ` +
        `Try a handle like @mkbhd or a full channel URL.`,
    );
    this.name = "InvalidChannelInputError";
  }
}

const HANDLE_PATTERN = /^@?([A-Za-z0-9._-]{3,30})$/;
const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;

export function parseChannelInput(input: string): ParsedChannel {
  const trimmed = input.trim();
  if (trimmed === "") throw new InvalidChannelInputError(input);

  // A bare channel id.
  if (CHANNEL_ID_PATTERN.test(trimmed)) {
    return {
      handle: trimmed,
      channelUrl: `https://www.youtube.com/channel/${trimmed}`,
    };
  }

  // A bare handle, with or without the @.
  if (!trimmed.includes("/") && HANDLE_PATTERN.test(trimmed)) {
    const handle = `@${trimmed.replace(/^@/, "")}`;
    return { handle, channelUrl: `https://www.youtube.com/${handle}` };
  }

  // Something URL-shaped.
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new InvalidChannelInputError(input);
  }

  if (!/(^|\.)youtube\.com$/i.test(url.hostname) && !/(^|\.)youtu\.be$/i.test(url.hostname)) {
    throw new InvalidChannelInputError(input);
  }

  const segments = url.pathname.split("/").filter(Boolean);

  const handleSegment = segments.find((segment) => segment.startsWith("@"));
  if (handleSegment && HANDLE_PATTERN.test(handleSegment)) {
    return {
      handle: handleSegment,
      channelUrl: `https://www.youtube.com/${handleSegment}`,
    };
  }

  const channelIndex = segments.indexOf("channel");
  if (channelIndex !== -1) {
    const id = segments[channelIndex + 1];
    if (id && CHANNEL_ID_PATTERN.test(id)) {
      return { handle: id, channelUrl: `https://www.youtube.com/channel/${id}` };
    }
  }

  // Legacy /c/name and /user/name forms.
  for (const prefix of ["c", "user"]) {
    const index = segments.indexOf(prefix);
    if (index !== -1) {
      const name = segments[index + 1];
      if (name && HANDLE_PATTERN.test(name)) {
        return {
          handle: `@${name}`,
          channelUrl: `https://www.youtube.com/${prefix}/${name}`,
        };
      }
    }
  }

  throw new InvalidChannelInputError(input);
}
