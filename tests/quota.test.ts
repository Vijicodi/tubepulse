import { describe, expect, it } from "vitest";
import { PLANS } from "@/lib/billing/plans";
import {
  BILLABLE_JOB_KINDS,
  computeQuota,
  periodEndFor,
  periodStartFor,
  videosPerScrapeFor,
} from "@/lib/billing/quota";
import type { JobKind } from "@/lib/supabase/types";

const START = new Date("2026-01-01T00:00:00.000Z");

function quota(over: Partial<Parameters<typeof computeQuota>[0]> = {}) {
  return computeQuota({
    isPro: true,
    scrapesThisPeriod: 0,
    scrapesToday: 0,
    refills: 0,
    periodStart: START,
    resetsAt: null,
    ...over,
  });
}

describe("plan allowance", () => {
  it("gives Pro its full monthly allowance when nothing is used", () => {
    const q = quota();
    expect(q.allowance).toBe(PLANS.pro.scrapes);
    expect(q.remaining).toBe(PLANS.pro.scrapes);
    expect(q.canScrape).toBe(true);
  });

  it("gives Scout the smaller one-time allowance", () => {
    const q = quota({ isPro: false });
    expect(q.allowance).toBe(PLANS.free.scrapes);
    expect(q.dailyCap).toBe(PLANS.free.dailyCap);
  });

  it("refuses once the allowance and refills are both gone", () => {
    const q = quota({ scrapesThisPeriod: PLANS.pro.scrapes });
    expect(q.remaining).toBe(0);
    expect(q.canScrape).toBe(false);
    expect(q.reason).toMatch(/refill/i);
  });

  it("never lets allowanceUsed exceed the allowance", () => {
    // Refill scrapes still create job rows, so the raw count runs past 20.
    const q = quota({ scrapesThisPeriod: PLANS.pro.scrapes + 5, refills: 3 });
    expect(q.allowanceUsed).toBe(PLANS.pro.scrapes);
    expect(q.allowanceLeft).toBe(0);
    expect(q.remaining).toBe(3);
    expect(q.canScrape).toBe(true);
  });

  it("spends the allowance before refills", () => {
    const q = quota({ scrapesThisPeriod: 1, refills: 5 });
    expect(q.allowanceLeft).toBe(PLANS.pro.scrapes - 1);
    expect(q.remaining).toBe(PLANS.pro.scrapes - 1 + 5);
  });
});

describe("daily cap", () => {
  it("blocks at the cap even with allowance left", () => {
    const q = quota({ scrapesToday: PLANS.pro.dailyCap });
    expect(q.canScrape).toBe(false);
    expect(q.reason).toMatch(/tomorrow/i);
  });

  it("prefers the out-of-scrapes message over the daily one", () => {
    // Being told to come back tomorrow is useless when tomorrow brings nothing.
    const q = quota({
      scrapesThisPeriod: PLANS.pro.scrapes,
      scrapesToday: PLANS.pro.dailyCap,
    });
    expect(q.reason).toMatch(/refill/i);
  });

  it("keeps the cap below a third of the monthly allowance", () => {
    // AGENTS.md: a cap at or above scrapes/3 turns the month into a burst.
    expect(PLANS.pro.dailyCap).toBeLessThan(PLANS.pro.scrapes / 3);
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

  it("never resets Scout's five", () => {
    expect(periodStartFor(new Date("2030-01-01T00:00:00.000Z"), null).getTime()).toBe(0);
  });

  it("resets one month after the period started", () => {
    const end = periodEndFor(new Date("2026-01-28T00:00:00.000Z"), 28);
    expect(end.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });
});

describe("what Pro actually buys", () => {
  it("reads more videos per scrape on Pro", () => {
    expect(videosPerScrapeFor(true)).toBe(PLANS.pro.videosPerScrape);
    expect(videosPerScrapeFor(false)).toBe(PLANS.free.videosPerScrape);
    expect(videosPerScrapeFor(true)).toBeGreaterThan(videosPerScrapeFor(false));
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
    const result = quota({ scrapesToday: 5, refills: 0, scrapesThisPeriod: 5 });

    expect(result.canScrape).toBe(false);
    expect(result.reason).toMatch(/that is your 5 for today/i);
  });

  it("lets a paid refill carry on past the cap", () => {
    const result = quota({ scrapesToday: 5, refills: 5, scrapesThisPeriod: 20 });

    expect(result.canScrape).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.onRefillsToday).toBe(true);
  });

  it("charges those extra scrapes to the LEDGER, not the allowance", () => {
    // Otherwise they would be free, and the cap would have been replaced with
    // nothing at all.
    const overCapWithAllowanceLeft = quota({
      scrapesToday: 5,
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
    const result = quota({ scrapesToday: 1, scrapesThisPeriod: 20, refills: 5 });
    expect(result.mustSpendRefill).toBe(true);
  });

  it("says buy something, not wait, when everything is gone", () => {
    // 402 means buy; 429 means wait. Telling someone to come back tomorrow when
    // tomorrow brings nothing is the failure this ordering avoids.
    const result = quota({ scrapesToday: 5, scrapesThisPeriod: 20, refills: 0 });

    expect(result.canScrape).toBe(false);
    expect(result.reason).toMatch(/buy a refill/i);
  });
});
