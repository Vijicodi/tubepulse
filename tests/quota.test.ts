import { describe, expect, it } from "vitest";
import { PLANS } from "@/lib/billing/plans";
import {
  BILLABLE_JOB_KINDS,
  computeQuota,
  periodEndFor,
  periodStartFor,
  videosPerRunFor,
  canUseInstagram,
  nextTierUp,
} from "@/lib/billing/quota";
import type { JobKind } from "@/lib/supabase/types";

const START = new Date("2026-01-01T00:00:00.000Z");

function quota(over: Partial<Parameters<typeof computeQuota>[0]> = {}) {
  return computeQuota({
    planKey: "studio" as const,
    scrapesThisPeriod: 0,
    scrapesToday: 0,
    refills: 0,
    periodStart: START,
    resetsAt: null,
    ...over,
  });
}

describe("plan allowance", () => {
  it("gives a paid tier its full monthly allowance when nothing is used", () => {
    const q = quota();
    expect(q.allowance).toBe(PLANS.studio.runs);
    expect(q.remaining).toBe(PLANS.studio.runs);
    expect(q.canScrape).toBe(true);
  });

  it("gives Scout the smaller one-time allowance", () => {
    const q = quota({ planKey: "free" });
    expect(q.allowance).toBe(PLANS.free.runs);
    expect(q.dailyCap).toBe(PLANS.free.dailyCap);
  });

  it("refuses once the allowance and refills are both gone", () => {
    const q = quota({ scrapesThisPeriod: PLANS.studio.runs });
    expect(q.remaining).toBe(0);
    expect(q.canScrape).toBe(false);
    // Refill packs are retired, so the way out is the next tier up.
    expect(q.reason).toContain(PLANS.agency.name);
  });

  it("never lets allowanceUsed exceed the allowance", () => {
    // Refill scrapes still create job rows, so the raw count runs past 20.
    const q = quota({ scrapesThisPeriod: PLANS.studio.runs + 5, refills: 3 });
    expect(q.allowanceUsed).toBe(PLANS.studio.runs);
    expect(q.allowanceLeft).toBe(0);
    expect(q.remaining).toBe(3);
    expect(q.canScrape).toBe(true);
  });

  it("spends the allowance before refills", () => {
    const q = quota({ scrapesThisPeriod: 1, refills: 5 });
    expect(q.allowanceLeft).toBe(PLANS.studio.runs - 1);
    expect(q.remaining).toBe(PLANS.studio.runs - 1 + 5);
  });
});

describe("daily cap", () => {
  it("blocks at the cap even with allowance left", () => {
    const q = quota({ scrapesToday: PLANS.studio.dailyCap });
    expect(q.canScrape).toBe(false);
    expect(q.reason).toMatch(/tomorrow/i);
  });

  it("prefers the out-of-scrapes message over the daily one", () => {
    // Being told to come back tomorrow is useless when tomorrow brings nothing.
    const q = quota({
      scrapesThisPeriod: PLANS.studio.runs,
      scrapesToday: PLANS.studio.dailyCap,
    });
    expect(q.reason).toContain(PLANS.agency.name);
  });

  it("keeps the cap below a third of the monthly allowance", () => {
    // AGENTS.md: a cap at or above scrapes/3 turns the month into a burst.
    expect(PLANS.studio.dailyCap).toBeLessThan(PLANS.studio.runs / 3);
  });
});

