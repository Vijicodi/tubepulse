import { NextResponse } from "next/server";
import { z } from "zod";
import { getQuota, spendRefill } from "@/lib/billing/store";
import { canUseInstagram, depthFor } from "@/lib/billing/quota";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refuseIfOverReserved } from "@/lib/billing/reserve";
import { startChannelScrape, startInstagramScrape } from "@/lib/apify/client";
import { storeYoutubeScrape } from "@/lib/apify/ingest";
import {
  readChannelViaApi,
  YoutubeApiUnavailable,
  YoutubeChannelNotFound,
} from "@/lib/youtube/data-api";
import { serverEnv } from "@/lib/env";
import { isInvalidTargetError, isPlatform, parseTarget } from "@/lib/platform/parse";

/**
 * POST /api/research — start researching a channel.
 *
 * Returns in under a second with a job id. It does NOT wait for the scrape:
 * that takes minutes and the request would time out. The browser subscribes to
 * the job row and the Apify webhook finishes the work later.
 *
 * See `docs/decisions/0002-async-jobs-and-webhooks.md`.
 */

const bodySchema = z.object({
  channel: z.string().min(1, "Enter a channel handle or URL"),
  projectId: z.uuid("Pick a project to research in."),
  /**
   * Which platform the selector was on. Only decides the AMBIGUOUS case — a
   * bare handle like "@nasa", which is valid on both. A pasted URL always wins,
   * because refusing an instagram.com link to defend a dropdown would be the
   * app being right at the user's expense.
   */
  platform: z.string().optional(),
});

