import { describe, expect, it } from "vitest";
import {
  MIN_SAMPLE,
  OUTLIER_FLOOR,
  buildHookLibrary,
} from "@/lib/analytics/hooks";
import type { VideoRow } from "@/lib/supabase/types";

/**
 * The hook library mines title shapes from outlier videos.
 *
 * The failure this file exists to prevent is FALSE CONFIDENCE. Pick enough
 * regexes over enough titles and something always looks like a winner, and a
 * creator who rewrites their titles around one coincidence has been actively
 * misled by their own tool. So the tests below care less about "does it find
 * the pattern" than about "does it refuse to claim one that is not there".
 */

function video(over: Partial<VideoRow> = {}): VideoRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    channel_id: "00000000-0000-0000-0000-0000000000cc",
    video_id: "vid1",
    kind: "video",
    title: "A perfectly ordinary title",
    url: "https://youtube.com/watch?v=vid1",
    thumbnail_url: null,
    duration_seconds: 600,
    view_count: 10_000,
    like_count: 100,
    comment_count: 10,
    published_at: "2026-07-01T00:00:00.000Z",
    outlier_score: 2,
    velocity: 100,
    created_at: "2026-07-01T00:00:00.000Z",
    ...over,
  } as VideoRow;
}

/** n videos sharing a title shape, all comfortable outliers. */
function many(title: string, count: number, score = 2): VideoRow[] {
  return Array.from({ length: count }, (_, index) =>
    video({
      video_id: `vid${index}`,
      title: `${title} ${index}`,
      outlier_score: score,
    }),
  );
}

describe("what counts as material at all", () => {
  it("ignores videos that did not beat their own channel", () => {
    // A title that performed typically has nothing to teach. Including it
    // would dilute every average on the page.
    const library = buildHookLibrary(many("How to bake bread", 6, 1.0), 1);
    expect(library.titlesAnalysed).toBe(0);
    expect(library.hooks).toHaveLength(0);
  });

  it("ignores videos with no score at all", () => {
    const unscored = many("How to bake bread", 6).map((v) => ({
      ...v,
      outlier_score: null,
    }));
    expect(buildHookLibrary(unscored, 1).titlesAnalysed).toBe(0);
  });

  it("takes videos exactly on the floor", () => {
    const library = buildHookLibrary(
      many("How to bake bread", 5, OUTLIER_FLOOR),
      1,
    );
    expect(library.titlesAnalysed).toBe(5);
  });

  it("ignores a blank title rather than counting it as a shape", () => {
    const blanks = many("How to bake bread", 4).map((v) => ({ ...v, title: "   " }));
    expect(buildHookLibrary(blanks, 1).titlesAnalysed).toBe(0);
  });

  it("returns an empty library for no videos, without throwing", () => {
    const library = buildHookLibrary([], 0);
    expect(library.hooks).toHaveLength(0);
    expect(library.best).toBeNull();
    expect(library.titlesAnalysed).toBe(0);
    expect(library.projectsCovered).toBe(0);
  });
});

describe("refusing to claim a pattern that is not there", () => {
  it("flags a shape below the sample floor as unreliable", () => {
    const library = buildHookLibrary(many("How to bake bread", MIN_SAMPLE - 1), 1);
    const hook = library.hooks.find((h) => h.label === "How-to");
    expect(hook?.sampleSize).toBe(MIN_SAMPLE - 1);
    expect(hook?.isReliable).toBe(false);
  });

  it("marks a shape reliable exactly at the floor", () => {
    const library = buildHookLibrary(many("How to bake bread", MIN_SAMPLE), 1);
    expect(library.hooks.find((h) => h.label === "How-to")?.isReliable).toBe(true);
  });

  it("NEVER names a best hook drawn only from unreliable samples", () => {
    // Three titles is a coincidence. Reporting it as the strongest hook would
    // be the tool inventing advice.
    const library = buildHookLibrary(many("How to bake bread", 3, 9), 1);
    expect(library.hooks).toHaveLength(1);
    expect(library.best).toBeNull();
  });

  it("picks the best from reliable hooks only, even when a small one scores higher", () => {
    const library = buildHookLibrary(
      [
        ...many("How to bake bread", 8, 2), // reliable, modest
        ...many("Why nobody talks about this", 2, 50), // tiny, spectacular
      ],
      1,
    );
    expect(library.best?.label).toBe("How-to");
  });
});

