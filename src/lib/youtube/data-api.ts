import "server-only";
import type { NormalizedScrape } from "@/lib/apify/normalize";
import { videoSchema, type Video } from "@/lib/schemas/youtube";

/**
 * YouTube channel research through YouTube's own Data API v3 — free.
 *
 * WHY THIS REPLACED APIFY FOR YOUTUBE (2026-10-04). The Apify actor bills
 * $0.004 a video: a 50-video Scout run was about ₹17 and a 200-video Max run
 * about ₹70, roughly 7.8x what the pricing sums assumed — at full use Studio
 * and Max lost money. The Data API has no per-call price, only a daily quota of
 * 10,000 units, and one 200-video read costs about 9 units:
 *
 *   channels.list       1 unit   (resolve the handle, get the uploads playlist)
 *   playlistItems.list  1 unit per 50 videos
 *   videos.list         1 unit per 50 videos (views, likes, duration…)
 *
 * so roughly 1,000 full reads a day before the quota matters. It also answers
 * in a few seconds rather than minutes, so the research request finishes
 * inline instead of waiting on a webhook.
 *
 * SAME DATA AS BEFORE. The actor read long-form videos only (no Shorts, no
 * streams), so this reads the "UULF" playlist — YouTube's long-form uploads
 * list — and drops anything that was a live stream. Output is the exact
 * NormalizedScrape the Apify path produced, so scoring and storage are shared.
 *
 * Anything this cannot do (no key, quota spent, a legacy /c/ name the API
 * cannot resolve) throws `YoutubeApiUnavailable`, and the caller falls back to
 * Apify. A channel that genuinely does not exist throws `YoutubeChannelNotFound`.
 */

const API = "https://www.googleapis.com/youtube/v3";
const PAGE = 50;
const TIMEOUT_MS = 10_000;

export class YoutubeApiUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YoutubeApiUnavailable";
  }
}

export class YoutubeChannelNotFound extends Error {
  constructor(handle: string) {
    super(`We could not find a YouTube channel called ${handle}. Check the spelling. This run was not charged.`);
    this.name = "YoutubeChannelNotFound";
  }
}

type Json = Record<string, unknown>;

async function call(path: string, params: Record<string, string>, key: string): Promise<Json> {
  const url = new URL(`${API}/${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.set("key", key);

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    throw new YoutubeApiUnavailable(`YouTube API unreachable: ${(error as Error).message}`);
  }

  const body = (await response.json().catch(() => ({}))) as Json;
  if (!response.ok) {
    const reason =
      ((body.error as Json | undefined)?.errors as Json[] | undefined)?.[0]?.reason ??
      response.status;
    throw new YoutubeApiUnavailable(`YouTube API ${path} failed: ${String(reason)}`);
  }
  return body;
}

/** ISO-8601 duration ("PT1H2M3S") to seconds. */
export function isoDurationToSeconds(iso: string | undefined): number | null {
  if (!iso) return null;
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return null;
  const [, d, h, m, s] = match.map((part) => Number(part ?? 0));
  return d * 86400 + h * 3600 + m * 60 + s;
}

function count(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function bestThumbnail(thumbnails: unknown): string | null {
  const t = (thumbnails ?? {}) as Record<string, { url?: string } | undefined>;
  return t.maxres?.url ?? t.high?.url ?? t.medium?.url ?? t.default?.url ?? null;
}

/**
 * Turn one videos.list item into our Video, or null when it is not a finished
 * long-form upload (a stream, a premiere that has not aired, hidden views).
 */
export function videoFromApi(item: Json): Video | null {
  const snippet = (item.snippet ?? {}) as Json;
  const statistics = (item.statistics ?? {}) as Json;
  const details = (item.contentDetails ?? {}) as Json;

  if (item.liveStreamingDetails) return null;
  if (snippet.liveBroadcastContent && snippet.liveBroadcastContent !== "none") return null;

  const views = count(statistics.viewCount);
  if (views === null) return null;

  const parsed = videoSchema.safeParse({
    videoId: item.id,
    title: snippet.title,
    url: `https://www.youtube.com/watch?v=${String(item.id)}`,
    thumbnailUrl: bestThumbnail(snippet.thumbnails),
    durationSeconds: isoDurationToSeconds(details.duration as string | undefined),
    viewCount: views,
    likeCount: count(statistics.likeCount),
    commentCount: count(statistics.commentCount),
    publishedAt: snippet.publishedAt,
  });
  return parsed.success ? parsed.data : null;
}

