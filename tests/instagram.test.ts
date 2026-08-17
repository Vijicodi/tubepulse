import { describe, expect, it } from "vitest";
import {
  InvalidProfileInputError,
  parseProfileInput,
} from "@/lib/instagram/profile-url";
import { parseTarget, platformFromInput } from "@/lib/platform/parse";
import {
  instagramError,
  kindOf,
  normalizeInstagramDataset,
  titleFrom,
  viewsOf,
} from "@/lib/schemas/instagram";
import { scoreVideos } from "@/lib/ideas/score";
import fixture from "./fixtures/instagram-run.json";

describe("parseProfileInput", () => {
  it("accepts the forms people actually paste", () => {
    for (const input of [
      "@nasa",
      "nasa",
      "instagram.com/nasa",
      "https://www.instagram.com/nasa/",
      "https://instagram.com/nasa/reels/",
    ]) {
      expect(parseProfileInput(input).username).toBe("nasa");
      expect(parseProfileInput(input).profileUrl).toBe("https://www.instagram.com/nasa/");
    }
  });

  it("REJECTS a hashtag feed, with a reason", () => {
    // Explicitly asked for: no hashtags. A tag's posts belong to hundreds of
    // accounts, so a median over them means nothing.
    expect(() => parseProfileInput("https://www.instagram.com/explore/tags/space/")).toThrow(
      InvalidProfileInputError,
    );

    try {
      parseProfileInput("https://www.instagram.com/explore/tags/space/");
    } catch (error) {
      expect((error as Error).message).toMatch(/hashtag or location feed/i);
    }
  });

  it("rejects a single post link and says to paste the profile", () => {
    try {
      parseProfileInput("https://www.instagram.com/p/Db8wcqjvmGS/");
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as Error).message).toMatch(/single post/i);
    }
  });

  it("rejects Instagram's own pages, not just anything", () => {
    expect(() => parseProfileInput("https://www.instagram.com/accounts/login/")).toThrow();
    expect(() => parseProfileInput("https://example.com/nasa")).toThrow();
  });
});

describe("platform detection", () => {
  it("reads the platform out of a pasted URL", () => {
    expect(platformFromInput("https://www.instagram.com/nasa/")).toBe("instagram");
    expect(platformFromInput("https://youtube.com/@mkbhd")).toBe("youtube");
    expect(platformFromInput("https://youtu.be/dQw4w9WgXcQ")).toBe("youtube");
    expect(platformFromInput("@nasa")).toBeNull();
  });

  it("lets a pasted URL beat the selector", () => {
    // Someone pastes an Instagram link while the toggle still says YouTube.
    // The obvious intent is Instagram.
    expect(parseTarget("https://www.instagram.com/nasa/", "youtube").platform).toBe(
      "instagram",
    );
    expect(parseTarget("https://youtube.com/@mkbhd", "instagram").platform).toBe("youtube");
  });

  it("uses the selector only for a bare handle, which is ambiguous", () => {
    expect(parseTarget("@nasa", "instagram").platform).toBe("instagram");
    expect(parseTarget("@mkbhd", "youtube").platform).toBe("youtube");
  });
});

describe("kindOf and viewsOf", () => {
  it("calls a clips post a reel and an image a post", () => {
    expect(kindOf({ type: "Video", productType: "clips" })).toBe("reel");
    expect(kindOf({ type: "Image" })).toBe("post");
    expect(kindOf({ type: "Sidecar" })).toBe("post");
  });

  it("gives a static post NO view count rather than zero", () => {
    // Zero is a claim that nobody watched. A photo is not something you watch.
    expect(viewsOf({ type: "Image", likesCount: 2_319_208 })).toBeNull();
  });

  it("prefers plays over views for a reel", () => {
    expect(
      viewsOf({ type: "Video", productType: "clips", videoPlayCount: 11_103_242, videoViewCount: 2_675_326 }),
    ).toBe(11_103_242);
  });
});

