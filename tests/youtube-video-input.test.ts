import { describe, expect, it } from "vitest";
import { parseYoutubeVideoInput } from "@/lib/schemas/transcript";

/**
 * What a customer pastes into "Extract transcript". Every accepted input
 * starts a PAID Apify run, so anything that is not a YouTube video must be
 * refused here, for free (found 2026-10-04: example.com/foo was accepted).
 */
describe("parseYoutubeVideoInput", () => {
  const ID = "dQw4w9WgXcQ";

  it.each([
    [`https://www.youtube.com/watch?v=${ID}`],
    [`youtube.com/watch?v=${ID}`],
    [`www.youtube.com/watch?v=${ID}&t=42s`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`https://youtu.be/${ID}`],
    [`youtu.be/${ID}?si=abc`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`https://www.youtube.com/live/${ID}`],
    [`https://www.youtube.com/embed/${ID}`],
    [`https://music.youtube.com/watch?v=${ID}`],
  ])("accepts %s", (input) => {
    expect(parseYoutubeVideoInput(input)).toEqual({
      videoId: ID,
      url: `https://www.youtube.com/watch?v=${ID}`,
    });
  });

  it.each([
    ["https://example.com/foo"],
    ["https://example.com/watch?v=dQw4w9WgXcQ"],
    ["https://www.youtube.com/@veritasium"],
    ["https://www.youtube.com/watch?v=short"],
    ["https://www.youtube.com/"],
    ["not a url"],
    [""],
  ])("refuses %s", (input) => {
    expect(parseYoutubeVideoInput(input)).toBeNull();
  });
});
