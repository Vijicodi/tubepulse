import { z } from "zod";

/**
 * The trust boundary for transcript actor output.
 *
 * Raw scraper output never reaches the database — see
 * `docs/decisions/0003-normalize-at-the-boundary.md`. This is the transcript
 * half of that rule.
 *
 * WHY THIS IS UNUSUALLY FORGIVING. There is no agreed shape for a transcript
 * actor. Across the ones on Apify the same data comes back as any of:
 *
 *   { transcript: "one long string" }
 *   { transcript: [{ text, start, dur }, ...] }
 *   { captions: [{ text, offset }, ...] }
 *   { segments: [{ text }, ...] }
 *   { data: { transcript: ... } }
 *
 * ...and a run may return one item holding everything, or one item per caption
 * line. So the schema accepts the union and `normalizeTranscript` flattens it.
 * Being strict here would mean the feature breaks the day you switch actors,
 * which is exactly the day you would want it to keep working.
 *
 * `.nullish()`, never `.optional()`: Apify actors return `null` where you
 * expect a missing key, and a test already caught that dropping valid rows.
 */

const segmentSchema = z.looseObject({
  text: z.string().nullish(),
  // Some actors call it `start`, some `offset`, some `startMs`. Only used to
  // keep lines in order when the actor does not already.
  start: z.union([z.number(), z.string()]).nullish(),
  offset: z.union([z.number(), z.string()]).nullish(),
  duration: z.union([z.number(), z.string()]).nullish(),
});

/** One dataset item. Every field is optional because every actor disagrees. */
export const rawTranscriptItemSchema = z.looseObject({
  videoId: z.string().nullish(),
  video_id: z.string().nullish(),
  url: z.string().nullish(),
  inputUrl: z.string().nullish(),
  videoUrl: z.string().nullish(),
  title: z.string().nullish(),
  videoTitle: z.string().nullish(),
  language: z.string().nullish(),
  languageCode: z.string().nullish(),
  lang: z.string().nullish(),

  // An actor can report a problem as a perfectly successful run whose dataset
  // holds nothing but this. See `transcriptError` below — surfacing it is the
  // difference between "captions are disabled on that video" and the truth.
  errorCode: z.string().nullish(),
  error: z.string().nullish(),

  // supreme_coder nests the useful metadata one level down.
  videoDetails: z
    .looseObject({
      videoId: z.string().nullish(),
      title: z.string().nullish(),
      isLiveContent: z.boolean().nullish(),
      isPrivate: z.boolean().nullish(),
    })
    .nullish(),

  // The transcript itself, in any of the shapes described above.
  transcript: z.union([z.string(), z.array(segmentSchema)]).nullish(),
  captions: z.array(segmentSchema).nullish(),
  segments: z.array(segmentSchema).nullish(),
  text: z.string().nullish(),
  data: z
    .looseObject({
      transcript: z.union([z.string(), z.array(segmentSchema)]).nullish(),
    })
    .nullish(),
});

export type RawTranscriptItem = z.infer<typeof rawTranscriptItemSchema>;

export interface NormalizedTranscript {
  videoId: string | null;
  title: string | null;
  language: string | null;
  text: string;
  wordCount: number;
}

/** Pull the segment list out of whichever key this actor decided to use. */
function segmentsOf(item: RawTranscriptItem): { text: string; order: number }[] {
  const candidates =
    (Array.isArray(item.transcript) ? item.transcript : null) ??
    item.captions ??
    item.segments ??
    (Array.isArray(item.data?.transcript) ? item.data.transcript : null) ??
    [];

  return candidates
    .map((segment, index) => ({
      text: (segment.text ?? "").trim(),
      order: numberish(segment.start ?? segment.offset) ?? index,
    }))
    .filter((segment) => segment.text !== "");
}

/** A plain string transcript, under whichever key holds it. */
function stringOf(item: RawTranscriptItem): string | null {
  if (typeof item.transcript === "string") return item.transcript;
  if (typeof item.data?.transcript === "string") return item.data.transcript;
  if (typeof item.text === "string") return item.text;
  return null;
}

function numberish(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Caption text arrives HTML-escaped.
 *
 * Real output from the actor: `♪ We&#39;re no strangers to love ♪`. Stored
 * as-is, every apostrophe in a transcript reads as `&#39;` on screen and, worse,
 * goes to the summariser that way. YouTube escapes ampersands, quotes and
 * apostrophes; numeric entities cover the rest.
 */
export function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return text
    // Numeric, decimal and hex: &#39; and &#x27;
    .replace(/&#(x?)([0-9a-fA-F]+);/g, (whole, hex, code) => {
      const point = Number.parseInt(code, hex ? 16 : 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : whole;
    })
    // Named, and &amp; last would double-decode, so it is handled in one pass.
    .replace(/&([a-zA-Z]+);/g, (whole, name: string) => named[name.toLowerCase()] ?? whole);
}

/**
 * The actor's own complaint, if that is all the dataset holds.
 *
 * A run that rejects its input still SUCCEEDS — it just writes
 * `{ errorCode: "NO_VIDEOS_FOUND", error: "..." }` and stops. Reporting that as
 * "no captions came back for that video" sends you looking at the video, which
 * is the one place the problem is not.
 */
export function transcriptError(items: unknown[]): string | null {
  for (const item of items) {
    const parsed = rawTranscriptItemSchema.safeParse(item);
    if (!parsed.success) continue;

    const { error, errorCode } = parsed.data;
    if (error || errorCode) {
      return error ?? `The transcript actor reported ${errorCode}.`;
    }
  }

  return null;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Flatten a whole run into one transcript.
 *
 * Handles both layouts: one item containing everything, and one item per
 * caption line. Items that parse to nothing are skipped rather than failing the
 * run — a single malformed line should not lose a ten-minute transcript.
 */
export function normalizeTranscript(items: unknown[]): NormalizedTranscript {
  const parsed = items
    .map((item) => rawTranscriptItemSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);

  const pieces: string[] = [];
  let videoId: string | null = null;
  let title: string | null = null;
  let language: string | null = null;

  for (const item of parsed) {
    videoId ??=
      item.videoDetails?.videoId ??
      item.videoId ??
      item.video_id ??
      idFromUrl(item.videoUrl ?? item.url ?? item.inputUrl);
    title ??= item.videoDetails?.title ?? item.title ?? item.videoTitle ?? null;
    // languageCode first: "en" is the BCP-47 the column documents, "English" is
    // a display name that no code can do anything with.
    language ??= item.languageCode ?? item.language ?? item.lang ?? null;

    const segments = segmentsOf(item);

    if (segments.length > 0) {
      pieces.push(
        ...segments.sort((a, b) => a.order - b.order).map((segment) => segment.text),
      );
      continue;
    }

    const whole = stringOf(item);
    if (whole !== null && whole.trim() !== "") pieces.push(whole.trim());
  }

  // Captions arrive as fragments that were never sentences. Joining on a single
  // space and collapsing runs is what turns them back into readable prose.
  const text = decodeEntities(pieces.join(" ")).replace(/\s+/g, " ").trim();

  return { videoId, title, language, text, wordCount: countWords(text) };
}

/** The `v=` id, or the last path segment for a youtu.be link. */
export function idFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const v = parsed.searchParams.get("v");
    if (v) return v;

    const last = parsed.pathname.split("/").filter(Boolean).pop();
    return last ?? null;
  } catch {
    return null;
  }
}
