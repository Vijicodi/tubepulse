import "server-only";
import OpenAI from "openai";
import { serverEnv } from "@/lib/env";
import { stripVideoIds } from "./clean";
import {
  buildPrompt,
  ideasResponseSchema,
  SYSTEM_PROMPT,
  type GenerateInput,
  type Idea,
} from "./prompt";

/**
 * The idea engine — the OpenAI call and what happens to its answer.
 *
 * The prompt and the schema live in `./prompt.ts` so they can be tested; this
 * file is `server-only` because it reads the API key, and nothing importable
 * by a test may do that.
 *
 * If the response is off-shape that is a failed job with a real error, never a
 * half-written row.
 */

export { buildPrompt, ideaSchema, ideasResponseSchema, MAX_IDEAS } from "./prompt";
export type { GenerateInput, Idea } from "./prompt";

export async function generateIdeas(input: GenerateInput): Promise<Idea[]> {
  if (input.outliers.length === 0) {
    throw new Error(
      "No outlier videos to work from. This channel's videos all perform close to its median.",
    );
  }

  const env = serverEnv();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const completion = await client.chat.completions.create({
    model: env.OPENAI_MODEL,
    response_format: { type: "json_object" },
    // Eight beat sheets is roughly triple what this response used to be. A cut
    // off response is truncated JSON, which fails validation — the correct
    // outcome, but with an error that names nothing useful. Raise this if
    // MAX_IDEAS or the script length ever goes up.
    max_completion_tokens: 9000,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildPrompt(input) },
    ],
  });

  const text = completion.choices[0]?.message?.content ?? "";

  const parsed = ideasResponseSchema.safeParse(safeJsonParse(text));
  if (!parsed.success) {
    throw new Error(
      `Idea generation returned an unusable shape: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")}`,
    );
  }

  // Drop any citation the model invented for a video we did not send it.
  const knownIds = new Set(input.outliers.map((video) => video.videoId));
  return parsed.data.ideas
    .map((idea) => ({
      ...idea,
      // The prompt shows each video as `[videoId] "Title"` and asks for those
      // ids back, so the model reliably quotes them into the prose too. To a
      // reader that is a random string mid-sentence. Instructing it not to
      // helps but does not hold, so the prose is cleaned here as well.
      title: stripVideoIds(idea.title, knownIds),
      angle: stripVideoIds(idea.angle, knownIds),
      reasoning: stripVideoIds(idea.reasoning, knownIds),
      script: stripVideoIds(idea.script, knownIds),
      evidenceVideoIds: idea.evidenceVideoIds.filter((id) => knownIds.has(id)),
    }))
    .filter((idea) => idea.evidenceVideoIds.length > 0);
}


/** Models sometimes wrap JSON in prose or fences despite instructions. */
export function safeJsonParse(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  const candidate = fenced ? fenced[1] : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}
