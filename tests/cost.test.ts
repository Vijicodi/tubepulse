import { describe, expect, it } from "vitest";
import { RATES, costOf, formatCost, worstCaseRunCents } from "@/lib/billing/cost";
import { TrailRecorder, formatDuration, parseTrail } from "@/lib/jobs/trail";

/**
 * A number shown to a paying customer has to be tested rather than eyeballed.
 *
 * The per-run cost breakdown is sold on Studio and Max. If it is wrong in
 * the customer's favour nobody complains and the margin quietly bleeds; if it
 * is wrong the other way, someone is being told their work cost more than it
 * did. Neither shows up in a typecheck.
 */

describe("what a run costs", () => {
  it("charges nothing for a run that used nothing", () => {
    const cost = costOf({});
    expect(cost.lines).toHaveLength(0);
    expect(cost.totalCents).toBe(0);
  });

  it("omits a component entirely rather than listing it at zero", () => {
    // "Firecrawl $0.00" invites the question of why it is there. A run that
    // never touched a provider should not mention that provider.
    const cost = costOf({ videosScraped: 100 });

    expect(cost.lines).toHaveLength(1);
    expect(cost.lines[0].provider).toBe("apify");
    expect(cost.lines.some((line) => line.provider === "firecrawl")).toBe(false);
  });

  it("always sums to its own lines", () => {
    // The total is computed FROM the lines, so a customer adding them up by
    // hand can never reach a different answer than the one displayed.
    const cost = costOf({
      videosScraped: 150,
      pagesEnriched: 3,
      llmTier: "premium",
      llmInputTokens: 6000,
      llmOutputTokens: 9000,
    });

    const summed = cost.lines.reduce((total, line) => total + line.cents, 0);
    expect(cost.totalCents).toBeCloseTo(summed, 10);
  });

  it("prices Instagram far above YouTube, per item", () => {
    // Measured at four to six times the rate. This is the reason postsPerRun
    // is smaller than videosPerRun on every tier — the depth moves, not the
    // price.
    expect(RATES.apifyPerPost).toBeGreaterThan(RATES.apifyPerVideo * 4);
  });

  it("prices output tokens above input tokens on both tiers", () => {
    // Output is several times dearer everywhere, which is why the breakdown
    // shows the split rather than one combined token count.
    expect(RATES.llmOutputPer1k.mini).toBeGreaterThan(RATES.llmInputPer1k.mini);
    expect(RATES.llmOutputPer1k.premium).toBeGreaterThan(RATES.llmInputPer1k.premium);
  });

  it("makes the premium model cost meaningfully more than the fast one", () => {
    // If these were close, tiering the model would be theatre rather than a
    // real cost difference the pricing is built on.
    expect(RATES.llmOutputPer1k.premium).toBeGreaterThan(
      RATES.llmOutputPer1k.mini * 5,
    );
  });

  it("counts a mini-tier generation as much cheaper than a premium one", () => {
    const shared = { llmInputTokens: 6000, llmOutputTokens: 9000 } as const;
    const mini = costOf({ ...shared, llmTier: "mini" }).totalCents;
    const premium = costOf({ ...shared, llmTier: "premium" }).totalCents;

    expect(premium).toBeGreaterThan(mini * 5);
  });

  it("bills what was actually pulled, not what was asked for", () => {
    // An actor can return fewer items than requested. The customer is charged
    // for what arrived.
    const asked = costOf({ videosScraped: 200 }).totalCents;
    const got = costOf({ videosScraped: 137 }).totalCents;

    expect(got).toBeLessThan(asked);
    expect(got).toBeCloseTo(137 * RATES.apifyPerVideo, 10);
  });
});

describe("showing a cost to a person", () => {
  it("never renders a real cost as $0.00", () => {
    // A run that cost a third of a cent is not free, and telling someone it
    // was free invites the question of why their allowance moved.
    const tiny = formatCost(0.3);
    expect(tiny).not.toBe("$0.00");
    expect(tiny.startsWith("$0.00")).toBe(true); // more places, not zero
  });

  it("renders a genuine zero as zero", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("renders anything above a cent in ordinary money", () => {
    expect(formatCost(19.89)).toBe("$0.20");
    expect(formatCost(100)).toBe("$1.00");
  });
});

describe("the worst case a single run can reach", () => {
  it("is a deep Instagram pull on the premium model", () => {
    const premium = worstCaseRunCents("premium");
    const mini = worstCaseRunCents("mini");

    expect(premium).toBeGreaterThan(mini);
  });

  it("stays inside what a single Max run can afford", () => {
    // Max is $89 for 150 runs — 59c a run at list price. The worst single
    // run must sit well under that, or one unlucky month of all-Instagram
    // research would cost more than the plan.
    //
    // THIS IS THE THIN ONE. Max carries the most runs, so cost scales
    // hardest there; it is the tier a sustained provider price rise would
    // move first. See the margin notes in plans.ts.
    expect(worstCaseRunCents("premium")).toBeLessThan(59);
  });
});

describe("the agent trail", () => {
  it("records steps in order, with the time each took", () => {
    let clock = 1000;
    const trail = new TrailRecorder(() => clock);

    clock = 1500;
    trail.add("collect", "Pulled 150 videos");
    clock = 4000;
    trail.add("generate", "Asked for 8 ideas");

    const steps = trail.toJSON();
    expect(steps).toHaveLength(2);
    expect(steps[0].step).toBe("collect");
    expect(steps[0].ms).toBe(500);
    expect(steps[1].ms).toBe(2500);
    expect(trail.totalMs()).toBe(3000);
  });

  it("records a failure rather than swallowing it", async () => {
    const trail = new TrailRecorder();

    await expect(
      trail.track("generate", "Asked for ideas", async () => {
        throw new Error("model refused");
      }),
    ).rejects.toThrow("model refused");

    // Both things must be true: the caller still sees the failure, AND the
    // trail records it. An audit trail that hides errors is worse than none.
    const steps = trail.toJSON();
    expect(steps).toHaveLength(1);
    expect(steps[0].error).toBe("model refused");
  });

  it("hands out a copy, so a caller cannot rewrite the log", () => {
    const trail = new TrailRecorder();
    trail.add("collect", "Pulled 10 videos");

    trail.toJSON().push({ step: "forged", detail: "never happened", ms: 0 });

    expect(trail.toJSON()).toHaveLength(1);
  });

  it("reads back an untrusted jsonb value without throwing", () => {
    // The column is jsonb, so anything could be in there — an old row, a hand
    // edit, a partial write. A malformed trail renders as empty rather than
    // taking down the page that displays it.
    expect(parseTrail(null)).toEqual([]);
    expect(parseTrail("not an array")).toEqual([]);
    expect(parseTrail([{ nonsense: true }])).toEqual([]);
    expect(parseTrail([{ step: "a", detail: "b", ms: 1 }])).toHaveLength(1);
  });

  it("formats durations for scale rather than precision", () => {
    expect(formatDuration(820)).toBe("820ms");
    expect(formatDuration(4120)).toBe("4.1s");
  });
});