export async function POST(request: Request) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to research a channel." }, { status: 401 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const fallback = isPlatform(body.data.platform) ? body.data.platform : "youtube";

  let parsed;
  try {
    parsed = parseTarget(body.data.channel, fallback);
  } catch (error) {
    if (isInvalidTargetError(error)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  // RLS means this returns nothing unless the project belongs to this user,
  // so it doubles as the ownership check.
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", body.data.projectId)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  // Checked BEFORE any row is written. A refused scrape must not leave a job
  // behind, because jobs are what the allowance is counted from — one would
  // charge someone for work that never started.
  const quota = await getQuota(supabase, user.id);

  // INSTAGRAM IS GATED, and it is gated HERE rather than only in the UI. A
  // hidden button is not an access control: this endpoint is reachable with a
  // session and a POST body, and an Instagram run costs 4-6x a YouTube one.
  if (parsed.platform === "instagram" && !canUseInstagram(quota.planKey)) {
    return NextResponse.json(
      {
        error:
          "Instagram research is on Studio and Max. Your plan covers YouTube.",
        quota,
      },
      // 402: money fixes this, and saying so is more useful than a bare 403.
      { status: 402 },
    );
  }

  if (!quota.canScrape) {
    return NextResponse.json(
      { error: quota.reason, quota },
      // 402 when they are out of scrapes and money would fix it; 429 when they
      // have scrapes left but have hit the daily cap and only time will.
      { status: quota.remaining <= 0 ? 402 : 429 },
    );
  }

  // YouTube @handles and Instagram usernames are case-insensitive, so
  // @StandUpMaths and @standupmaths are one channel. Without folding case the
  // same competitor was added — and scraped, and charged — twice. Channel ids
  // (UC…) ARE case-sensitive and are left alone.
  const handle =
    parsed.platform === "instagram" || parsed.handle.startsWith("@")
      ? parsed.handle.toLowerCase()
      : parsed.handle;

  // Re-researching reuses the existing row UNTOUCHED. The old upsert reset
  // title, subscribers and last_scraped_at to null on every attempt, so a
  // re-run that then failed left a known competitor reading "Last read Never".
  // The ingest writes fresh values when the scrape actually succeeds.
  // ilike, so rows saved before handles were lower-cased still match.
  const { data: existingChannel } = await supabase
    .from("channels")
    .select()
    .eq("project_id", project.id)
    .ilike("handle", handle.replace(/[\\%_]/g, (char) => `\\${char}`))
    .limit(1)
    .maybeSingle();

  const { data: channel, error: channelError } = existingChannel
    ? { data: existingChannel, error: null }
    : await supabase
        .from("channels")
        .insert({
          owner_id: user.id,
          project_id: project.id,
          platform: parsed.platform,
          handle,
          channel_url: parsed.url,
          title: null,
          subscriber_count: null,
          thumbnail_url: null,
          last_scraped_at: null,
        })
        .select()
        .single();

  if (channelError || !channel) {
    return NextResponse.json(
      { error: `Could not save the channel: ${channelError?.message ?? "unknown error"}` },
      { status: 500 },
    );
  }

  // The job row exists BEFORE the scrape starts, so the UI has something to
  // watch even if starting the actor fails.
  const { data: job, error: jobError } = await createAdminClient()
    .from("jobs")
    .insert({
      owner_id: user.id,
      kind: "channel_scrape",
      status: "queued",
      project_id: project.id,
      channel_id: channel.id,
      external_run_id: null,
      error: null,
    })
    .select()
    .single();

  if (jobError || !job) {
    return NextResponse.json(
      { error: `Could not queue the job: ${jobError?.message ?? "unknown error"}` },
      { status: 500 },
    );
  }

  // Two requests at the same instant both pass the check above. Re-read the
  // allowance with this job reserved; the loser is withdrawn unbilled.
  const raced = await refuseIfOverReserved(supabase, user.id, job.id);
  if (raced) return raced;

  try {
    // The other half of what Pro buys: a deeper read of every account. The
    // Instagram figure is lower on purpose — its data costs several times more
    // per item. See the sums in lib/billing/plans.ts.
    const maxResults = depthFor(parsed.platform, quota.planKey);

    // YOUTUBE: YouTube's own Data API first — free, and done in seconds, so
    // the run finishes inside this request. Apify (paid, async) is only the
    // fallback for when the API cannot answer: no key, quota spent, or a
    // legacy /c/ name it cannot resolve.
    const apiKey = serverEnv().YOUTUBE_API_KEY;
    if (parsed.platform === "youtube" && apiKey) {
      try {
        const scrape = await readChannelViaApi({
          handle: parsed.handle,
          channelUrl: parsed.url,
          maxResults,
          apiKey,
        });
        await storeYoutubeScrape(createAdminClient(), job.id, channel.id, scrape, "youtube_api");

        if (quota.mustSpendRefill) await spendRefill(user.id, job.id);
        return NextResponse.json(
          {
            jobId: job.id,
            channelId: channel.id,
            handle: parsed.handle,
            platform: parsed.platform,
            done: true,
          },
          { status: 202 },
        );
      } catch (error) {
        if (error instanceof YoutubeChannelNotFound) {
          await createAdminClient()
            .from("jobs")
            .update({ status: "failed", error: error.message })
            .eq("id", job.id);
          return NextResponse.json({ error: error.message, jobId: job.id }, { status: 404 });
        }
        if (!(error instanceof YoutubeApiUnavailable)) throw error;
        console.warn("[research] YouTube API unavailable, falling back to Apify:", error.message);
      }
    }

    const run =
      parsed.platform === "instagram"
        ? await startInstagramScrape({
            profileUrl: parsed.url,
            jobId: job.id,
            maxResults,
          })
        : await startChannelScrape({
            channelUrl: parsed.url,
            jobId: job.id,
            maxResults,
          });

    await createAdminClient()
      .from("jobs")
      .update({ status: "running", external_run_id: run.runId })
      .eq("id", job.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start the scrape.";
    await createAdminClient().from("jobs").update({ status: "failed", error: message }).eq("id", job.id);

    return NextResponse.json({ error: message, jobId: job.id }, { status: 502 });
  }

  // The allowance was already gone when this started, so this scrape came out
  // of a bought pack. Recorded only now: a scrape that failed to start above
  // returned early and was never charged for.
  // Charged to the refill ledger when the allowance is gone, OR when today's
  // cap is reached and this scrape is continuing on packs the user bought.
  // `mustSpendRefill` carries both cases so the three spending routes cannot
  // drift apart on the rule.
  if (quota.mustSpendRefill) {
    await spendRefill(user.id, job.id);
  }

  // 202: accepted, not finished.
  return NextResponse.json(
    { jobId: job.id, channelId: channel.id, handle: parsed.handle, platform: parsed.platform },
    { status: 202 },
  );
}
