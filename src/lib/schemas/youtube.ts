import { z } from "zod";

/**
 * The trust boundary.
 *
 * Everything above these schemas is untrusted: Apify actors change their output
 * shape without telling you, and YouTube changes under them. Everything below
 * is trusted and typed.
 *
 * Rule: raw scraper output NEVER reaches the database without passing through
 * here first. See `docs/decisions/0003-normalize-at-the-boundary.md`.
 */

/** Coerce the several ways scrapers report a count: 12345, "12,345", "12.3K". */
export const countLike = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

    const cleaned = value.trim().replace(/,/g, "").toUpperCase();
    const match = /^([0-9]*\.?[0-9]+)\s*([KMB])?$/.exec(cleaned);
    if (!match) return 0;

    const base = Number.parseFloat(match[1]);
    const multiplier = match[2] === "B" ? 1e9 : match[2] === "M" ? 1e6 : match[2] === "K" ? 1e3 : 1;
    return Math.max(0, Math.round(base * multiplier));
  });

/** Coerce "PT4M13S", "4:13", or a number of seconds into seconds. */
export const durationLike = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : null;

    const text = value.trim();

    const iso = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(text);
    if (iso) {
      const [, h, m, s] = iso;
      return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
    }

    if (/^\d{1,2}(:\d{2}){1,2}$/.test(text)) {
      return text
        .split(":")
        .map(Number)
        .reduce((total, part) => total * 60 + part, 0);
    }

    return null;
  });

/** A date that may arrive as ISO, a timestamp, or nonsense. */
export const dateLike = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === null || value === undefined) return null;
    const date = new Date(typeof value === "number" ? value : value.trim());
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  });

/**
 * One item as an Apify YouTube actor emits it. Deliberately permissive with
 * `.passthrough()`-style tolerance: unknown extra keys are fine, we just ignore
 * them. What we DO require is an id, a title and a URL — without those the item
 * is unusable and gets dropped rather than stored as junk.
 */
export const rawApifyVideoSchema = z.looseObject({
  id: z.string().nullish(),
  videoId: z.string().nullish(),
  title: z.string().nullish(),
  url: z.string().nullish(),
  thumbnailUrl: z.string().nullish(),
  viewCount: z.unknown().optional(),
  likes: z.unknown().optional(),
  commentsCount: z.unknown().optional(),
  duration: z.unknown().optional(),
  date: z.unknown().optional(),
  channelName: z.string().nullish(),
  channelUrl: z.string().nullish(),
  numberOfSubscribers: z.unknown().optional(),
  channelThumbnailUrl: z.string().nullish(),
});

export type RawApifyVideo = z.infer<typeof rawApifyVideoSchema>;

/** A video after normalization. This shape is what the database stores. */
export const videoSchema = z.object({
  videoId: z.string().min(1),
  title: z.string().min(1),
  url: z.url(),
  thumbnailUrl: z.string().nullable(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  viewCount: z.number().int().nonnegative(),
  likeCount: z.number().int().nonnegative().nullable(),
  commentCount: z.number().int().nonnegative().nullable(),
  publishedAt: z.iso.datetime(),
});

export type Video = z.infer<typeof videoSchema>;

/** A channel after normalization. */
export const channelSchema = z.object({
  handle: z.string().min(1),
  channelUrl: z.url(),
  title: z.string().nullable(),
  subscriberCount: z.number().int().nonnegative().nullable(),
  thumbnailUrl: z.string().nullable(),
});

export type Channel = z.infer<typeof channelSchema>;
