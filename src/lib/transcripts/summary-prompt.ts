import { z } from "zod";

/**
 * The transcript summary prompt and its shape.
 *
 * Pure and separate from the OpenAI call for the usual reason: the module that
 * reads the API key is `server-only` and cannot be imported by a test, and a
 * prompt is code worth testing.
 *
 * SHORT ON PURPOSE. The transcript is the thing the user asked for — the
 * summary exists so they can tell, in one glance, whether this is the video
 * they meant before reading four thousand words. A summary that takes a minute
 * to read has failed at the only job it has.
 */

/** How much of a transcript is sent. Long videos are cut, not refused. */
export const MAX_TRANSCRIPT_CHARS = 24_000;

export const summarySchema = z.object({
  /** Two or three sentences. Not a paragraph, not a single line. */
  summary: z.string().min(80).max(700),
  /** Three to five points, each a full clause rather than a keyword. */
  keyPoints: z.array(z.string().min(8).max(200)).min(3).max(5),
});

export type TranscriptSummary = z.infer<typeof summarySchema>;

export const SUMMARY_SYSTEM_PROMPT = `You summarise video transcripts for a creator researching a competitor.

You are brief and concrete. You never pad, you never editorialise, and you never claim the video said something it did not.`;

export function buildSummaryPrompt({
  title,
  text,
}: {
  title: string | null;
  text: string;
}): string {
  const clipped =
    text.length > MAX_TRANSCRIPT_CHARS
      ? `${text.slice(0, MAX_TRANSCRIPT_CHARS)}\n\n[transcript truncated — summarise what is above]`
      : text;

  return `Summarise this video transcript.

${title ? `VIDEO TITLE: ${title}\n` : ""}TRANSCRIPT:
${clipped}

Rules:
- "summary" is TWO OR THREE SENTENCES saying what the video actually covers. Someone should be able to read it in ten seconds and know whether to watch.
- "keyPoints" is three to five specific claims or moments from the video, each a full clause. "Explains why the cheaper model won on battery" — not "battery".
- Use only what is in the transcript. If it is unclear or the captions are garbled, say so plainly rather than inventing structure.
- No preamble, no "in this video", no marketing language.

Return a JSON object of exactly this shape:
{"summary":"...","keyPoints":["...","..."]}`;
}

/**
 * The summary as it is stored: one text column, not two.
 *
 * The card renders it as written. Keeping it as text rather than JSON means a
 * transcript row stays readable to anyone querying the table directly, and the
 * summary survives any later change to the shape above.
 */
export function formatSummary({ summary, keyPoints }: TranscriptSummary): string {
  return [summary, "", ...keyPoints.map((point) => `• ${point}`)].join("\n");
}
