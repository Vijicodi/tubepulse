import "server-only";
import OpenAI from "openai";
import { serverEnv } from "@/lib/env";
import { safeJsonParse } from "@/lib/ideas/generate";
import {
  buildSummaryPrompt,
  formatSummary,
  summarySchema,
  SUMMARY_SYSTEM_PROMPT,
} from "./summary-prompt";

/**
 * The short pass over a transcript.
 *
 * RETURNS NULL RATHER THAN THROWING. The transcript is what the user pressed
 * the button for and it is already extracted by the time this runs — losing it
 * because a summary failed would be trading the thing they asked for against a
 * convenience. So a failure here is recorded in the log, the row is written
 * with `summary: null`, and the page says the summary is unavailable.
 *
 * The same reasoning as Firecrawl enrichment: an optional enhancement degrades,
 * it does not break.
 */
export async function summariseTranscript({
  title,
  text,
}: {
  title: string | null;
  text: string;
}): Promise<string | null> {
  if (text.trim() === "") return null;

  try {
    const env = serverEnv();
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      response_format: { type: "json_object" },
      max_completion_tokens: 700,
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: buildSummaryPrompt({ title, text }) },
      ],
    });

    // JSON mode guarantees valid JSON, not OUR shape. This check is not
    // redundant — never remove it.
    const parsed = summarySchema.safeParse(
      safeJsonParse(completion.choices[0]?.message?.content ?? ""),
    );

    if (!parsed.success) {
      console.warn("[transcript-summary] unusable shape:", parsed.error.issues);
      return null;
    }

    return formatSummary(parsed.data);
  } catch (error) {
    console.warn("[transcript-summary] failed:", error);
    return null;
  }
}