describe("evidence is attached to every claim", () => {
  it("gives every rendered hook real examples", () => {
    const library = buildHookLibrary(many("How to bake bread", 6), 1);
    for (const hook of library.hooks) {
      expect(hook.examples.length).toBeGreaterThan(0);
      for (const example of hook.examples) {
        expect(example.title).not.toBe("");
        expect(example.url).toContain("http");
      }
    }
  });

  it("shows the strongest examples, not merely the first three", () => {
    const library = buildHookLibrary(
      [
        ...many("How to bake bread", 4, 1.5),
        video({ video_id: "star", title: "How to win outright", outlier_score: 12 }),
      ],
      1,
    );
    const hook = library.hooks.find((h) => h.label === "How-to");
    expect(hook?.examples[0]?.title).toBe("How to win outright");
  });

  it("caps examples at three so the page stays readable", () => {
    const library = buildHookLibrary(many("How to bake bread", 20), 1);
    expect(library.hooks[0]?.examples.length).toBeLessThanOrEqual(3);
  });
});

describe("shape detection", () => {
  it("recognises the shapes it advertises", () => {
    const cases: [string, string][] = [
      ["How to bake sourdough", "How-to"],
      ["7 ways to fix your audio", "Numbered list"],
      ["Is this camera worth it?", "Question"],
      ["Never do this on camera", "Negative or warning"],
      ["The best lens for beginners", "Superlative"],
      ["Canon vs Sony", "Versus or comparison"],
    ];

    for (const [title, expected] of cases) {
      const library = buildHookLibrary(many(title, MIN_SAMPLE), 1);
      expect(library.hooks.map((h) => h.label)).toContain(expected);
    }
  });

  it("finds a question even when the title continues past the mark", () => {
    // Real titles append a series tag after the question — "Is this worth it?
    // | Ep 4". An endsWith test drops every one of them, which is a whole
    // bucket lost to punctuation.
    const library = buildHookLibrary(
      many("Is this camera worth it? | Ep", MIN_SAMPLE),
      1,
    );
    expect(library.hooks.map((h) => h.label)).toContain("Question");
  });

  it("matches both kinds of apostrophe in a contraction", () => {
    // Titles arrive with the typographic apostrophe as often as the ASCII one.
    // Matching only one silently halves this bucket.
    const ascii = buildHookLibrary(many("Don't buy this camera", MIN_SAMPLE), 1);
    const smart = buildHookLibrary(many("Don’t buy this camera", MIN_SAMPLE), 1);
    expect(ascii.hooks[0]?.label).toBe("Negative or warning");
    expect(smart.hooks[0]?.label).toBe("Negative or warning");
  });

  it("puts a title in exactly one bucket, the most specific one", () => {
    // "How I made $5,000" is a how-to, not merely a title containing a number.
    // Double-counting would inflate every sample size on the page.
    const library = buildHookLibrary(many("How I made $5,000 in 30 days", 6), 1);
    const total = library.hooks.reduce((sum, hook) => sum + hook.sampleSize, 0);
    expect(total).toBe(6);
    expect(library.hooks[0]?.label).toBe("How-to");
  });

  it("silently skips a title matching no known shape", () => {
    const library = buildHookLibrary(many("Sourdough", 6), 1);
    expect(library.titlesAnalysed).toBe(6);
    expect(library.hooks).toHaveLength(0);
  });
});

describe("the cross-project claim", () => {
  it("reports the project count it was given, never guesses one", () => {
    // The page says "across N projects". That number has to be the real one:
    // a video row carries a channel id, not a project id, so it is passed in.
    const library = buildHookLibrary(many("How to bake bread", 5), 4);
    expect(library.projectsCovered).toBe(4);
  });
});
