import { z } from "zod";

/**
 * What someone actually asked for, read out of a sentence.
 *
 * The prompt and the schema; the OpenAI call lives in `./discover.ts`, which is
 * `server-only`. Same split as `lib/ideas/prompt.ts` and for the same reason —
 * the part worth testing must be importable by a test.
 *
 * ---------------------------------------------------------------------------
 * THREE THINGS A REQUEST CAN BE, and telling them apart is the whole job:
 *
 *   channel   they named someone specific — "@mkbhd", "research Veritasium"
 *   niche     they described a subject — "fitness for beginners over 40"
 *   unclear   neither, or so vague that any research would be a guess
 *
 * A CHANNEL SKIPS DISCOVERY ENTIRELY. Someone who named a channel has already
 * done the hard part, and running a discovery pass over their answer would
 * spend a model call to rediscover what they just said.
 * ---------------------------------------------------------------------------
 * THE CLARIFYING QUESTION IS RATIONED, deliberately.
 *
 * At most one, and only when the answer would change what gets scraped. The
 * rule is not "ask when unsure" — a model asked to be careful will ask about
 * everything, and a product that interrogates you before every run is worse
 * than one that occasionally researches the wrong thing.
 *
 * "Fitness" is worth a question: YouTube and Instagram give different answers.
 * "Fitness for beginners over 40 on YouTube" is not — it is already an answer.
 * ---------------------------------------------------------------------------
 */

export type IntentKind = "channel" | "niche" | "unclear";

export const intentSchema = z.object({
  kind: z.enum(["channel", "niche", "unclear"]),
  /**
   * The handle, when they named one. Without the @, because every downstream
   * parser adds its own and two of them is a lookup that finds nothing.
   */
  channel: z.string().max(120).nullable(),
  /** The subject, when they described one. Cleaned of filler, not reworded. */
  niche: z.string().max(200).nullable(),
  /** Named explicitly, or null when they did not say. Never guessed. */
  platform: z.enum(["youtube", "instagram"]).nullable(),
  /**
   * The one question worth asking, or null to just get on with it.
   *
   * Null is the common case and the right default. See the header.
   */
  question: z.string().max(160).nullable(),
  /** 0-100. Below CLARIFY_BELOW the request is treated as unusable. */
  confidence: z.number().int().min(0).max(100),
});

export type Intent = z.infer<typeof intentSchema>;

/**
 * Under this, a request is too vague to spend a run on.
 *
 * Set low on purpose. The cost of researching a slightly-wrong niche is one
 * run; the cost of interrogating someone who knew exactly what they wanted is
 * that they stop using the voice button.
 */
export const CLARIFY_BELOW = 35;

export const INTENT_SYSTEM_PROMPT = `You read a creator's spoken research request and work out what they want researched.

You are decisive. Most requests are clear enough to act on, and you say so. You ask a question only when the answer would genuinely change which accounts get researched — never to be thorough, never to confirm something already said.`;

export function buildIntentPrompt(request: string): string {
  return `A creator said this, out loud, to a competitor-research tool:

"""
${request}
"""

Work out what to research.

- "channel" means they named a specific account: a handle like @mkbhd, a URL, or a name like "Veritasium" or "Marques Brownlee". Put the handle or name in "channel", without a leading @.
- "niche" means they described a subject rather than an account — "fitness for beginners over 40", "indie game devs", "home espresso". Put a cleaned version in "niche": keep their words, drop the filler ("um", "I want to look at", "can you find me").
- "unclear" means neither. A request with no subject at all.

"platform" is "youtube" or "instagram" ONLY if they said so, or pasted a URL that says so. Otherwise null. Never infer it from the subject.

"question" is at most ONE short question, and only when the answer would change WHICH accounts get researched. Almost always null.
  Ask: a bare niche with no platform, where the two platforms would give genuinely different accounts.
  Do NOT ask: to confirm something they already said; to narrow a niche that is already specific; about anything that does not change what gets scraped.

"confidence" is 0-100: how sure you are that researching this would give them what they asked for. A named channel is near 100. A clear niche is 70-90. A one-word request is 20-40.

Return a JSON object of exactly this shape:
{"kind":"niche","channel":null,"niche":"...","platform":null,"question":null,"confidence":0}`;
}

// ---------------------------------------------------------------------------
// Channel candidates
// ---------------------------------------------------------------------------

export const MAX_CANDIDATES = 6;

export const candidateSchema = z.object({
  /** The handle, without @. What gets verified and then scraped. */
  handle: z.string().min(1).max(120),
  /** The channel's usual display name, for showing beside the handle. */
  name: z.string().min(1).max(160),
  /** One line on why this one fits the niche. Never a description of them. */
  why: z.string().min(4).max(200),
});

export const candidatesResponseSchema = z.object({
  candidates: z.array(candidateSchema).min(1).max(MAX_CANDIDATES),
});

export type Candidate = z.infer<typeof candidateSchema>;

export const DISCOVERY_SYSTEM_PROMPT = `You name real, existing accounts that a creator should study in a given niche.

Every handle you give must be one you are confident actually exists. A plausible-looking handle that does not exist wastes the user's time and their money, so a shorter list of certain ones beats a longer list of guesses.`;

export function buildDiscoveryPrompt(niche: string, platform: string): string {
  return `Name up to ${MAX_CANDIDATES} ${platform} accounts worth studying for this niche:

"""
${niche}
"""

Rules:
- Real accounts only. If you are not confident a handle exists, leave it out.
- Prefer accounts that actively post in this niche NOW over ones that are merely famous.
- Spread the sizes. A creator learns more from one peer-sized account than from five giants.
- "why" is what makes this account worth studying FOR THIS NICHE, in one line. Not a description of who they are.
- "handle" has no leading @ and no URL. Just the handle.

Return a JSON object of exactly this shape:
{"candidates":[{"handle":"...","name":"...","why":"..."}]}`;
}

/**
 * Strip a leading @ and any URL wrapper from a model's answer.
 *
 * Asked for a bare handle, a model will still occasionally return
 * "@name", "youtube.com/@name" or a full URL. Cleaning here means the
 * downstream parser sees one shape.
 */
export function cleanHandle(raw: string): string {
  const trimmed = raw.trim();

  // A URL: take the last path segment, which is where the handle lives.
  const fromUrl = trimmed.match(/(?:https?:\/\/)?(?:www\.)?[^/]+\/(?:@)?([^/?#]+)/);
  const candidate = fromUrl ? fromUrl[1] : trimmed;

  return candidate.replace(/^@+/, "").trim();
}

/**
 * Whether this intent can proceed without asking anything.
 *
 * Pure and exported so the route and its tests agree about the rule, rather
 * than each having its own copy of the same three conditions.
 */
export function needsClarification(intent: Intent): boolean {
  if (intent.kind === "unclear") return true;
  if (intent.confidence < CLARIFY_BELOW) return true;
  return intent.question !== null;
}
