import { describe, expect, it } from "vitest";
import { PLANS, PLAN_LIST, type PlanKey } from "@/lib/billing/plans";
import {
  canUseContentCalendar,
  canUseHookLibrary,
  canUseInstagram,
  canUseTranscripts,
  canUseVoice,
} from "@/lib/billing/quota";

/**
 * THE LADDER, checked as a whole rather than one feature at a time.
 *
 * The per-feature tests in plan-features.test.ts assert what each gate does.
 * This file asserts the shape of the ladder ITSELF: that it never goes
 * backwards, that the names and prices stay in order, and that no tier
 * accidentally gains or loses something in a way nobody would notice.
 *
 * That distinction matters because the failure mode here is silent. Nothing
 * about "Studio has a feature Max does not" throws, typechecks red, or gets
 * reported — a customer paying the most simply has less, and finds out on
 * their own.
 */

const LADDER: PlanKey[] = ["free", "creator", "studio", "agency"];

/** Every boolean capability, by the gate a route would actually call. */
const GATES = {
  instagram: canUseInstagram,
  voice: canUseVoice,
  transcripts: canUseTranscripts,
  contentCalendar: canUseContentCalendar,
  hookLibrary: canUseHookLibrary,
} as const;

describe("the ladder never goes backwards", () => {
  for (const [name, gate] of Object.entries(GATES)) {
    it(`never takes ${name} away from a higher tier`, () => {
      // Once a tier has a capability, every tier above it must too.
      let seen = false;
      for (const key of LADDER) {
        const has = gate(key);
        if (seen) {
          expect(has, `${key} lost ${name}`).toBe(true);
        }
        if (has) seen = true;
      }
    });
  }

  it("never lowers the run allowance as the price rises", () => {
    for (let index = 1; index < LADDER.length; index += 1) {
      const lower = PLANS[LADDER[index - 1]];
      const higher = PLANS[LADDER[index]];
      expect(higher.runs).toBeGreaterThan(lower.runs);
      expect(higher.priceUsd).toBeGreaterThan(lower.priceUsd);
    }
  });

  it("never lowers the daily cap or the depth per run", () => {
    for (let index = 1; index < LADDER.length; index += 1) {
      const lower = PLANS[LADDER[index - 1]];
      const higher = PLANS[LADDER[index]];
      expect(higher.dailyCap).toBeGreaterThanOrEqual(lower.dailyCap);
      expect(higher.videosPerRun).toBeGreaterThanOrEqual(lower.videosPerRun);
    }
  });

  it("keeps the daily cap below runs/3, so a month cannot be drained in days", () => {
    // The spend guard from AGENTS.md. A cap at or above runs/3 turns it into a
    // burst limit and reopens the surprise-bill hole.
    for (const key of LADDER) {
      const plan = PLANS[key];
      expect(plan.dailyCap * 3, `${key} can be drained too fast`).toBeLessThan(
        plan.runs * 3,
      );
      expect(plan.dailyCap).toBeLessThan(plan.runs);
    }
  });
});

describe("the tier names", () => {
  it("reads Scout, Creator, Studio, Max", () => {
    expect(PLAN_LIST.map((plan) => plan.name)).toEqual([
      "Scout",
      "Creator",
      "Studio",
      "Max",
    ]);
  });

  it("no longer says Agency anywhere a customer can see", () => {
    // The internal key stays `agency` — renaming it would orphan live Razorpay
    // subscriptions — but nothing rendered may say it.
    for (const plan of PLAN_LIST) {
      expect(plan.name).not.toMatch(/agency/i);
      expect(plan.tagline).not.toMatch(/agency/i);
    }
  });

  it("keeps the internal key stable, because live subscriptions store it", () => {
    expect(PLANS.agency.key).toBe("agency");
  });

  it("never implies a team on what is a solo tier", () => {
    for (const plan of PLAN_LIST) {
      expect(plan.tagline).not.toMatch(/\b(team|seat|seats|colleague)\b/i);
    }
  });
});

describe("what Max is actually worth", () => {
  it("gives Max something Studio does not, beyond raw volume", () => {
    // With seats gone, Max needs a real capability or it is only a bigger
    // number wearing a higher price.
    const studioOnly = Object.entries(GATES).filter(
      ([, gate]) => gate("studio") && !gate("agency"),
    );
    expect(studioOnly).toHaveLength(0);

    const maxOnly = Object.entries(GATES).filter(
      ([, gate]) => gate("agency") && !gate("studio"),
    );
    expect(maxOnly.length).toBeGreaterThan(0);
  });

  it("keeps the content calendar at Studio, so the recommended tier stays whole", () => {
    expect(canUseContentCalendar("studio")).toBe(true);
  });

  it("has no `seats` field left on any tier", () => {
    for (const plan of PLAN_LIST) {
      expect("seats" in plan.features).toBe(false);
    }
  });
});

describe("Scout is a real free tier, not a demo", () => {
  it("gets runs that actually refill", () => {
    expect(PLANS.free.runs).toBeGreaterThan(0);
    expect(PLANS.free.recurring).toBe(true);
  });

  it("pays for nothing that costs per press", () => {
    expect(canUseVoice("free")).toBe(false);
    expect(canUseInstagram("free")).toBe(false);
    expect(canUseTranscripts("free")).toBe(false);
  });
});
