import { describe, expect, it } from "vitest";
import {
  InvalidChannelInputError,
  parseChannelInput,
} from "@/lib/youtube/channel-url";

describe("parseChannelInput", () => {
  it("accepts a bare handle with and without the @", () => {
    expect(parseChannelInput("@mkbhd")).toEqual({
      handle: "@mkbhd",
      channelUrl: "https://www.youtube.com/@mkbhd",
    });
    expect(parseChannelInput("mkbhd").handle).toBe("@mkbhd");
  });

  it("accepts full URLs, with or without protocol and trailing path", () => {
    for (const input of [
      "https://www.youtube.com/@mkbhd",
      "https://youtube.com/@mkbhd/videos",
      "youtube.com/@mkbhd",
      "  https://www.youtube.com/@mkbhd?si=abc  ",
    ]) {
      expect(parseChannelInput(input).handle).toBe("@mkbhd");
    }
  });

  it("accepts a channel id, bare or in a URL", () => {
    const id = "UCBJycsmduvYEL83R_U4JriQ";
    expect(parseChannelInput(id).channelUrl).toBe(`https://www.youtube.com/channel/${id}`);
    expect(parseChannelInput(`https://www.youtube.com/channel/${id}`).handle).toBe(id);
  });

  it("accepts the legacy /c/ and /user/ forms", () => {
    expect(parseChannelInput("https://www.youtube.com/c/mkbhd").handle).toBe("@mkbhd");
    expect(parseChannelInput("https://www.youtube.com/user/marquesbrownlee").handle).toBe(
      "@marquesbrownlee",
    );
  });

  it("rejects empty input, non-YouTube hosts and unusable URLs", () => {
    for (const input of ["", "   ", "https://vimeo.com/@mkbhd", "https://youtube.com/watch"]) {
      expect(() => parseChannelInput(input)).toThrow(InvalidChannelInputError);
    }
  });

  it("gives an error message a human can act on", () => {
    expect(() => parseChannelInput("nope!!")).toThrow(/Try a handle like @mkbhd/);
  });
});
