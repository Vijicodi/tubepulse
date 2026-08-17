import "server-only";
import { ApifyClient } from "apify-client";
import { serverEnv } from "@/lib/env";
import { webhooksCanReachUs } from "@/lib/apify/reachable";

/**
 * Apify, used asynchronously.
 *
 * We never wait for a run to finish. A channel scrape takes 2-6 minutes and a
 * serverless request dies long before that. Instead we start the run, hand
 * Apify a webhook URL, and return immediately — the webhook writes the results
 * when they exist. See `docs/decisions/0002-async-jobs-and-webhooks.md`.
 *
 * If you are tempted to use `.call()` (which blocks until the run finishes),
 * read that decision record first. It is the mistake this file exists to avoid.
 */

export interface StartScrapeOptions {
  channelUrl: string;
  /** Our jobs.id — comes back on the webhook so we know what finished. */
  jobId: string;
  /** How many videos to pull. More costs more and adds little signal. */
  maxResults?: number;
}

export interface StartedRun {
  runId: string;
  datasetId: string;
}

export function createApifyClient() {
  return new ApifyClient({ token: serverEnv().APIFY_TOKEN });
}

export async function startChannelScrape({
  channelUrl,
  jobId,
  maxResults = 100,
}: StartScrapeOptions): Promise<StartedRun> {
  const env = serverEnv();
  const client = createApifyClient();

  const run = await client.actor(env.APIFY_YOUTUBE_ACTOR).start(
    {
      startUrls: [{ url: channelUrl }],
      maxResults,
      maxResultsShorts: 0,
      maxResultStreams: 0,
    },
    // No webhooks array at all on a dev machine: Apify rejects an unreachable
    // requestUrl outright rather than ignoring it, which fails the whole run.
    webhooksCanReachUs(env.APP_URL)
      ? {
          webhooks: [
            {
              eventTypes: [
                "ACTOR.RUN.SUCCEEDED",
                "ACTOR.RUN.FAILED",
                "ACTOR.RUN.ABORTED",
              ],
              requestUrl: `${env.APP_URL}/api/webhooks/apify`,
              // Apify substitutes the resource fields; jobId and secret are ours.
              payloadTemplate: JSON.stringify({
                jobId,
                secret: env.APIFY_WEBHOOK_SECRET,
                eventType: "{{eventType}}",
                runId: "{{resource.id}}",
                defaultDatasetId: "{{resource.defaultDatasetId}}",
                status: "{{resource.status}}",
              }),
            },
          ],
        }
      : {},
  );

  return { runId: run.id, datasetId: run.defaultDatasetId };
}


/**
 * Start an Instagram profile scrape.
 *
 * The input keys are `directUrls` and `resultsLimit` — verified against a real
 * run, not guessed, because the last actor that was guessed at cost an
 * afternoon. `resultsType: "posts"` returns the grid: reels and static posts
 * together, which is what the outlier scoring wants (in separate pools).
 *
 * `addParentData` is what attaches the owning account to each post, so the
 * profile can be identified without a second request.
 */
export async function startInstagramScrape({
  profileUrl,
  jobId,
  maxResults,
}: {
  profileUrl: string;
  jobId: string;
  /** Deliberately smaller than a YouTube scrape — Instagram data costs 4-6x. */
  maxResults: number;
}): Promise<StartedRun> {
  const env = serverEnv();
  const client = createApifyClient();

  const run = await client.actor(env.APIFY_INSTAGRAM_ACTOR).start(
    {
      directUrls: [profileUrl],
      resultsType: "posts",
      resultsLimit: maxResults,
      addParentData: true,
    },
    webhooksCanReachUs(env.APP_URL)
      ? {
          webhooks: [
            {
              eventTypes: [
                "ACTOR.RUN.SUCCEEDED",
                "ACTOR.RUN.FAILED",
                "ACTOR.RUN.ABORTED",
              ],
              requestUrl: `${env.APP_URL}/api/webhooks/apify`,
              payloadTemplate: JSON.stringify({
                jobId,
                secret: env.APIFY_WEBHOOK_SECRET,
                eventType: "{{eventType}}",
                runId: "{{resource.id}}",
                defaultDatasetId: "{{resource.defaultDatasetId}}",
                status: "{{resource.status}}",
              }),
            },
          ],
        }
      : {},
  );

  return { runId: run.id, datasetId: run.defaultDatasetId };
}