export async function readChannelViaApi({
  handle,
  channelUrl,
  maxResults,
  apiKey,
}: {
  /** "@name" or a raw "UC…" channel id, as parseChannelInput returns it. */
  handle: string;
  channelUrl: string;
  maxResults: number;
  apiKey: string;
}): Promise<NormalizedScrape> {
  if (!apiKey) throw new YoutubeApiUnavailable("No YOUTUBE_API_KEY configured.");

  const byId = /^UC[A-Za-z0-9_-]{22}$/.test(handle);
  const lookup = await call(
    "channels",
    {
      part: "snippet,statistics,contentDetails",
      ...(byId ? { id: handle } : { forHandle: handle }),
    },
    apiKey,
  );

  const channelItem = ((lookup.items as Json[] | undefined) ?? [])[0];
  if (!channelItem) {
    // A /c/ or /user/ name is not always a handle. Let Apify, which reads the
    // page itself, try before telling the customer it does not exist.
    if (/\/(c|user)\//.test(channelUrl)) {
      throw new YoutubeApiUnavailable(`No handle match for legacy URL ${channelUrl}`);
    }
    throw new YoutubeChannelNotFound(handle);
  }

  const channelId = String(channelItem.id);
  const snippet = (channelItem.snippet ?? {}) as Json;
  const statistics = (channelItem.statistics ?? {}) as Json;

  const channel = {
    handle,
    channelUrl,
    title: typeof snippet.title === "string" ? snippet.title : null,
    // Hidden subscriber counts come back as hiddenSubscriberCount: true.
    subscriberCount: statistics.hiddenSubscriberCount ? null : count(statistics.subscriberCount),
    thumbnailUrl: bestThumbnail(snippet.thumbnails),
  };

  // UC… → UULF…: the long-form uploads list (no Shorts), matching what the
  // Apify actor was asked for. Falls back to the full uploads list (UU…) if a
  // channel has no UULF list yet.
  const longForm = `UULF${channelId.slice(2)}`;
  const uploads = `UU${channelId.slice(2)}`;

  const videoIds: string[] = [];
  for (const playlistId of [longForm, uploads]) {
    let pageToken: string | undefined;
    try {
      do {
        const page = await call(
          "playlistItems",
          {
            part: "contentDetails",
            playlistId,
            maxResults: String(PAGE),
            ...(pageToken ? { pageToken } : {}),
          },
          apiKey,
        );
        for (const item of (page.items as Json[] | undefined) ?? []) {
          const id = ((item.contentDetails ?? {}) as Json).videoId;
          if (typeof id === "string") videoIds.push(id);
        }
        pageToken = typeof page.nextPageToken === "string" ? page.nextPageToken : undefined;
      } while (pageToken && videoIds.length < maxResults);
    } catch (error) {
      // UULF missing for this channel: try the plain uploads list instead.
      if (playlistId === longForm && videoIds.length === 0) continue;
      throw error;
    }
    if (videoIds.length > 0) break;
  }

  const wanted = videoIds.slice(0, maxResults);
  const videos: Video[] = [];
  const rejected: NormalizedScrape["rejected"] = [];

  for (let start = 0; start < wanted.length; start += PAGE) {
    const batch = wanted.slice(start, start + PAGE);
    const details = await call(
      "videos",
      {
        part: "snippet,statistics,contentDetails,liveStreamingDetails",
        id: batch.join(","),
        maxResults: String(PAGE),
      },
      apiKey,
    );
    for (const item of (details.items as Json[] | undefined) ?? []) {
      const video = videoFromApi(item);
      if (video) videos.push(video);
      else rejected.push({ reason: "not a finished long-form upload", sample: item.id });
    }
  }

  return { channel, videos, rejected };
}
