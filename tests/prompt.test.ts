import { describe, expect, it } from "vitest";
import { buildPrompt, ideaSchema, ideasResponseSchema, MAX_IDEAS } from "@/lib/ideas/prompt";
import type { ScoredVideo } from "@/lib/ideas/score";

const video = (videoId: string, title: string): ScoredVideo => ({
  videoId,
  title,
  url: `https://youtube.com/watch?v=${videoId}`,
  thumbnailUrl: null,
  durationSeconds: 600,
  viewCount: 320_000,
  likeCount: 9_000,
  commentCount: 400,
  publishedAt: "2026-06-01T00:00:00.000Z",
  outlierScore: 3.2,
  velocity: 4_200,
  ageDays: 76,
});

const input = {
  channelTitle: "Marques Brownlee",
  outliers: [video("dQw4w9WgXcQ", "Why I switched back"), video("abc123XYZ_9", "The cheap one won")],
  webContext: [
    { title: "The reviewer backlash", url: "https://example.com/a", excerpt: "Readers argued..." },
  ],
};

describe("buildPrompt", () => {
  it("lists every outlier with its id, score and velocity", () => {
    const prompt = buildPrompt(input);

    expect(prompt).toContain("[dQw4w9WgXcQ]");
    expect(prompt).toContain("Why I switched back");
    expect(prompt).toContain("3.2x this channel's median");
  });

  it("tells the model to keep ids OUT of the prose", () => {
    // The bug this fixes: the prompt must show ids so they can be cited, and
    // the model then quotes them into the reasoning where a reader sees a
    // random string. `stripVideoIds` is the belt; this is the braces.
    const prompt = buildPrompt(input);

    expect(prompt).toMatch(/NEVER write a video id inside/i);
    expect(prompt).toMatch(/Refer to a video by its TITLE in prose/i);
  });

  it("asks for a beat sheet with hook, beats and close", () => {
    const prompt = buildPrompt(input);

    expect(prompt).toContain("HOOK");
    expect(prompt).toContain("CLOSE");
    expect(prompt).toMatch(/250-350 words/);
    // Structure to film from, not sentences to read aloud — that distinction is
    // the whole reason a beat sheet was chosen over a full script.
    expect(prompt).toMatch(/never as sentences to read aloud/i);
  });

  it("still demands the things that make an idea trustworthy", () => {
    const prompt = buildPrompt(input);

    expect(prompt).toMatch(/Be honest; a 40 is more useful than an inflated 90/);
    expect(prompt).toMatch(/is the specific take, not the topic/);
    expect(prompt).toMatch(/Do not propose a near-duplicate/);
  });

  it("says there is no web context rather than sending an empty heading", () => {
    const prompt = buildPrompt({ ...input, webContext: [] });
    expect(prompt).toContain("(none gathered");
  });

  it("names the script field in the example shape it asks for", () => {
    // If the example JSON and the zod schema disagree, every generation fails
    // validation — and the error names a field, not the mismatch.
    expect(buildPrompt(input)).toContain('"script"');
  });
});

describe("ideaSchema", () => {
  const valid = {
    title: "The cheap one actually won",
    angle: "Argue the budget pick beat the flagship, using their own numbers.",
    reasoning: "The budget review pulled 3.2x the channel median in 76 days.",
    script: "HOOK (0:00-0:15)\nOpen on the price tag.\n".padEnd(700, "x"),
    confidence: 62,
    evidenceVideoIds: ["dQw4w9WgXcQ"],
  };

  it("accepts a well-formed idea", () => {
    expect(ideaSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a script too short to film from", () => {
    // Under ~600 characters it is a rehash of `angle` and buys nothing.
    const short = { ...valid, script: "Do a video about the cheap one." };
    expect(ideaSchema.safeParse(short).success).toBe(false);
  });

  it("rejects a script long enough to be a word-for-word narration", () => {
    const long = { ...valid, script: "x".repeat(3_001) };
    expect(ideaSchema.safeParse(long).success).toBe(false);
  });

  it("rejects an idea citing no evidence at all", () => {
    expect(ideaSchema.safeParse({ ...valid, evidenceVideoIds: [] }).success).toBe(false);
  });

  it("caps a response at MAX_IDEAS", () => {
    const tooMany = { ideas: Array.from({ length: MAX_IDEAS + 1 }, () => valid) };
    expect(ideasResponseSchema.safeParse(tooMany).success).toBe(false);
  });
});
