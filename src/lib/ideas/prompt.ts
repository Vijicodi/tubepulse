import { z } from "zod";
import type { WebContext } from "@/lib/firecrawl/enrich";
import type { ScoredVideo } from "./score";

/**
 * The prompt, the shape it must answer in, and nothing else.
 *
 * Split out of `generate.ts` so it can be TESTED. `generate.ts` is
 * `server-only`, which makes it unimportable from vitest — the same reason
 * `lib/auth/messages.ts` and `lib/apify/reachable.ts` sit in their own files.
 * The prompt is code: it decides what the product produces, so it gets a test
 * like any other logic.
 *
 * The contract that makes an idea storable instead of a wall of prose: the
 * model must return JSON matching `ideasResponseSchema`, and every idea must
 * cite the videoIds it was derived from. An idea without evidence is a guess,
 * and the product's whole claim is "here is why".
 *
 * We ask OpenAI for a JSON object and then validate with zod anyway. The
 * response_format only guarantees VALID JSON — not OUR shape. A model
 * returning {"suggestions": [...]} is valid JSON and useless.
 */

export const MAX_IDEAS = 8;

export const ideaSchema = z.object({
  title: z.string().min(4).max(120),
  angle: z.string().min(10).max(400),
  reasoning: z.string().min(10).max(800),
  /**
   * The beat sheet. Bounded at both ends on purpose: under ~600 characters it
   * is a rehash of `angle` and buys nothing, and over ~3,000 the model is
   * writing the words rather than the structure — which is the part that ends
   * up sounding like a model wrote it.
   */
  script: z.string().min(600).max(3000),
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

export const SYSTEM_PROMPT = `You find video ideas for YouTube creators by reading what already outperformed on a competitor's channel.

You are precise and honest. You never inflate confidence, you never propose an idea you cannot tie to specific evidence, and you never suggest a near-duplicate of a video that already exists.`;

/**
 * How one post's numbers read to the model.
 *
 * A static Instagram post has no view count at all, so it is described in
 * LIKES — the metric it was actually scored on. Writing "0 views" would tell
 * the model the post failed, when the truth is that views are not a thing that
 * exists for it.
 */
export function metricLine(video: ScoredVideo): string {
  if (video.kind === "post") {
    const likes = video.likeCount ?? 0;
    return `${likes.toLocaleString()} likes, ${video.velocity.toLocaleString()} likes/day`;
  }

  const views = video.viewCount ?? 0;
  const noun = video.kind === "reel" ? "plays" : "views";
  return `${views.toLocaleString()} ${noun}, ${video.velocity.toLocaleString()} ${noun}/day`;
}

/** What this account's median means for a given kind, in words. */
export function kindLabel(video: ScoredVideo): string {
  if (video.kind === "reel") return "this account's median reel";
  if (video.kind === "post") return "this account's median post";
  return "this channel's median";
}

export function buildPrompt({
  channelTitle,
  outliers,
  webContext,
}: GenerateInput): string {
  const videoLines = outliers
    .map(
      (video) =>
        `- [${video.videoId}] "${video.title}" — ${metricLine(video)}, ` +
        `${video.outlierScore}x ${kindLabel(video)}, ${Math.round(video.ageDays)} days old`,
    )
    .join("\n");

  const contextLines =
    webContext.length > 0
      ? webContext
          .map((entry) => `- ${entry.title} (${entry.url})\n  ${entry.excerpt}`)
          .join("\n")
      : "(none gathered — work from the video data alone)";

  return `Analyse the channel "${channelTitle}" and find video ideas likely to outperform.

BREAKOUT VIDEOS (these beat the channel's own median by 1.5x or more):
${videoLines}

WEB CONTEXT (what the wider internet is discussing around this niche):
${contextLines}

Produce up to ${MAX_IDEAS} video ideas.

Rules:
- Every idea must cite at least one videoId from the list above in evidenceVideoIds. Use the exact ids shown in square brackets.
- NEVER write a video id inside "title", "angle", "reasoning" or "script". Those are read by a person, and an id like [dQw4w9WgXcQ] is meaningless to them. Refer to a video by its TITLE in prose. Ids belong only in evidenceVideoIds.
- "angle" is the specific take, not the topic. "Why X failed" beats "a video about X".
- "reasoning" explains what in the data supports this. Reference the actual numbers.
- "confidence" is 0-100 and should reflect how strong the evidence is. Be honest; a 40 is more useful than an inflated 90.
- Do not propose a near-duplicate of a video that already exists in the list. Find the adjacent, unmade idea.

"script" is a BEAT SHEET the creator can film from — structure, not a word-for-word narration. Aim for 250-350 words in this exact plain-text layout:

HOOK (0:00-0:15)
One or two lines. What is on screen and the opening line's job. Do not explain the premise yet.

BEAT 1 — <name the beat> (0:15-1:10)
Two or three lines on what this section establishes and why it earns the next one.

BEAT 2 — <name the beat> (1:10-2:40)
...

(five to seven beats total, with rough timings that add up to a sensible length for this kind of video)

CLOSE (m:ss-m:ss)
How it lands, and ONE ask, not three.

Write the beats as directions to a film-maker — "open on the thumbnail moment, do not explain it yet" — never as sentences to read aloud. Use real specifics from the evidence, including the actual numbers, rather than placeholders.

Return a JSON object of exactly this shape:
{"ideas":[{"title":"...","angle":"...","reasoning":"...","script":"...","confidence":0,"evidenceVideoIds":["..."]}]}`;
}
