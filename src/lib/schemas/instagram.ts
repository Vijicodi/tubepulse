import { z } from "zod";
import type { VideoKind } from "@/lib/supabase/types";

/**
 * The trust boundary for Instagram actor output.
 *
 * Written against a REAL captured run (`tests/fixtures/instagram-run.json`),
 * not against assumptions — the transcript normalizer was guessed and shipped
 * four bugs. See `docs/decisions/0003-normalize-at-the-boundary.md`.
 *
 * `z.looseObject` so new fields do not break us, `.nullish()` never
 * `.optional()` because Apify actors return null where you expect a missing key.
 */

export const rawInstagramItemSchema = z.looseObject({
  id: z.string().nullish(),
  shortCode: z.string().nullish(),
  /** "Video" | "Image" | "Sidecar" — the media container. */
  type: z.string().nullish(),
  /** "clips" for a reel, "feed" for an in-feed video. Absent on images. */
  productType: z.string().nullish(),
  caption: z.string().nullish(),
  url: z.string().nullish(),
  displayUrl: z.string().nullish(),
  timestamp: z.string().nullish(),
  likesCount: z.number().nullish(),
  commentsCount: z.number().nullish(),
  /** Reels report both. Plays is the reach number Instagram itself shows. */
  videoPlayCount: z.number().nullish(),
  videoViewCount: z.number().nullish(),
  videoDuration: z.number().nullish(),
  ownerUsername: z.string().nullish(),
  ownerFullName: z.string().nullish(),
  /** Present when a run returns nothing, instead of an empty dataset. */
  noResults: z.boolean().nullish(),
  error: z.string().nullish(),
});

export type RawInstagramItem = z.infer<typeof rawInstagramItemSchema>;

export interface InstagramPost {
  postId: string;
  kind: Extract<VideoKind, "reel" | "post">;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  /** Plays, for a reel. Null for a static post, which has no view count. */
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  publishedAt: string;
}

export interface InstagramProfile {
  username: string;
  fullName: string | null;
}

export interface NormalizedInstagram {
  profile: InstagramProfile | null;
  posts: InstagramPost[];
  rejected: unknown[];
}

/**
 * A reel or a static post.
 *
 * `productType: "clips"` is Instagram's own word for a reel and is the reliable
 * signal. An in-feed video (`"feed"`) is still watched and still reports plays,
 * so it is scored as a reel; a Sidecar (a carousel) and an Image are not.
 */
export function kindOf(item: RawInstagramItem): "reel" | "post" {
  if (item.productType === "clips") return "reel";
  if (item.type === "Video") return "reel";
  return "post";
}

/**
 * The number that means something for this kind.
 *
 * Reels: plays. Posts: null — a static post has no view count, and storing 0
 * would read on screen as a post nobody saw. Its metric is likes, which is
 * stored in its own column and is what `scoreVideos` uses for that kind.
 */
export function viewsOf(item: RawInstagramItem): number | null {
  if (kindOf(item) === "post") return null;
  return item.videoPlayCount ?? item.videoViewCount ?? null;
}

/**
 * A caption is not a title, but it is the only human-readable thing a post has.
 *
 * Trimmed to one line so a table row stays a row. The full caption is not
 * stored: nothing in the product reads it, and an untruncated one is often
 * two thousand characters of hashtags.
 */
export function titleFrom(caption: string | null | undefined, shortCode: string): string {
  const firstLine = (caption ?? "").split("\n").map((line) => line.trim()).find(Boolean);

  if (!firstLine) return `Post ${shortCode}`;
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine;
}

/** The actor's own complaint, if that is all the dataset holds. */
export function instagramError(items: unknown[]): string | null {
  const parsed = items
    .map((item) => rawInstagramItemSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);

  if (parsed.length === 0) return null;

  const explicit = parsed.find((item) => item.error);
  if (explicit?.error) return explicit.error;

  // Every item saying noResults means the account gave us nothing.
  if (parsed.every((item) => item.noResults === true)) {
    return (
      "That account returned no posts. It may be private, have no posts yet, " +
      "or the handle may be misspelt."
    );
  }

  return null;
}

export function normalizeInstagramDataset(items: unknown[]): NormalizedInstagram {
  const posts: InstagramPost[] = [];
  const rejected: unknown[] = [];

  /**
   * Owners seen, counted.
   *
   * NOT the first post's owner. A grid contains COLLAB POSTS, whose owner is
   * the partner account: in the captured NASA run, 8 of 10 posts were nasa, one
   * was spherevegas and one astro_jessica. Taking the first would have named
   * the channel "Sphere". The account we scraped is the one that appears most.
   */
  const owners = new Map<string, { fullName: string | null; count: number }>();

  for (const raw of items) {
    const result = rawInstagramItemSchema.safeParse(raw);

    if (!result.success) {
      rejected.push(raw);
      continue;
    }

    const item = result.data;

    // A "no results" marker is not a post and is not a rejection either.
    if (item.noResults === true) continue;

    if (item.ownerUsername) {
      const seen = owners.get(item.ownerUsername);
      if (seen) seen.count += 1;
      else
        owners.set(item.ownerUsername, {
          fullName: item.ownerFullName ?? null,
          count: 1,
        });
    }

    const shortCode = item.shortCode ?? item.id;
    const timestamp = item.timestamp;

    // Without an id or a date a post cannot be stored or scored — `published_at`
    // is NOT NULL and the whole velocity calculation rests on it.
    if (!shortCode || !timestamp || Number.isNaN(Date.parse(timestamp))) {
      rejected.push(raw);
      continue;
    }

    posts.push({
      postId: shortCode,
      kind: kindOf(item),
      title: titleFrom(item.caption, shortCode),
      url: item.url ?? `https://www.instagram.com/p/${shortCode}/`,
      thumbnailUrl: item.displayUrl ?? null,
      durationSeconds: item.videoDuration === null || item.videoDuration === undefined
        ? null
        : Math.round(item.videoDuration),
      viewCount: viewsOf(item),
      likeCount: item.likesCount ?? null,
      commentCount: item.commentsCount ?? null,
      publishedAt: new Date(timestamp).toISOString(),
    });
  }

  return { profile: majorityOwner(owners), posts, rejected };
}

/** The account that appears on the most posts. Ties break on first seen. */
function majorityOwner(
  owners: Map<string, { fullName: string | null; count: number }>,
): InstagramProfile | null {
  let best: InstagramProfile | null = null;
  let bestCount = 0;

  for (const [username, { fullName, count }] of owners) {
    if (count > bestCount) {
      best = { username, fullName };
      bestCount = count;
    }
  }

  return best;
}
