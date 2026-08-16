import {
  channelSchema,
  countLike,
  dateLike,
  durationLike,
  rawApifyVideoSchema,
  videoSchema,
  type Channel,
  type Video,
} from "@/lib/schemas/youtube";

export interface NormalizedScrape {
  channel: Channel | null;
  videos: Video[];
  /** Items we threw away, and why. Surfaced in the UI so failures are visible. */
  rejected: Array<{ reason: string; sample: unknown }>;
}

/**
 * Turn a raw Apify dataset into rows we are willing to store.
 *
 * Design rule: a single malformed item must never sink the whole run. Bad items
 * are dropped and counted; good items proceed. A scrape that returns 480 of 500
 * videos is a useful result, not a failure.
 */
export function normalizeApifyDataset(items: unknown[]): NormalizedScrape {
  const videos: Video[] = [];
  const rejected: NormalizedScrape["rejected"] = [];
  let channel: Channel | null = null;

  for (const item of items) {
    const parsedRaw = rawApifyVideoSchema.safeParse(item);
    if (!parsedRaw.success) {
      rejected.push({ reason: "not an object we recognise", sample: item });
      continue;
    }

    const raw = parsedRaw.data;

    if (channel === null && raw.channelUrl) {
      const candidate = channelSchema.safeParse({
        handle: handleFromUrl(raw.channelUrl),
        channelUrl: raw.channelUrl,
        title: raw.channelName ?? null,
        subscriberCount: countLike.parse(raw.numberOfSubscribers) || null,
        thumbnailUrl: raw.channelThumbnailUrl ?? null,
      });
      if (candidate.success) channel = candidate.data;
    }

    const publishedAt = dateLike.parse(raw.date);
    if (publishedAt === null) {
      rejected.push({ reason: "no usable publish date", sample: raw.title ?? raw.id });
      continue;
    }

    const videoId = raw.videoId ?? raw.id;
    const url = raw.url ?? (videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined);

    const parsed = videoSchema.safeParse({
      videoId,
      title: raw.title,
      url,
      thumbnailUrl: raw.thumbnailUrl ?? null,
      durationSeconds: durationLike.parse(raw.duration),
      viewCount: countLike.parse(raw.viewCount),
      likeCount: raw.likes === undefined ? null : countLike.parse(raw.likes),
      commentCount:
        raw.commentsCount === undefined ? null : countLike.parse(raw.commentsCount),
      publishedAt,
    });

    if (!parsed.success) {
      rejected.push({
        reason: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        sample: raw.title ?? raw.id,
      });
      continue;
    }

    videos.push(parsed.data);
  }

  return { channel, videos, rejected: dedupeRejections(rejected) };
}

function handleFromUrl(channelUrl: string): string {
  const match = /@[A-Za-z0-9._-]+/.exec(channelUrl);
  if (match) return match[0];
  const idMatch = /channel\/(UC[A-Za-z0-9_-]{22})/.exec(channelUrl);
  return idMatch ? idMatch[1] : channelUrl;
}

/** Keep the log readable when 200 items fail for the same reason. */
function dedupeRejections(rejected: NormalizedScrape["rejected"]) {
  const seen = new Set<string>();
  return rejected.filter((entry) => {
    if (seen.has(entry.reason)) return false;
    seen.add(entry.reason);
    return true;
  });
}
