import { describe, expect, it } from "vitest";
import {
  MIN_SAMPLE,
  byDayOfWeek,
  byLength,
  byTitleTrait,
  engagementRates,
  formatLift,
} from "@/lib/analytics/patterns";
import type { VideoRow } from "@/lib/supabase/types";

/**
 * These numbers become advice, which is what makes them dangerous.
 *
 * "Tuesdays outperform by 4.2x" from a sample of three is one lucky video
 * wearing a trend's clothes, and a creator who reschedules their week around it
 * has been misled by their own tool. So the tests here are mostly about what
 * the module REFUSES to claim.
 */

let counter = 0;

function video(over: Partial<VideoRow> = {}): VideoRow {
  counter += 1;
  return {
    id: `row-${counter}`,
    channel_id: "chan-1",
    video_id: `vid-${counter}`,
    kind: "video",
    title: "An ordinary video title",
    url: "https://youtube.com/watch?v=x",
    thumbnail_url: null,
    duration_seconds: 600,
    view_count: 10_000,
    like_count: 400,
    comment_count: 60,
    published_at: "2026-08-04T12:00:00.000Z", // a Tuesday
    outlier_score: 1,
    velocity: 100,
    created_at: "2026-08-05T00:00:00.000Z",
    ...over,
  };
}

/** n videos on the given UTC date, each with the same score. */
function many(n: number, over: Partial<VideoRow> = {}): VideoRow[] {
  return Array.from({ length: n }, () => video(over));
}

describe("refusing to claim things the sample cannot support", () => {
  it("marks a thin bucket unreliable", () => {
    const pattern = byDayOfWeek(many(MIN_SAMPLE - 1, { outlier_score: 4 }));
    const tuesday = pattern.buckets.find((bucket) => bucket.label === "Tuesday");

    expect(tuesday?.sampleSize).toBe(MIN_SAMPLE - 1);
    expect(tuesday?.isReliable).toBe(false);
  });

  it("names no best day when nothing clears the bar", () => {
    // THE IMPORTANT ONE. Three videos on a Tuesday, one of which went wide,
    // must not produce "post on Tuesdays".
    const pattern = byDayOfWeek(many(3, { outlier_score: 9 }));
    expect(pattern.best).toBeNull();
  });

  it("names a best day once the sample is real", () => {
    const pattern = byDayOfWeek([
      ...many(MIN_SAMPLE, { outlier_score: 3 }), // Tuesdays
      ...many(MIN_SAMPLE, {
        outlier_score: 1,
        published_at: "2026-08-07T12:00:00.000Z", // Friday
      }),
    ]);

    expect(pattern.best?.label).toBe("Tuesday");
    expect(pattern.best?.isReliable).toBe(true);
  });

  it("picks the strongest RELIABLE bucket, not the strongest bucket", () => {
    // A thin Friday scoring 20x must not beat a solid Tuesday scoring 3x.
    const pattern = byDayOfWeek([
      ...many(MIN_SAMPLE, { outlier_score: 3 }), // Tuesdays, reliable
      ...many(2, {
        outlier_score: 20,
        published_at: "2026-08-07T12:00:00.000Z", // Fridays, thin
      }),
    ]);

    expect(pattern.best?.label).toBe("Tuesday");
  });
});

describe("day of week", () => {
  it("keeps calendar order rather than sorting by performance", () => {
    // A reader scanning for a day needs the days where days live.
    const pattern = byDayOfWeek([
      ...many(2, { published_at: "2026-08-07T12:00:00.000Z" }), // Friday
      ...many(2, { published_at: "2026-08-03T12:00:00.000Z" }), // Monday
    ]);

    const labels = pattern.buckets.map((bucket) => bucket.label);
    expect(labels.indexOf("Monday")).toBeLessThan(labels.indexOf("Friday"));
  });

  it("ignores videos with no usable score", () => {
    const pattern = byDayOfWeek([
      ...many(2),
      video({ outlier_score: null }),
      video({ outlier_score: 0 }),
    ]);

    expect(pattern.totalVideos).toBe(2);
  });
});

