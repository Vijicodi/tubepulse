import { afterEach, describe, expect, it, vi } from "vitest";

// data-api.ts is server-only; the guard package throws outside a server build.
vi.mock("server-only", () => ({}));

const { isoDurationToSeconds, readChannelViaApi, videoFromApi, YoutubeApiUnavailable, YoutubeChannelNotFound } =
  await import("@/lib/youtube/data-api");

const CHANNEL_ID = "UCabcdefghijklmnopqrstuv";

function videoItem(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    snippet: {
      title: `Video ${id}`,
      publishedAt: "2026-09-01T10:00:00Z",
      liveBroadcastContent: "none",
      thumbnails: { high: { url: `https://i.ytimg.com/vi/${id}/hq.jpg` } },
    },
    statistics: { viewCount: "12345", likeCount: "100", commentCount: "7" },
    contentDetails: { duration: "PT12M5S" },
    ...overrides,
  };
}

describe("isoDurationToSeconds", () => {
  it.each([
    ["PT12M5S", 725],
    ["PT1H", 3600],
    ["PT45S", 45],
    ["P1DT2H", 93_600],
    ["PT0S", 0],
  ])("%s → %d", (iso, seconds) => {
    expect(isoDurationToSeconds(iso)).toBe(seconds);
  });

  it("returns null for nonsense", () => {
    expect(isoDurationToSeconds("12 minutes")).toBeNull();
    expect(isoDurationToSeconds(undefined)).toBeNull();
  });
});

describe("videoFromApi", () => {
  it("maps a normal upload to the same shape the Apify path stored", () => {
    expect(videoFromApi(videoItem("abcdefghijk"))).toEqual({
      videoId: "abcdefghijk",
      title: "Video abcdefghijk",
      url: "https://www.youtube.com/watch?v=abcdefghijk",
      thumbnailUrl: "https://i.ytimg.com/vi/abcdefghijk/hq.jpg",
      durationSeconds: 725,
      viewCount: 12_345,
      likeCount: 100,
      commentCount: 7,
      publishedAt: "2026-09-01T10:00:00Z",
    });
  });

  it("keeps a video whose likes/comments are hidden, with nulls", () => {
    const video = videoFromApi(videoItem("abcdefghijk", { statistics: { viewCount: "5" } }));
    expect(video?.likeCount).toBeNull();
    expect(video?.commentCount).toBeNull();
  });

  it("drops streams and upcoming premieres — the actor never read those", () => {
    expect(videoFromApi(videoItem("abcdefghijk", { liveStreamingDetails: {} }))).toBeNull();
    expect(
      videoFromApi(
        videoItem("abcdefghijk", {
          snippet: { title: "x", publishedAt: "2026-09-01T10:00:00Z", liveBroadcastContent: "upcoming" },
        }),
      ),
    ).toBeNull();
  });

  it("drops a video with no view count rather than storing 0", () => {
    expect(videoFromApi(videoItem("abcdefghijk", { statistics: {} }))).toBeNull();
  });
});

describe("readChannelViaApi", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubYoutube(routes: Record<string, unknown>) {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL) => {
        const url = new URL(String(input));
        calls.push(`${url.pathname.split("/").pop()}?${url.searchParams.toString()}`);
        const name = url.pathname.split("/").pop()!;
        const body = typeof routes[name] === "function"
          ? (routes[name] as (u: URL) => unknown)(url)
          : routes[name];
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    return calls;
  }

  it("reads the long-form list, pages until maxResults, and never asks for more", async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `vid${String(i).padStart(8, "0")}`);
    const calls = stubYoutube({
      channels: {
        items: [
          {
            id: CHANNEL_ID,
            snippet: { title: "Test channel", thumbnails: { default: { url: "https://x/y.jpg" } } },
            statistics: { subscriberCount: "999" },
          },
        ],
      },
      playlistItems: (url: URL) => {
        const page = Number(url.searchParams.get("pageToken") ?? 0);
        const slice = ids.slice(page * 50, page * 50 + 50);
        return {
          items: slice.map((videoId) => ({ contentDetails: { videoId } })),
          nextPageToken: page * 50 + 50 < ids.length ? String(page + 1) : undefined,
        };
      },
      videos: (url: URL) => ({
        items: url.searchParams.get("id")!.split(",").map((id) => videoItem(id)),
      }),
    });

    const result = await readChannelViaApi({
      handle: "@test",
      channelUrl: "https://www.youtube.com/@test",
      maxResults: 100,
      apiKey: "k",
    });

    expect(result.channel).toMatchObject({ title: "Test channel", subscriberCount: 999 });
    expect(result.videos).toHaveLength(100);
    expect(calls.filter((c) => c.startsWith("playlistItems"))).toHaveLength(2);
    expect(calls.some((c) => c.includes(`playlistId=UULF${CHANNEL_ID.slice(2)}`))).toBe(true);
    expect(calls.find((c) => c.startsWith("channels"))).toContain("forHandle=%40test");
  });

  it("says plainly when a handle does not exist", async () => {
    stubYoutube({ channels: { items: [] } });
    await expect(
      readChannelViaApi({ handle: "@nobody", channelUrl: "https://www.youtube.com/@nobody", maxResults: 50, apiKey: "k" }),
    ).rejects.toBeInstanceOf(YoutubeChannelNotFound);
  });

  it("hands a legacy /c/ name it cannot resolve back for the Apify fallback", async () => {
    stubYoutube({ channels: { items: [] } });
    await expect(
      readChannelViaApi({ handle: "@oldname", channelUrl: "https://www.youtube.com/c/oldname", maxResults: 50, apiKey: "k" }),
    ).rejects.toBeInstanceOf(YoutubeApiUnavailable);
  });

  it("treats a spent quota as unavailable (→ Apify fallback), not as a missing channel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { errors: [{ reason: "quotaExceeded" }] } }), { status: 403 }),
      ),
    );
    await expect(
      readChannelViaApi({ handle: "@test", channelUrl: "https://www.youtube.com/@test", maxResults: 50, apiKey: "k" }),
    ).rejects.toBeInstanceOf(YoutubeApiUnavailable);
  });

  it("refuses to run with no key", async () => {
    await expect(
      readChannelViaApi({ handle: "@test", channelUrl: "https://www.youtube.com/@test", maxResults: 50, apiKey: "" }),
    ).rejects.toBeInstanceOf(YoutubeApiUnavailable);
  });
});
