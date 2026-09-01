import { NextResponse } from "next/server";
import { z } from "zod";
import { PLANS } from "@/lib/billing/plans";
import { canUseVoice } from "@/lib/billing/quota";
import { getQuota } from "@/lib/billing/store";
import { discoverChannels, readIntent } from "@/lib/agent/discover";
import { cleanHandle, needsClarification } from "@/lib/agent/intent";
import { createServerClient } from "@/lib/supabase/server";

/**
 * POST /api/agent — turn a spoken request into something researchable.
 *
 * The step between "say the niche" and a scrape. It reads what was asked for,
 * and either hands back a channel to research, a short list of candidates, or
 * one question.
 *
 * ---------------------------------------------------------------------------
 * IT SPENDS NO ALLOWANCE, and that is the point of the feature.
 *
 * Two mini-model calls cost a fraction of a cent between them. Charging a run
 * for working out what someone meant would mean rephrasing a request costs the
 * same as researching a channel — and people would stop speaking to it, which
 * is the one behaviour this whole feature exists to encourage.
 *
 * The scrape that FOLLOWS is billed normally, by /api/research, with every
 * quota and gate it already has. Nothing here bypasses that.
 * ---------------------------------------------------------------------------
 * NOTHING IS SCRAPED HERE EITHER. This route only ever proposes. The person
 * picks, and the existing research route does the work — so a misheard request
 * costs a moment rather than a run.
 */

export const runtime = "nodejs";

const bodySchema = z.object({
  request: z.string().min(1).max(1000),
  /** Set when answering a clarifying question, so the pass does not repeat. */
  platform: z.enum(["youtube", "instagram"]).optional(),
});

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  // Same gate as /api/voice: this is the other half of the same feature, and
  // an ungated endpoint beside a gated one is a way in.
  const quota = await getQuota(supabase, user.id);

  if (!canUseVoice(quota.planKey)) {
    return NextResponse.json(
      { error: "Voice research is on the paid plans." },
      { status: 402 },
    );
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return NextResponse.json({ error: "Say what you want researched." }, { status: 400 });
  }

  const trail: { step: string; detail: string }[] = [];

  let intent;
  try {
    intent = await readIntent(body.data.request);
  } catch {
    return NextResponse.json(
      { error: "Could not work out what to research. Try typing it instead." },
      { status: 502 },
    );
  }

  trail.push({
    step: "understand",
    detail:
      intent.kind === "channel"
        ? `Heard a channel: ${intent.channel}`
        : intent.kind === "niche"
          ? `Heard a niche: ${intent.niche}`
          : "Could not make out a subject",
  });

  // An answered question arrives as `platform`, which overrides whatever the
  // model read — the person's explicit answer beats an inference every time.
  const platform = body.data.platform ?? intent.platform ?? null;

  // ------------------------------------------------------------- a channel
  // They named someone. Discovery would spend a model call rediscovering what
  // they just said, so it is skipped entirely.
  if (intent.kind === "channel" && intent.channel) {
    return NextResponse.json({
      kind: "channel",
      channel: cleanHandle(intent.channel),
      platform: platform ?? "youtube",
      trail,
    });
  }

  // ------------------------------------------------------------ a question
  // Rationed: at most one, and only when the answer changes what gets scraped.
  if (needsClarification(intent) || (intent.kind === "niche" && !platform)) {
    return NextResponse.json({
      kind: "question",
      question:
        intent.question ??
        (intent.kind === "niche"
          ? "YouTube or Instagram?"
          : "What would you like researched?"),
      niche: intent.niche,
      trail,
    });
  }

  // --------------------------------------------------------------- a niche
  if (intent.kind === "niche" && intent.niche && platform) {
    let discovery;
    try {
      discovery = await discoverChannels({
        niche: intent.niche,
        platform,
        // Verification is a HEAD-shaped check against the public profile URL
        // rather than an Apify run: starting a run per candidate would cost
        // six scrapes to answer a question nobody asked yet.
        verify: (handle) => handleResolves(handle, platform),
      });
    } catch {
      return NextResponse.json(
        { error: "Could not find channels for that. Try naming one directly." },
        { status: 502 },
      );
    }

    trail.push({
      step: "discover",
      detail: `Found ${discovery.candidates.length} accounts in this niche${
        discovery.rejected.length > 0
          ? `, dropped ${discovery.rejected.length} that did not resolve`
          : ""
      }`,
    });

    if (discovery.candidates.length === 0) {
      return NextResponse.json({
        kind: "question",
        question: "I could not find accounts for that. Can you name one to start from?",
        niche: intent.niche,
        trail,
      });
    }

    return NextResponse.json({
      kind: "candidates",
      niche: intent.niche,
      platform,
      candidates: discovery.candidates,
      // What this plan will actually do with the pick, so the UI can say so
      // before anything is spent.
      willUse: {
        videosPerRun: PLANS[quota.planKey].videosPerRun,
        model: PLANS[quota.planKey].model,
      },
      trail,
    });
  }

  return NextResponse.json({
    kind: "question",
    question: "What would you like researched?",
    niche: null,
    trail,
  });
}

/**
 * Does this handle point at a real account?
 *
 * A plain fetch of the public profile URL, NOT an Apify run: a run per
 * candidate would cost six scrapes to check a list nobody has chosen from yet.
 *
 * A NON-ANSWER COUNTS AS EXISTING. A timeout, a rate limit or a bot wall all
 * fail this check without meaning the account is absent, and dropping a real
 * account because a CDN was slow is the worse error — the user simply picks it
 * and the scrape resolves the truth properly.
 */
async function handleResolves(
  handle: string,
  platform: "youtube" | "instagram",
): Promise<boolean> {
  const url =
    platform === "instagram"
      ? `https://www.instagram.com/${encodeURIComponent(handle)}/`
      : `https://www.youtube.com/@${encodeURIComponent(handle)}`;

  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(4000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TubePulse/1.0)" },
    });

    // 404 is the only answer that means "this is not there". Everything else,
    // including a 429 or a 403 bot wall, is inconclusive and kept.
    return response.status !== 404;
  } catch {
    return true;
  }
}
