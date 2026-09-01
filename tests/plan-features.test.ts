import { describe, expect, it } from "vitest";
import { PLANS, PAID_PLAN_KEYS, type PlanKey } from "@/lib/billing/plans";
import {
  canCreateProject,
  canUseContentCalendar,
  canUseHookLibrary,
  canUseInstagram,
  canUseTranscripts,
  canUseVoice,
} from "@/lib/billing/quota";
import { buildPrompt, MAX_TITLE_VARIANTS, MAX_THUMBNAIL_CONCEPTS } from "@/lib/ideas/prompt";
import type { ScoredVideo } from "@/lib/ideas/score";

/**
 * The pricing page makes a promise per tier. This file is the contract.
 *
 * Every feature the landing page lists next to a plan has to be true of that
 * plan and false of the ones below it. A gate that quietly stops matching its
 * own pricing table is either a customer paying for something they cannot use
 * or a feature being given away — neither shows up in a typecheck, and neither
 * gets reported, because one is embarrassing and the other is free.
 */

const ALL: PlanKey[] = ["free", "creator", "studio", "agency"];

function video(over: Partial<ScoredVideo> = {}): ScoredVideo {
  return {
    videoId: "vid1",
    title: "A video that beat its channel",
    url: "https://youtube.com/watch?v=vid1",
    viewCount: 120_000,
    likeCount: null,
    commentCount: null,
    publishedAt: "2026-07-01T00:00:00.000Z",
    kind: "video",
    outlierScore: 3.2,
    velocity: 2400,
    ageDays: 50,
    ...over,
  } as ScoredVideo;
}

describe("what each tier may actually do", () => {
  it("matches the pricing page on Instagram", () => {
    // Listed as included on Studio and Max only.
    expect(canUseInstagram("free")).toBe(false);
    expect(canUseInstagram("creator")).toBe(false);
    expect(canUseInstagram("studio")).toBe(true);
    expect(canUseInstagram("agency")).toBe(true);
  });

  it("matches the pricing page on transcripts", () => {
    // Listed on all three paid tiers, and shown as missing on Scout.
    expect(canUseTranscripts("free")).toBe(false);
    for (const key of PAID_PLAN_KEYS) {
      expect(canUseTranscripts(key)).toBe(true);
    }
  });

  it("matches the pricing page on voice input", () => {
    // Whisper costs per press, so it is a paid feature — and Scout's card
    // lists it under what it does NOT get.
    expect(canUseVoice("free")).toBe(false);
    for (const key of PAID_PLAN_KEYS) {
      expect(canUseVoice(key)).toBe(true);
    }
  });

  it("matches the pricing page on the model tier", () => {
    // "Fast model, built for volume" vs "Advanced reasoning model".
    expect(PLANS.free.model).toBe("mini");
    expect(PLANS.creator.model).toBe("mini");
    expect(PLANS.studio.model).toBe("premium");
    expect(PLANS.agency.model).toBe("premium");
  });

  it("matches the pricing page on title variants and thumbnails", () => {
    // Both listed from Creator upward, absent on Scout.
    expect(PLANS.free.features.titleVariants).toBe(false);
    expect(PLANS.free.features.thumbnailConcepts).toBe(false);
    for (const key of PAID_PLAN_KEYS) {
      expect(PLANS[key].features.titleVariants).toBe(true);
      expect(PLANS[key].features.thumbnailConcepts).toBe(true);
    }
  });

  it("matches the pricing page on the cost breakdown", () => {
    // Listed on Studio and Max.
    expect(PLANS.creator.features.costBreakdown).toBe(false);
    expect(PLANS.studio.features.costBreakdown).toBe(true);
    expect(PLANS.agency.features.costBreakdown).toBe(true);
  });

  it("matches the pricing page on the Max-only extras", () => {
    // Audit trail, hook library and priority support are Max alone.
    for (const key of ["free", "creator", "studio"] as const) {
      expect(PLANS[key].features.auditTrail).toBe(false);
      expect(PLANS[key].features.prioritySupport).toBe(false);
      expect(PLANS[key].features.hookLibrary).toBe(false);
    }
    expect(PLANS.agency.features.auditTrail).toBe(true);
    expect(PLANS.agency.features.prioritySupport).toBe(true);
    expect(PLANS.agency.features.hookLibrary).toBe(true);
  });

  it("matches the pricing page on the content calendar", () => {
    // Studio and up. Deliberately NOT Max-only: scheduling is a working
    // creator's need, and hoarding it would hollow out the tier the pricing
    // page honestly recommends to most people.
    expect(canUseContentCalendar("free")).toBe(false);
    expect(canUseContentCalendar("creator")).toBe(false);
    expect(canUseContentCalendar("studio")).toBe(true);
    expect(canUseContentCalendar("agency")).toBe(true);
  });

  it("keeps the hook library to Max at the gate, not just in the table", () => {
    expect(canUseHookLibrary("free")).toBe(false);
    expect(canUseHookLibrary("creator")).toBe(false);
    expect(canUseHookLibrary("studio")).toBe(false);
    expect(canUseHookLibrary("agency")).toBe(true);
  });

  it("no longer advertises team seats anywhere", () => {
    // Max is a solo power tier. `seats` was removed from the type rather than
    // left as dead config, so this asserts on the shape the UI actually reads.
    for (const key of ALL) {
      expect("seats" in PLANS[key].features).toBe(false);
    }
  });
});