/**
 * Start a transcript run for one video.
 *
 * Same asynchronous contract as a channel scrape and for the same reason:
 * captions are usually quick, but "usually" is not something a request timeout
 * negotiates with. It goes through the jobs table like everything else.
 *
 * THE INPUT KEY IS `urls`, and getting it wrong fails in a way that reads like
 * a video problem rather than a config one. This actor answers an unrecognised
 * input with a SUCCEEDED run whose dataset holds
 * `{ errorCode: "NO_VIDEOS_FOUND" }` — so the run looks fine, the webhook fires
 * normally, and the only symptom is an empty transcript. `videoUrl` and
 * `startUrls` are sent alongside because other actors use those names and an
 * actor ignores keys it does not know; `urls` is the one that works here.
 */
export async function startTranscriptRun({
  videoUrl,
  jobId,
}: {
  videoUrl: string;
  jobId: string;
}): Promise<StartedRun> {
  const env = serverEnv();

  if (env.APIFY_TRANSCRIPT_ACTOR === "") {
    throw new Error(
      "Transcripts are not configured: APIFY_TRANSCRIPT_ACTOR is blank in .env.local.",
    );
  }

  const client = createApifyClient();

  const run = await client.actor(env.APIFY_TRANSCRIPT_ACTOR).start(
    {
      // What supreme_coder/youtube-transcript-scraper actually reads.
      urls: [{ url: videoUrl }],
      // Aliases other transcript actors use. Harmlessly ignored here.
      videoUrl,
      videoUrls: [videoUrl],
      startUrls: [{ url: videoUrl }],
    },
    // Same reachability gate as the scrape: Apify REJECTS a run whose webhook
    // url it cannot reach, so a dev machine sends none and the sync route
    // finishes the job instead.
    webhooksCanReachUs(env.APP_URL)
      ? {
          webhooks: [
            {
              eventTypes: [
                "ACTOR.RUN.SUCCEEDED",
                "ACTOR.RUN.FAILED",
                "ACTOR.RUN.ABORTED",
              ],
              requestUrl: `${env.APP_URL}/api/webhooks/apify`,
              payloadTemplate: JSON.stringify({
                jobId,
                secret: env.APIFY_WEBHOOK_SECRET,
                eventType: "{{eventType}}",
                runId: "{{resource.id}}",
                defaultDatasetId: "{{resource.defaultDatasetId}}",
                status: "{{resource.status}}",
              }),
            },
          ],
        }
      : {},
  );

  return { runId: run.id, datasetId: run.defaultDatasetId };
}

/** Pull the items a finished run produced. Called from the webhook only. */
export async function fetchRunItems(datasetId: string): Promise<unknown[]> {
  const client = createApifyClient();
  const { items } = await client.dataset(datasetId).listItems({ clean: true });
  return items;
}

/**
 * The current state of a run, for the polling fallback.
 *
 * Webhooks are the fast path, but they need a publicly reachable URL. During
 * local development there usually isn't one, and without this the job card
 * would spin forever on a scrape that actually finished.
 */
export interface RunState {
  status: string;
  datasetId: string | null;
}

export async function getRunState(runId: string): Promise<RunState> {
  const client = createApifyClient();
  const run = await client.run(runId).get();

  if (!run) throw new Error("That scrape run no longer exists on Apify.");

  return { status: run.status, datasetId: run.defaultDatasetId ?? null };
}