describe("length", () => {
  it("buckets by duration, not by round numbers", () => {
    const pattern = byLength([
      ...many(2, { duration_seconds: 30 }),
      ...many(2, { duration_seconds: 700 }),
    ]);

    const labels = pattern.buckets.map((bucket) => bucket.label);
    expect(labels).toContain("Under 1 min");
    expect(labels).toContain("8-15 min");
  });

  it("drops videos with no duration rather than guessing one", () => {
    // Guessing would put a real score into a made-up bucket.
    const pattern = byLength([...many(3), video({ duration_seconds: null })]);
    expect(pattern.totalVideos).toBe(3);
  });
});

describe("title traits", () => {
  it("compares against the videos that do NOT have the trait", () => {
    const withNumbers = many(MIN_SAMPLE, {
      title: "5 things I got wrong",
      outlier_score: 3,
    });
    const without = many(MIN_SAMPLE, { title: "A quiet reflection", outlier_score: 1 });

    const traits = byTitleTrait([...withNumbers, ...without]);
    const numbers = traits.find((trait) => trait.label === "Contains a number");

    expect(numbers?.lift).toBeCloseTo(3, 5);
    expect(numbers?.isReliable).toBe(true);
  });

  it("is unreliable unless BOTH sides clear the sample floor", () => {
    // A lift computed against two videos is not a comparison.
    const traits = byTitleTrait([
      ...many(MIN_SAMPLE, { title: "5 things", outlier_score: 3 }),
      ...many(2, { title: "no digits here", outlier_score: 1 }),
    ]);

    const numbers = traits.find((trait) => trait.label === "Contains a number");
    expect(numbers?.isReliable).toBe(false);
  });

  it("never divides by zero when every title has the trait", () => {
    const traits = byTitleTrait(many(MIN_SAMPLE, { title: "5 things" }));
    const numbers = traits.find((trait) => trait.label === "Contains a number");

    // No comparison group means no claim, which is a lift of exactly 1.
    expect(numbers?.lift).toBe(1);
    expect(Number.isFinite(numbers?.lift ?? 0)).toBe(true);
  });

  it("omits traits no title on this channel has", () => {
    const traits = byTitleTrait(many(MIN_SAMPLE, { title: "plain words only" }));
    expect(traits.some((trait) => trait.label === "Asks a question")).toBe(false);
  });

  it("sorts by how far from neutral a trait is, in either direction", () => {
    // A trait that HURTS is as useful as one that helps.
    const traits = byTitleTrait([
      ...many(MIN_SAMPLE, { title: "Why did it fail?", outlier_score: 0.2 }),
      ...many(MIN_SAMPLE, { title: "plain words", outlier_score: 2 }),
    ]);

    expect(traits[0]?.label).toBe("Asks a question");
  });
});

describe("engagement", () => {
  it("reports likes and comments per thousand views", () => {
    const [row] = engagementRates([
      video({ view_count: 10_000, like_count: 400, comment_count: 60 }),
    ]);

    expect(row.likeRate).toBeCloseTo(40, 5);
    expect(row.commentRate).toBeCloseTo(6, 5);
  });

  it("returns null, never zero, when a count is missing", () => {
    // A static Instagram post has no view count at all. Dividing by it would
    // invent an engagement rate for something that cannot be watched.
    const rows = engagementRates([
      video({ view_count: null, like_count: 900, comment_count: null }),
    ]);

    expect(rows).toHaveLength(0);
  });

  it("surfaces a well-loved small video above a flat big one", () => {
    // The thing raw view counts hide, and the reason this exists.
    const rows = engagementRates([
      video({ view_count: 1_000_000, like_count: 5_000 }), // 5 per 1k
      video({ view_count: 20_000, like_count: 2_000 }), // 100 per 1k
    ]);

    expect(rows[0].likeRate).toBeGreaterThan(rows[1].likeRate ?? 0);
    expect(rows[0].video.view_count).toBe(20_000);
  });
});

describe("formatting", () => {
  it("reads a lift as a multiple", () => {
    expect(formatLift(3.14)).toBe("3.1x");
    expect(formatLift(0.82)).toBe("0.8x");
  });
});
