import { describe, expect, it } from "vitest";
import { stripVideoIds } from "@/lib/ideas/clean";

const KNOWN = ["dQw4w9WgXcQ", "a1b2-c3d_45"];

describe("stripVideoIds", () => {
  it("removes a bracketed id the model quoted into prose", () => {
    // This is the actual reported bug: a random-looking code mid-sentence.
    const text = "The breakout [dQw4w9WgXcQ] pulled 3.2x the channel median.";
    expect(stripVideoIds(text, KNOWN)).toBe(
      "The breakout pulled 3.2x the channel median.",
    );
  });

  it("removes it parenthesised or bare too", () => {
    expect(stripVideoIds("Seen in (dQw4w9WgXcQ) already.", KNOWN)).toBe(
      "Seen in already.",
    );
    expect(stripVideoIds("Compare dQw4w9WgXcQ with the rest.", KNOWN)).toBe(
      "Compare with the rest.",
    );
  });

  it("handles ids containing - and _, which are not word boundaries", () => {
    // `\b` lands in the MIDDLE of an id like a1b2-c3d_45, so the naive regex
    // leaves half of it on the page.
    expect(stripVideoIds("As a1b2-c3d_45 showed, retention held.", KNOWN)).toBe(
      "As showed, retention held.",
    );
  });

  it("removes a bracketed id we never sent", () => {
    // The model invents plausible ids. Those are dropped from the citations
    // already; this stops one appearing in the prose instead.
    expect(stripVideoIds("Look at [zzzzZZZZ999] here.", KNOWN)).toBe(
      "Look at here.",
    );
  });

  it("leaves a real bracketed aside alone", () => {
    const text = "The follow-up [which flopped] is the counter-example.";
    expect(stripVideoIds(text, KNOWN)).toBe(text);
  });

  it("does not eat text that merely contains an id as a substring", () => {
    const text = "xxdQw4w9WgXcQxx is not the id.";
    expect(stripVideoIds(text, KNOWN)).toBe(text);
  });

  it("tidies the spacing and punctuation the removal leaves behind", () => {
    expect(stripVideoIds("Because [dQw4w9WgXcQ] , it worked.", KNOWN)).toBe(
      "Because, it worked.",
    );
  });

  it("preserves the line breaks a beat sheet is made of", () => {
    const script = "HOOK (0:00-0:15)\nOpen cold.\n\nBEAT 1 [dQw4w9WgXcQ]\nThen turn.";
    expect(stripVideoIds(script, KNOWN)).toBe(
      "HOOK (0:00-0:15)\nOpen cold.\n\nBEAT 1\nThen turn.",
    );
  });
});
