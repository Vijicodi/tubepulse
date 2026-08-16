import { describe, expect, it } from "vitest";
import { normalizeApifyDataset } from "@/lib/apify/normalize";
import { countLike, dateLike, durationLike } from "@/lib/schemas/youtube";
import fixture from "./fixtures/apify-channel-videos.json";

/**
 * These tests are the reason an agent can refactor the normalizer without you
 * reading the diff. The fixture is a real-shaped Apify response including the
 * messy cases: abbreviated counts, ISO durations, and items missing fields.
 */

describe("countLike", () => {
  it("reads plain numbers and comma-formatted strings", () => {
    expect(countLike.parse(12345)).toBe(12345);
    expect(countLike.parse("12,345")).toBe(12345);
  });

  it("expands the K/M/B abbreviations YouTube shows", () => {
    expect(countLike.parse("1.2K")).toBe(1200);
    expect(countLike.parse("3.4M")).toBe(3_400_000);
    expect(countLike.parse("2B")).toBe(2_000_000_000);
  });

  it("returns 0 rather than NaN for junk, so a bad field cannot poison a row", () => {
    for (const input of [null, undefined, "", "unknown", "N/A"]) {
      expect(countLike.parse(input)).toBe(0);
    }
  });
});

describe("durationLike", () => {
  it("reads ISO 8601, clock format and raw seconds", () => {
    expect(durationLike.parse("PT4M13S")).toBe(253);
    expect(durationLike.parse("PT1H2M3S")).toBe(3723);
    expect(durationLike.parse("4:13")).toBe(253);
    expect(durationLike.parse("1:02:03")).toBe(3723);
    expect(durationLike.parse(253)).toBe(253);
  });

  it("returns null for unusable values instead of guessing", () => {
    expect(durationLike.parse("live")).toBeNull();
    expect(durationLike.parse(null)).toBeNull();
  });
});

describe("dateLike", () => {
  it("normalizes to ISO", () => {
    expect(dateLike.parse("2026-03-01T10:00:00Z")).toBe("2026-03-01T10:00:00.000Z");
  });

  it("returns null for unparseable dates", () => {
    expect(dateLike.parse("last tuesday")).toBeNull();
    expect(dateLike.parse(undefined)).toBeNull();
  });
});

describe("normalizeApifyDataset", () => {
  const result = normalizeApifyDataset(fixture);

  it("keeps the well-formed videos", () => {
    expect(result.videos).toHaveLength(3);
    expect(result.videos.map((video) => video.videoId)).toEqual(["aaa111", "bbb222", "ccc333"]);
  });

  it("coerces the messy fields into stored types", () => {
    const [first, second] = result.videos;
    expect(first.viewCount).toBe(1_200_000);
    expect(first.durationSeconds).toBe(253);
    expect(second.viewCount).toBe(48_300);
    expect(second.likeCount).toBe(2_100);
  });

  it("extracts the channel from the first item that carries it", () => {
    expect(result.channel).toEqual({
      handle: "@testchannel",
      channelUrl: "https://www.youtube.com/@testchannel",
      title: "Test Channel",
      subscriberCount: 1_500_000,
      thumbnailUrl: "https://example.com/avatar.jpg",
    });
  });

  it("drops unusable items instead of failing the whole run", () => {
    // The fixture has one item with no date and one that is not an object.
    expect(result.rejected.length).toBeGreaterThan(0);
    expect(result.videos.every((video) => video.publishedAt !== null)).toBe(true);
  });

  it("returns an empty result for an empty dataset rather than throwing", () => {
    expect(normalizeApifyDataset([])).toEqual({ channel: null, videos: [], rejected: [] });
  });
});