describe("titleFrom", () => {
  it("uses the first line of the caption", () => {
    expect(titleFrom("First line\nsecond line", "ABC")).toBe("First line");
  });

  it("falls back to the shortcode when there is no caption", () => {
    expect(titleFrom(null, "ABC123")).toBe("Post ABC123");
    expect(titleFrom("   ", "ABC123")).toBe("Post ABC123");
  });

  it("truncates a caption that is really a wall of hashtags", () => {
    const title = titleFrom("x".repeat(400), "ABC");
    expect(title.length).toBeLessThanOrEqual(120);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("instagramError", () => {
  it("reports a private or empty account instead of blaming us", () => {
    const message = instagramError([{ noResults: true }, { noResults: true }]);
    expect(message).toMatch(/private, have no posts yet, or the handle/i);
  });

  it("stays silent on a healthy run", () => {
    expect(instagramError(fixture)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Against the REAL captured run (nasa, 10 items).
// ---------------------------------------------------------------------------
describe("the real Instagram response", () => {
  const { profile, posts, rejected } = normalizeInstagramDataset(fixture);

  it("names the account by MAJORITY, not by the first post", () => {
    // The captured run holds two collab posts owned by partner accounts —
    // spherevegas and astro_jessica. Taking the first post's owner would have
    // named this channel "Sphere". Eight of the ten are nasa.
    expect(profile?.username).toBe("nasa");
    expect(profile?.fullName).toBe("NASA");
  });

  it("keeps every post and rejects nothing", () => {
    expect(posts.length).toBe(fixture.length);
    expect(rejected).toHaveLength(0);
  });

  it("separates reels from static posts", () => {
    expect(posts.some((post) => post.kind === "reel")).toBe(true);
    expect(posts.some((post) => post.kind === "post")).toBe(true);
  });

  it("gives reels plays and posts no view count at all", () => {
    for (const post of posts) {
      if (post.kind === "reel") expect(post.viewCount).toBeGreaterThan(0);
      else expect(post.viewCount).toBeNull();
    }
  });

  it("stores a real published date for every post", () => {
    for (const post of posts) {
      expect(Number.isNaN(Date.parse(post.publishedAt))).toBe(false);
    }
  });
});

describe("scoring reels and posts in separate pools", () => {
  // THE BUG THIS PREVENTS: one reel at 11 million plays, pooled with photos
  // measured in likes, makes every photo on the account read as a failure.
  const now = new Date("2026-08-17T00:00:00.000Z");

  const make = (kind: "reel" | "post", value: number, day: string) => ({
    videoId: `${kind}-${value}`,
    kind,
    title: "t",
    url: "https://www.instagram.com/p/x/",
    thumbnailUrl: null,
    durationSeconds: null,
    viewCount: kind === "reel" ? value : null,
    likeCount: kind === "post" ? value : null,
    commentCount: null,
    publishedAt: `2026-0${day}T00:00:00.000Z`,
  });

  it("scores a typical photo near 1.0 despite a viral reel in the same account", () => {
    const scored = scoreVideos(
      [
        make("reel", 11_000_000, "1-01"),
        make("reel", 900_000, "1-02"),
        make("reel", 800_000, "1-03"),
        make("post", 100_000, "1-04"),
        make("post", 110_000, "1-05"),
        make("post", 90_000, "1-06"),
      ],
      now,
    );

    const typicalPhoto = scored.find((s) => s.videoId === "post-100000")!;
    // Against the median PHOTO (100k), not against 11 million plays.
    expect(typicalPhoto.outlierScore).toBeGreaterThan(0.8);
    expect(typicalPhoto.outlierScore).toBeLessThan(1.3);

    const viralReel = scored.find((s) => s.videoId === "reel-11000000")!;
    expect(viralReel.outlierScore).toBeGreaterThan(5);
  });

  it("leaves an unscoreable item at zero rather than guessing", () => {
    const scored = scoreVideos([make("post", 0, "1-04")], now);
    expect(scored[0].outlierScore).toBe(0);
  });
});