describe("period anchoring", () => {
  it("anchors to the subscription's day of the month, not the 1st", () => {
    const sub = new Date("2026-01-28T10:00:00.000Z");
    const start = periodStartFor(new Date("2026-02-03T00:00:00.000Z"), sub);
    expect(start.toISOString()).toBe("2026-01-28T00:00:00.000Z");
  });

  it("uses last month's anniversary before this month's arrives", () => {
    const sub = new Date("2026-01-20T00:00:00.000Z");
    const start = periodStartFor(new Date("2026-03-05T00:00:00.000Z"), sub);
    expect(start.toISOString()).toBe("2026-02-20T00:00:00.000Z");
  });

  it("clamps a 31st anchor into a short month", () => {
    const sub = new Date("2026-01-31T00:00:00.000Z");
    const start = periodStartFor(new Date("2026-02-28T12:00:00.000Z"), sub);
    expect(start.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("anchors the free tier to the calendar month, since it now resets", () => {
    // Scout's grant used to be one-time-ever, which is why this once asserted
    // epoch zero. It is three a MONTH now, so it needs a real period.
    const start = periodStartFor(new Date("2030-06-14T00:00:00.000Z"), null);
    expect(start.toISOString()).toBe("2030-06-01T00:00:00.000Z");
  });

  it("resets one month after the period started", () => {
    const end = periodEndFor(new Date("2026-01-28T00:00:00.000Z"), 28);
    expect(end.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });
});

describe("what Pro actually buys", () => {
  it("reads more videos per scrape on Pro", () => {
    expect(videosPerRunFor("studio")).toBe(PLANS.studio.videosPerRun);
    expect(videosPerRunFor("free")).toBe(PLANS.free.videosPerRun);
    expect(videosPerRunFor("studio")).toBeGreaterThan(videosPerRunFor("free"));
  });
});

describe("what spends the allowance", () => {
  it("counts idea generation as well as scraping", () => {
    // Chosen deliberately: an idea generation is an OpenAI call plus Firecrawl,
    // so it costs real money every press. Left out of this list it would be
    // free and unbounded — and the failure is silent, because nothing
    // complains when a user is undercharged.
    expect(BILLABLE_JOB_KINDS).toContain("channel_scrape");
    expect(BILLABLE_JOB_KINDS).toContain("idea_generation");
    expect(BILLABLE_JOB_KINDS).toContain("transcript");
  });

  it("names every job kind there is, so a new one cannot default to free", () => {
    // If a job kind is added and is genuinely NOT billable, this test is the
    // place to say so explicitly rather than letting silence decide.
    const allKinds: JobKind[] = ["channel_scrape", "idea_generation", "transcript"];
    expect([...BILLABLE_JOB_KINDS].sort()).toEqual([...allKinds].sort());
  });
});

describe("the daily cap and scrapes you have already paid for", () => {
  // THE BUG THIS FIXES: a Pro subscriber bought a 5-scrape refill, then was
  // told "That is your 5 for today. More tomorrow." Taking someone's money and
  // then refusing the thing they bought is the worst sentence a billing system
  // can produce.

  it("still blocks at the cap when there are NO refills", () => {
    // The guard itself is untouched: the ₹499 allowance cannot be drained in
    // under four days.
    const result = quota({ scrapesToday: PLANS.studio.dailyCap, refills: 0, scrapesThisPeriod: 5 });

    expect(result.canScrape).toBe(false);
    expect(result.reason).toMatch(/for today/i);
  });

  it("lets a paid refill carry on past the cap", () => {
    const result = quota({ scrapesToday: PLANS.studio.dailyCap, refills: 5, scrapesThisPeriod: PLANS.studio.runs });

    expect(result.canScrape).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.onRefillsToday).toBe(true);
  });

  it("charges those extra scrapes to the LEDGER, not the allowance", () => {
    // Otherwise they would be free, and the cap would have been replaced with
    // nothing at all.
    const overCapWithAllowanceLeft = quota({
      scrapesToday: PLANS.studio.dailyCap,
      scrapesThisPeriod: 5,
      refills: 5,
    });

    expect(overCapWithAllowanceLeft.canScrape).toBe(true);
    expect(overCapWithAllowanceLeft.mustSpendRefill).toBe(true);
  });

  it("still spends the allowance first on a normal day", () => {
    // Below the cap with allowance left, nothing touches the ledger — a pack is
    // never burned while free scrapes remain.
    const result = quota({ scrapesToday: 1, scrapesThisPeriod: 1, refills: 5 });

    expect(result.mustSpendRefill).toBe(false);
    expect(result.onRefillsToday).toBe(false);
  });

  it("still spends refills once the allowance is exhausted", () => {
    const result = quota({ scrapesToday: 1, scrapesThisPeriod: PLANS.studio.runs, refills: 5 });
    expect(result.mustSpendRefill).toBe(true);
  });

  it("says upgrade, not wait, when everything is gone", () => {
    // 402 means buy; 429 means wait. Telling someone to come back tomorrow when
    // tomorrow brings nothing is the failure this ordering avoids.
    const result = quota({
      scrapesToday: PLANS.studio.dailyCap,
      scrapesThisPeriod: PLANS.studio.runs,
      refills: 0,
    });

    expect(result.canScrape).toBe(false);
    // Out of runs entirely: point at the tier that fixes it, not at tomorrow.
    expect(result.reason).toContain(PLANS.agency.name);
  });
});

describe("the four-tier ladder", () => {
  it("gives every tier a bigger allowance than the one below it", () => {
    // The ladder has to be monotonic or a tier is a downgrade you pay for.
    expect(PLANS.creator.runs).toBeGreaterThan(PLANS.free.runs);
    expect(PLANS.studio.runs).toBeGreaterThan(PLANS.creator.runs);
    expect(PLANS.agency.runs).toBeGreaterThan(PLANS.studio.runs);
  });

  it("keeps every daily cap below a third of its own allowance", () => {
    // The spend guard: a month must not be drainable in under three days.
    for (const plan of [PLANS.creator, PLANS.studio, PLANS.agency]) {
      expect(plan.dailyCap * 3).toBeLessThan(plan.runs);
    }
  });

  it("gates Instagram to Studio and above, where the cost is covered", () => {
    // An Instagram run costs 4-6x a YouTube one. The tiers that include it are
    // priced for it; the ones that do not, are not.
    expect(canUseInstagram("free")).toBe(false);
    expect(canUseInstagram("creator")).toBe(false);
    expect(canUseInstagram("studio")).toBe(true);
    expect(canUseInstagram("agency")).toBe(true);
  });

  it("only gives postsPerRun to tiers that may actually use Instagram", () => {
    // A depth figure on a tier that cannot reach Instagram is a number that
    // would eventually be read as permission.
    for (const key of ["free", "creator"] as const) {
      expect(PLANS[key].postsPerRun).toBe(0);
    }
    for (const key of ["studio", "agency"] as const) {
      expect(PLANS[key].postsPerRun).toBeGreaterThan(0);
    }
  });

  it("keeps voice off the free tier, because Whisper costs money per press", () => {
    expect(PLANS.free.features.voiceInput).toBe(false);
    for (const key of ["creator", "studio", "agency"] as const) {
      expect(PLANS[key].features.voiceInput).toBe(true);
    }
  });

  it("walks up the ladder and stops at the top", () => {
    expect(nextTierUp("free")?.key).toBe("creator");
    expect(nextTierUp("creator")?.key).toBe("studio");
    expect(nextTierUp("studio")?.key).toBe("agency");
    expect(nextTierUp("agency")).toBeNull();
  });

  it("tells someone out of runs which tier fixes it, not just that they are out", () => {
    const stuck = computeQuota({
      planKey: "creator",
      scrapesThisPeriod: PLANS.creator.runs,
      scrapesToday: 0,
      refills: 0,
      periodStart: START,
      resetsAt: null,
    });

    expect(stuck.canScrape).toBe(false);
    // Naming the next tier is the difference between a dead end and a door.
    expect(stuck.reason).toContain(PLANS.studio.name);
  });

  it("does not try to sell the top tier something above it", () => {
    const stuck = computeQuota({
      planKey: "agency",
      scrapesThisPeriod: PLANS.agency.runs,
      scrapesToday: 0,
      refills: 0,
      periodStart: START,
      resetsAt: null,
    });

    expect(stuck.canScrape).toBe(false);
    expect(stuck.reason).toMatch(/reset/i);
  });

  it("resets the free allowance monthly now, rather than once ever", () => {
    // Scout used to be a one-time grant. It is three a month, so it needs a
    // period like any other plan — anchored to the calendar with no
    // subscription date to work from.
    const march = new Date("2026-03-17T12:00:00.000Z");
    const start = periodStartFor(march, null);

    expect(start.getUTCFullYear()).toBe(2026);
    expect(start.getUTCMonth()).toBe(2);
    expect(start.getUTCDate()).toBe(1);
  });
});