describe("the project limit", () => {
  it("gives Scout one workspace, and stops at one", () => {
    expect(canCreateProject("free", 0)).toBe(true);
    expect(canCreateProject("free", 1)).toBe(false);
  });

  it("gives Creator three, and stops at three", () => {
    expect(canCreateProject("creator", 2)).toBe(true);
    expect(canCreateProject("creator", 3)).toBe(false);
  });

  it("never stops Studio or Max, which are sold as unlimited", () => {
    for (const key of ["studio", "agency"] as const) {
      expect(PLANS[key].features.maxProjects).toBeNull();
      expect(canCreateProject(key, 500)).toBe(true);
    }
  });
});

describe("a feature is never granted downward by accident", () => {
  it("never gives a lower tier something a higher one lacks", () => {
    // The ladder must be monotonic on every boolean. A feature that switches
    // OFF as you pay more is a bug nobody would think to look for.
    const flags = [
      "instagram",
      "voiceInput",
      "titleVariants",
      "thumbnailConcepts",
      "transcripts",
      "costBreakdown",
      "auditTrail",
      "prioritySupport",
    ] as const;

    for (const flag of flags) {
      for (let i = 1; i < ALL.length; i++) {
        const lower = PLANS[ALL[i - 1]].features[flag];
        const higher = PLANS[ALL[i]].features[flag];
        // Once on, it stays on.
        if (lower) expect(higher).toBe(true);
      }
    }
  });
});

describe("the prompt asks for exactly what the plan includes", () => {
  const base = {
    channelTitle: "Test Channel",
    outliers: [video()],
    webContext: [],
  };

  it("asks a free-tier run for neither extra", () => {
    // Not just unused — NOT ASKED FOR. Generating extras for a tier that does
    // not include them spends output tokens on every idea and throws the
    // result away.
    const prompt = buildPrompt({ ...base, extras: undefined });

    expect(prompt).not.toContain("titleVariants");
    expect(prompt).not.toContain("thumbnailConcepts");
  });

  it("asks a Creator run for both", () => {
    const prompt = buildPrompt({
      ...base,
      extras: { titleVariants: true, thumbnailConcepts: true },
    });

    expect(prompt).toContain("titleVariants");
    expect(prompt).toContain("thumbnailConcepts");
    expect(prompt).toContain(String(MAX_TITLE_VARIANTS));
    expect(prompt).toContain(String(MAX_THUMBNAIL_CONCEPTS));
  });

  it("asks for one without the other, when only one is included", () => {
    const titlesOnly = buildPrompt({ ...base, extras: { titleVariants: true } });
    expect(titlesOnly).toContain("titleVariants");
    expect(titlesOnly).not.toContain("thumbnailConcepts");
  });

  it("keeps the required shape line intact whatever the extras", () => {
    // The response shape is what the zod schema validates against. If the two
    // drift, every generation fails validation and the job refunds itself.
    for (const extras of [
      undefined,
      { titleVariants: true },
      { thumbnailConcepts: true },
      { titleVariants: true, thumbnailConcepts: true },
    ]) {
      const prompt = buildPrompt({ ...base, extras });
      expect(prompt).toContain('"evidenceVideoIds"');
      expect(prompt).toContain('"script"');
    }
  });
});
