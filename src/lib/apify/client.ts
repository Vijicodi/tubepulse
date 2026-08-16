import "server-only";
import { ApifyClient } from "apify-client";
import { serverEnv } from "@/lib/env";

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
    {
      webhooks: [
        {
          eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.ABORTED"],
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
    },
  );

  return { runId: run.id, datasetId: run.defaultDatasetId };
}

/** Pull the items a finished run produced. Called from the webhook only. */
export async function fetchRunItems(datasetId: string): Promise<unknown[]> {
  const client = createApifyClient();
  const { items } = await client.dataset(datasetId).listItems({ clean: true });
  return items;
}
