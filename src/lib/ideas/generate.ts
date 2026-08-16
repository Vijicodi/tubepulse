import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import type { WebContext } from "@/lib/firecrawl/enrich";
import type { ScoredVideo } from "./score";

/**
 * The idea engine.
 *
 * The contract that makes this storable instead of a wall of prose: the model
 * must return JSON matching `ideasResponseSchema`, and every idea must cite the
 * videoIds it was derived from. An idea without evidence is a guess, and the
 * product's whole claim is "here's why".
 *
 * We ask OpenAI for a JSON object and then validate it with zod anyway. The
 * response_format only guarantees valid JSON — it does not guarantee OUR shape,
 * and a model that returns `{"suggestions": [...]}` would still be valid JSON.
 * If it is off-shape that is a failed job with a real error, never a
 * half-written row.
 */

const MAX_IDEAS = 8;

export const ideaSchema = z.object({
  title: z.string().min(4).max(120),
  angle: z.string().min(10).max(400),
  reasoning: z.string().min(10).max(800),
  confidence: z.number().int().min(0).max(100),
  evidenceVideoIds: z.array(z.string().min(1)).min(1),
});

export const ideasResponseSchema = z.object({
  ideas: z.array(ideaSchema).min(1).max(MAX_IDEAS),
});

export type Idea = z.infer<typeof ideaSchema>;

export interface GenerateInput {
  channelTitle: string;
  outliers: ScoredVideo[];
  webContext: WebContext[];
}

const SYSTEM_PROMPT = `You find video ideas for YouTube creators by reading what already outperformed on a competitor's channel.

You are precise and honest. You never inflate confidence, you never propose an idea you cannot tie to specific evidence, and you never suggest a near-duplicate of a video that already exists.`;

export function buildPrompt({ channelTitle, outliers, webContext }: GenerateInput): string {
  const videoLines = outliers
    .map(
      (video) =>
        `- [${video.videoId}] "${video.title}" — ${video.viewCount.toLocaleString()} views, ` +
        `${video.outlierScore}x this channel's median, ${Math.round(video.ageDays)} days old, ` +
        `${video.velocity.toLocaleString()} views/day`,
    )
    .join("\n");

  const contextLines =
    webContext.length > 0
      ? webContext.map((entry) => `- ${entry.title} (${entry.url})\n  ${entry.excerpt}`).join("\n")
      : "(none gathered — work from the video data alone)";

  return `Analyse the channel "${channelTitle}" and find video ideas likely to outperform.

BREAKOUT VIDEOS (these beat the channel's own median by 1.5x or more):
${videoLines}

WEB CONTEXT (what the wider internet is discussing around this niche):
${contextLines}

Produce up to ${MAX_IDEAS} video ideas.

Rules:
- Every idea must cite at least one videoId from the list above in evidenceVideoIds. Use the exact ids shown in square brackets.
- "angle" is the specific take, not the topic. "Why X failed" beats "a video about X".
- "reasoning" explains what in the data supports this. Reference the actual numbers.
- "confidence" is 0-100 and should reflect how strong the evidence is. Be honest; a 40 is more useful than an inflated 90.
- Do not propose a near-duplicate of a video that already exists in the list. Find the adjacent, unmade idea.

Return a JSON object of exactly this shape:
{"ideas":[{"title":"...","angle":"...","reasoning":"...","confidence":0,"evidenceVideoIds":["..."]}]}`;
}

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
