import { describe, expect, it } from "vitest";
import { nextStep, type ProjectState } from "@/lib/projects/next-step";

const base: ProjectState = {
  channels: 0,
  items: 0,
  ideas: 0,
  savedIdeas: 0,
  jobRunning: false,
  lastJobFailed: false,
  scrapesLeft: 10,
};

const step = (over: Partial<ProjectState> = {}) => nextStep({ ...base, ...over });

describe("nextStep", () => {
  it("starts by asking for a competitor", () => {
    expect(step().title).toMatch(/add your first competitor/i);
    expect(step().href).toBe("/competitors");
  });

  it("asks for ideas once evidence exists", () => {
    expect(step({ channels: 1, items: 40 }).title).toMatch(/turn the evidence into ideas/i);
    expect(step({ channels: 1, items: 40 }).href).toBe("/idea-lab");
  });

  it("asks for a shortlist once ideas exist", () => {
    const result = step({ channels: 1, items: 40, ideas: 8 });
    expect(result.title).toMatch(/shortlist/i);
    expect(result.body).toContain("8 ideas");
  });

  it("says the project is in good shape when nothing is outstanding", () => {
    const result = step({ channels: 2, items: 90, ideas: 8, savedIdeas: 3 });
    expect(result.done).toBe(true);
    // A hub that always demands something is a hub nobody believes.
    expect(result.title).toMatch(/good shape/i);
  });

  it("says work is running above everything else", () => {
    // Advice you cannot act on is noise while a scrape is mid-flight.
    const result = step({ channels: 1, items: 40, jobRunning: true });
    expect(result.title).toMatch(/work is running/i);
  });

  it("surfaces a failure ahead of any suggestion", () => {
    // Acting on the old advice would just hit the same wall.
    const result = step({ channels: 1, items: 40, lastJobFailed: true });
    expect(result.title).toMatch(/last run failed/i);
    expect(result.body).toMatch(/nothing was charged/i);
  });

  it("a running job outranks a past failure", () => {
    const result = step({ jobRunning: true, lastJobFailed: true });
    expect(result.title).toMatch(/work is running/i);
  });

  it("sends someone out of scrapes to billing, not to a refusal", () => {
    // 402 means buy something. Pointing an empty account at the scrape form
    // just walks them into an error.
    expect(step({ scrapesLeft: 0 }).href).toBe("/billing");
    expect(step({ channels: 1, items: 40, scrapesLeft: 0 }).href).toBe("/billing");
  });

  it("does not nag about scrapes when the work left needs none", () => {
    // Shortlisting is free, so being out of scrapes is irrelevant here.
    const result = step({ channels: 1, items: 40, ideas: 5, scrapesLeft: 0 });
    expect(result.title).toMatch(/shortlist/i);
  });

  it("points at the competitors when channels exist but nothing was collected", () => {
    const result = step({ channels: 2, items: 0 });
    expect(result.title).toMatch(/nothing collected/i);
  });

  it("always offers something to press, except never a dead end", () => {
    const states: Partial<ProjectState>[] = [
      {},
      { channels: 1 },
      { channels: 1, items: 40 },
      { channels: 1, items: 40, ideas: 8 },
      { channels: 1, items: 40, ideas: 8, savedIdeas: 2 },
      { jobRunning: true },
      { lastJobFailed: true },
      { scrapesLeft: 0 },
    ];

    for (const state of states) {
      const result = step(state);
      expect(result.href).not.toBeNull();
      expect(result.cta).not.toBeNull();
      expect(result.title.length).toBeGreaterThan(0);
    }
  });
});
