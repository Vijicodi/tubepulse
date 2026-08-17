import { describe, expect, it } from "vitest";
import {
  countWords,
  decodeEntities,
  idFromUrl,
  normalizeTranscript,
  transcriptError,
} from "@/lib/schemas/transcript";
import fixture from "./fixtures/transcript-run.json";
import {
  buildSummaryPrompt,
  formatSummary,
  MAX_TRANSCRIPT_CHARS,
  summarySchema,
} from "@/lib/transcripts/summary-prompt";

describe("idFromUrl", () => {
  it("reads the v= parameter", () => {
    expect(idFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("reads a youtu.be short link", () => {
    expect(idFromUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("survives extra query parameters", () => {
    expect(idFromUrl("https://www.youtube.com/watch?v=abc123XYZ_9&t=42s")).toBe(
      "abc123XYZ_9",
    );
  });

  it("returns null for something that is not a URL", () => {
    expect(idFromUrl("just some text")).toBeNull();
    expect(idFromUrl(null)).toBeNull();
  });
});

describe("normalizeTranscript", () => {
  // Every actor disagrees about the shape. These are the layouts seen across
  // the transcript actors on Apify — all four must work, because switching
  // actor should be an .env edit and not a code change.

  it("handles one item holding the whole thing as a string", () => {
    const result = normalizeTranscript([
      { videoId: "dQw4w9WgXcQ", title: "A video", transcript: "Hello there friends" },
    ]);

    expect(result.text).toBe("Hello there friends");
    expect(result.videoId).toBe("dQw4w9WgXcQ");
    expect(result.title).toBe("A video");
    expect(result.wordCount).toBe(3);
  });

  it("handles one item holding an array of timed segments", () => {
    const result = normalizeTranscript([
      {
        videoId: "dQw4w9WgXcQ",
        transcript: [
          { text: "second", start: 10 },
          { text: "first", start: 0 },
        ],
      },
    ]);

    // Ordered by start, not by array position — some actors emit them unsorted.
    expect(result.text).toBe("first second");
  });

  it("handles one dataset item PER caption line", () => {
    const result = normalizeTranscript([
      { videoId: "dQw4w9WgXcQ", text: "the first line" },
      { text: "the second line" },
    ]);

    expect(result.text).toBe("the first line the second line");
    expect(result.videoId).toBe("dQw4w9WgXcQ");
  });

  it("handles the captions and segments and nested data keys", () => {
    expect(normalizeTranscript([{ captions: [{ text: "via captions" }] }]).text).toBe(
      "via captions",
    );
    expect(normalizeTranscript([{ segments: [{ text: "via segments" }] }]).text).toBe(
      "via segments",
    );
    expect(normalizeTranscript([{ data: { transcript: "via data" } }]).text).toBe(
      "via data",
    );
  });

  it("treats null like a missing key, the way Apify actors actually behave", () => {
    // `.nullish()` not `.optional()` — a test already caught this class of bug
    // dropping valid videos in the channel normalizer.
    const result = normalizeTranscript([
      { videoId: null, title: null, language: null, transcript: "still fine" },
    ]);

    expect(result.text).toBe("still fine");
    expect(result.videoId).toBeNull();
  });

  it("skips a malformed item rather than losing the whole transcript", () => {
    const result = normalizeTranscript([
      "not an object at all",
      { text: "the good line" },
    ]);

    expect(result.text).toBe("the good line");
  });

  it("collapses the whitespace captions arrive full of", () => {
    const result = normalizeTranscript([
      { transcript: [{ text: "  spaced   out  " }, { text: "\nlines\n" }] },
    ]);

    expect(result.text).toBe("spaced out lines");
  });

  it("returns empty text when there is genuinely nothing", () => {
    // The caller turns this into "no captions for that video", which is a real
    // and common outcome — not a crash.
    expect(normalizeTranscript([]).text).toBe("");
    expect(normalizeTranscript([{ transcript: [] }]).text).toBe("");
  });

  it("takes the id from the url when the actor does not report one", () => {
    const result = normalizeTranscript([
      { url: "https://www.youtube.com/watch?v=abc123XYZ_9", transcript: "words here" },
    ]);

    expect(result.videoId).toBe("abc123XYZ_9");
  });
});

describe("countWords", () => {
  it("counts words, not characters", () => {
    expect(countWords("one two three")).toBe(3);
  });

  it("is zero for empty and whitespace", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n  ")).toBe(0);
  });
});

describe("buildSummaryPrompt", () => {
  it("asks for two or three sentences, not a wall", () => {
    const prompt = buildSummaryPrompt({ title: "A video", text: "words" });
    expect(prompt).toMatch(/TWO OR THREE SENTENCES/);
    expect(prompt).toContain("A video");
  });

  it("truncates a very long transcript and says that it did", () => {
    const long = "word ".repeat(20_000);
    const prompt = buildSummaryPrompt({ title: null, text: long });

    expect(prompt).toContain("transcript truncated");
    // Prompt stays bounded regardless of how long the video was.
    expect(prompt.length).toBeLessThan(MAX_TRANSCRIPT_CHARS + 1_000);
  });

  it("omits the title line entirely when there is no title", () => {
    expect(buildSummaryPrompt({ title: null, text: "words" })).not.toContain(
      "VIDEO TITLE",
    );
  });
});

describe("summarySchema and formatSummary", () => {
  const valid = {
    summary:
      "The video argues the cheaper phone won on battery and runs both through the same test. " +
      "It concedes the camera is clearly worse and does not pretend otherwise.",
    keyPoints: [
      "Runs the battery test on both handsets",
      "Explains why the cheaper model won",
      "Concedes the camera is worse",
    ],
  };

  it("accepts a well-formed summary", () => {
    expect(summarySchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a one-word summary and a keyword list", () => {
    expect(summarySchema.safeParse({ ...valid, summary: "Good." }).success).toBe(false);
    expect(
      summarySchema.safeParse({ ...valid, keyPoints: ["battery", "camera", "price"] })
        .success,
    ).toBe(false);
  });

  it("renders as plain text, so the row stays readable in the database", () => {
    const formatted = formatSummary(valid);
    expect(formatted.startsWith(valid.summary)).toBe(true);
    expect(formatted).toContain("• Runs the battery test on both handsets");
  });
});

// ---------------------------------------------------------------------------
// Against the REAL response from supreme_coder/youtube-transcript-scraper.
//
// This fixture is why the feature works. The first version of the normalizer
// was written from guesses about the shape and every one of the bugs below got
// through: the input key was wrong, the title and id are nested, and the text
// arrives HTML-escaped. Capturing one real run found all four in a minute.
// ---------------------------------------------------------------------------
describe("the real actor response", () => {
  it("produces a transcript, an id, a title and a language code", () => {
    const result = normalizeTranscript(fixture);

    expect(result.text.length).toBeGreaterThan(0);
    expect(result.videoId).toBe("dQw4w9WgXcQ");
    // Nested under videoDetails, not at the top level.
    expect(result.title).toContain("Never Gonna Give You Up");
    // "en", not "English" — the column documents BCP-47.
    expect(result.language).toBe("en");
    expect(result.wordCount).toBeGreaterThan(0);
  });

  it("decodes the HTML entities the captions arrive wrapped in", () => {
    // Real text from the run: "♪ We&#39;re no strangers to love ♪". Stored raw,
    // every apostrophe in every transcript reads as &#39; on screen and goes to
    // the summariser that way.
    const result = normalizeTranscript(fixture);

    expect(result.text).toContain("We're no strangers to love");
    expect(result.text).not.toContain("&#39;");
    expect(result.text).not.toMatch(/&#\d+;/);
  });

  it("keeps the caption lines in their spoken order", () => {
    const result = normalizeTranscript(fixture);
    expect(result.text.indexOf("no strangers")).toBeLessThan(
      result.text.indexOf("full commitment"),
    );
  });

  it("reports no error for a healthy run", () => {
    expect(transcriptError(fixture)).toBeNull();
  });
});

describe("transcriptError", () => {
  it("surfaces a rejected input instead of blaming the video", () => {
    // THE BUG THAT SHIPPED. Sending the wrong input key produces a SUCCEEDED
    // run whose dataset holds only this — which the first version reported as
    // "no captions came back for that video", sending you to check the video.
    const rejected = [
      {
        errorCode: "NO_VIDEOS_FOUND",
        error: "No videos to scrape. Provide video, channel, or playlist URLs, or search keywords.",
      },
    ];

    expect(transcriptError(rejected)).toBe(
      "No videos to scrape. Provide video, channel, or playlist URLs, or search keywords.",
    );
  });

  it("falls back to the code when there is no message", () => {
    expect(transcriptError([{ errorCode: "QUOTA_EXCEEDED" }])).toBe(
      "The transcript actor reported QUOTA_EXCEEDED.",
    );
  });
});

describe("decodeEntities", () => {
  it("handles decimal, hex and named entities", () => {
    expect(decodeEntities("We&#39;re")).toBe("We're");
    expect(decodeEntities("We&#x27;re")).toBe("We're");
    expect(decodeEntities("Tom &amp; Jerry")).toBe("Tom & Jerry");
    expect(decodeEntities("&quot;quoted&quot;")).toBe('"quoted"');
  });

  it("leaves an unknown entity alone rather than mangling it", () => {
    expect(decodeEntities("100 &widget; each")).toBe("100 &widget; each");
  });

  it("does not touch ordinary text", () => {
    expect(decodeEntities("plain words here")).toBe("plain words here");
  });
});
