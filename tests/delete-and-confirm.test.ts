import { describe, expect, it } from "vitest";
import { atHandle, spokenTargetLabel } from "@/lib/platform/display";
import { projectAfterDelete } from "@/lib/projects/after-delete";
import { ideaDeleteDetail } from "@/lib/ideas/delete-copy";
import { scrollTargetY } from "@/components/landing/scroll-target";

describe("atHandle", () => {
  it("adds one @ to a bare handle", () => {
    expect(atHandle("nasa")).toBe("@nasa");
  });

  it("never doubles an existing @", () => {
    expect(atHandle("@mkbhd")).toBe("@mkbhd");
  });

  it("leaves a YouTube channel id alone", () => {
    expect(atHandle("UCBJycsmduvYEL83R_U4JriQ")).toBe("UCBJycsmduvYEL83R_U4JriQ");
  });

  it("leaves a URL alone", () => {
    expect(atHandle("https://www.youtube.com/channel/abc")).toBe(
      "https://www.youtube.com/channel/abc",
    );
  });

  it("trims whitespace", () => {
    expect(atHandle("  nasa ")).toBe("@nasa");
  });
});

describe("spokenTargetLabel", () => {
  it("names the handle a pasted YouTube URL resolves to", () => {
    expect(spokenTargetLabel("https://www.youtube.com/@mkbhd", "youtube")).toBe("@mkbhd");
  });

  it("names the handle an Instagram URL resolves to", () => {
    expect(spokenTargetLabel("https://www.instagram.com/nasa/", "instagram")).toMatch(
      /^@nasa$/i,
    );
  });

  it("prefixes a bare spoken handle", () => {
    expect(spokenTargetLabel("mkbhd", "youtube")).toMatch(/^@mkbhd$/i);
  });

  it("falls back to what was heard when the parser refuses it", () => {
    expect(spokenTargetLabel("not a channel at all", "youtube")).toBe(
      "not a channel at all",
    );
  });
});

describe("projectAfterDelete", () => {
  it("keeps the cookie when another project was deleted", () => {
    expect(
      projectAfterDelete({ deletedId: "b", currentId: "a", remaining: ["a", "c"] }),
    ).toEqual({ keep: true });
  });

  it("keeps the cookie when there was none", () => {
    expect(
      projectAfterDelete({ deletedId: "b", currentId: null, remaining: ["a"] }),
    ).toEqual({ keep: true });
  });

  it("moves to the newest remaining project when the current one goes", () => {
    expect(
      projectAfterDelete({ deletedId: "a", currentId: "a", remaining: ["c", "b"] }),
    ).toEqual({ keep: false, next: "c" });
  });

  it("clears the cookie when the last project goes", () => {
    expect(
      projectAfterDelete({ deletedId: "a", currentId: "a", remaining: [] }),
    ).toEqual({ keep: false, next: null });
  });

  it("never picks the deleted id even if a stale list still holds it", () => {
    expect(
      projectAfterDelete({ deletedId: "a", currentId: "a", remaining: ["a", "b"] }),
    ).toEqual({ keep: false, next: "b" });
  });
});

describe("ideaDeleteDetail", () => {
  it("only mentions the run when nothing is scheduled", () => {
    expect(ideaDeleteDetail(0)).toBe("The run that made it stays used.");
  });

  it("names a single slot", () => {
    expect(ideaDeleteDetail(1)).toMatch(/on your calendar once, and that slot goes too/);
  });

  it("counts several slots", () => {
    expect(ideaDeleteDetail(3)).toMatch(/on your calendar 3 times, and those slots go too/);
  });
});

describe("scrollTargetY", () => {
  const base = { scrollY: 0, viewport: 800, maxScroll: 4000 };

  it("centres a short element", () => {
    expect(
      scrollTargetY({ ...base, rectTop: 1000, rectHeight: 400, block: "center", marginTop: 96 }),
    ).toBe(800);
  });

  it("keeps a tall element's top clear of the nav instead of centring it", () => {
    expect(
      scrollTargetY({ ...base, rectTop: 1000, rectHeight: 900, block: "center", marginTop: 96 }),
    ).toBe(904);
  });

  it("aligns to the top minus scroll-margin for start", () => {
    expect(scrollTargetY({ ...base, rectTop: 500, rectHeight: 100, marginTop: 96 })).toBe(404);
  });

  it("accounts for the current scroll position", () => {
    expect(scrollTargetY({ ...base, scrollY: 300, rectTop: 200, rectHeight: 100 })).toBe(500);
  });

  it("clamps to the page", () => {
    expect(scrollTargetY({ ...base, rectTop: 50, rectHeight: 10, block: "center" })).toBe(0);
    expect(scrollTargetY({ ...base, rectTop: 9000, rectHeight: 10 })).toBe(4000);
  });
});
