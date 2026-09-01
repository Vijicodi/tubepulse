import "server-only";
import OpenAI from "openai";
import { serverEnv } from "@/lib/env";
import type { ModelTier } from "@/lib/billing/plans";
import { modelFor } from "@/lib/ideas/generate";
import {
  buildDiscoveryPrompt,
  buildIntentPrompt,
  candidatesResponseSchema,
  cleanHandle,
  intentSchema,
  DISCOVERY_SYSTEM_PROMPT,
  INTENT_SYSTEM_PROMPT,
  type Candidate,
  type Intent,
} from "./intent";

/**
 * Reading a spoken request, and finding real accounts for it.
 *
 * `server-only`: reads the OpenAI key. The prompts and schemas live in
 * `./intent.ts` so they stay testable.
 *
 * ---------------------------------------------------------------------------
 * BOTH CALLS RUN ON THE MINI MODEL, WHATEVER THE PLAN.
 *
 * Reading "fitness for beginners over 40" out of a sentence is not the hard
 * part of this product, and neither is naming six fitness channels. The premium
 * model is what Studio and Max pay for on IDEA GENERATION, where reasoning
 * quality actually shows. Spending it here would double the cost of a step
 * whose output is then verified against Apify anyway.
 * ---------------------------------------------------------------------------
 * EVERY CANDIDATE IS VERIFIED BEFORE IT IS OFFERED.
 *
 * A model asked for real handles will still invent one occasionally, and an
 * invented handle costs a user a run to discover — they pick it, it scrapes
 * nothing, and the product looks broken. So each candidate is checked against
 * Apify's own resolution before it reaches the screen, and anything that does
 * not resolve is dropped silently rather than shown with a warning.
 * ---------------------------------------------------------------------------
 */

/** Reading the request. Cheap, fast, and always on the mini model. */
export async function readIntent(request: string): Promise<Intent> {
  const client = new OpenAI({ apiKey: serverEnv().OPENAI_API_KEY });

  const completion = await client.chat.completions.create({
    model: modelFor("mini"),
    response_format: { type: "json_object" },
    // Short answer, hard ceiling: this is a classification, and a model that
    // starts explaining itself here has already gone wrong.
    max_completion_tokens: 300,
    messages: [
      { role: "system", content: INTENT_SYSTEM_PROMPT },
      { role: "user", content: buildIntentPrompt(request) },
    ],
  });

  const parsed = intentSchema.safeParse(
    safeJsonParse(completion.choices[0]?.message?.content ?? ""),
  );

  if (!parsed.success) {
    // A misread request must not take the endpoint down. Treating it as
    // unclear puts the person back in control with the text box they already
    // have, which is a working product rather than an error page.
    return {
      kind: "unclear",
      channel: null,
      niche: null,
      platform: null,
      question: "Could you say that again, or type it instead?",
      confidence: 0,
    };
  }

  return parsed.data;
}

export interface DiscoveryResult {
  candidates: Candidate[];
  /** Proposed but dropped for not resolving. Surfaced only in the trail. */
  rejected: string[];
  inputTokens: number;
  outputTokens: number;
}

/**
 * Name accounts for a niche, then keep only the ones that actually exist.
 *
 * `verify` is injected rather than imported so this stays testable without a
 * network: the real one asks Apify, and a test passes a function.
 */
export async function discoverChannels({
  niche,
  platform,
  verify,
  tier = "mini",
}: {
  niche: string;
  platform: "youtube" | "instagram";
  /** Resolves a handle, or returns null when nothing is there. */
  verify: (handle: string) => Promise<boolean>;
  tier?: ModelTier;
}): Promise<DiscoveryResult> {
  const client = new OpenAI({ apiKey: serverEnv().OPENAI_API_KEY });

  const completion = await client.chat.completions.create({
    model: modelFor(tier),
    response_format: { type: "json_object" },
    max_completion_tokens: 900,
    messages: [
      { role: "system", content: DISCOVERY_SYSTEM_PROMPT },
      { role: "user", content: buildDiscoveryPrompt(niche, platform) },
    ],
  });

  const parsed = candidatesResponseSchema.safeParse(
    safeJsonParse(completion.choices[0]?.message?.content ?? ""),
  );

  const usage = {
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
  };

  if (!parsed.success) {
    return { candidates: [], rejected: [], ...usage };
  }

  const proposed = parsed.data.candidates.map((candidate) => ({
    ...candidate,
    handle: cleanHandle(candidate.handle),
  }));

  // Verified in parallel: six sequential lookups would put six round trips in
  // front of someone who has just finished speaking.
  const checks = await Promise.all(
    proposed.map(async (candidate) => ({
      candidate,
      exists: await verify(candidate.handle).catch(() => false),
    })),
  );

  return {
    candidates: checks.filter((check) => check.exists).map((check) => check.candidate),
    rejected: checks
      .filter((check) => !check.exists)
      .map((check) => check.candidate.handle),
    ...usage,
  };
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
