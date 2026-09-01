import "server-only";
import OpenAI from "openai";
import { serverEnv } from "@/lib/env";
import type { ModelTier } from "@/lib/billing/plans";
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

/**
 * What one generation produced, and what it consumed.
 *
 * The token counts come straight from OpenAI's own `usage` on the completion —
 * measured, not estimated. They are what makes the per-run cost breakdown an
 * observation rather than a guess about the prompt's length.
 */
export interface GenerationResult {
  ideas: Idea[];
  inputTokens: number;
  outputTokens: number;
  model: string;
}

/**
 * Which OpenAI model a tier runs on.
 *
 * The pricing page advertises this as a plan feature — "fast model, built for
 * volume" against "advanced reasoning model" — so it is a promise, not an
 * implementation detail. Both names come from the environment.
 */
export function modelFor(tier: ModelTier): string {
  const env = serverEnv();
  return tier === "premium" ? env.OPENAI_MODEL : env.OPENAI_MODEL_FAST;
}

export async function generateIdeas(
  input: GenerateInput,
  /**
   * The caller's model tier. Defaults to premium so a forgotten argument
   * over-delivers rather than quietly downgrading a paying customer — the
   * failure that would never be reported.
   */
  tier: ModelTier = "premium",
): Promise<GenerationResult> {
  if (input.outliers.length === 0) {
    throw new Error(
      "No outlier videos to work from. This channel's videos all perform close to its median.",
    );
  }

  const env = serverEnv();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const completion = await client.chat.completions.create({
    model: modelFor(tier),
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
  const ideas = parsed.data.ideas
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

  return {
    ideas,
    // Measured, not derived from the prompt's length. `usage` is absent only
    // if OpenAI omits it, and a missing count must read as "unknown" (0) rather
    // than as an invented estimate shown to a customer as fact.
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
    model: completion.model,
  };
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
