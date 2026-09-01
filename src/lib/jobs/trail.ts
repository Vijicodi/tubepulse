/**
 * The agent trail: what a run did, in order, and how long each part took.
 *
 * Pure module, so the shape is testable without a database and importable from
 * anywhere. Backs the "full agent and tool-call audit trail" on Max.
 *
 * ---------------------------------------------------------------------------
 * RECORDED FOR EVERY RUN, SHOWN ONLY TO THE TIERS THAT PAY FOR IT.
 *
 * The gate is at READ time, never at write time, and that is the whole design.
 * A trail that only starts being recorded when you upgrade is worthless on the
 * first day you need it — which is always a day when something has already gone
 * wrong on a run that happened last week. Recording costs a few hundred bytes
 * on a row that exists anyway.
 * ---------------------------------------------------------------------------
 * IT IS A LOG, NOT A TRANSCRIPT. Steps carry what was DONE — "fetched 150
 * videos", "asked gpt-4o for 8 ideas" — never prompts, never model output,
 * never scraped text. Three reasons: the row would be enormous, competitor
 * content is untrusted input that should not be replayed into a page, and a
 * customer reading an audit trail wants the shape of the work rather than its
 * contents, which they already have as ideas.
 */

/** One thing the agent did. */
export interface TrailStep {
  /** A stable machine name. The UI maps it to a label; do not put prose here. */
  step: string;
  /** One line for a person: what happened, with real numbers. */
  detail: string;
  /** Wall-clock milliseconds this step took. */
  ms: number;
  /** Set only when the step failed. A trail records failures, not just wins. */
  error?: string;
}

/**
 * Collects steps as a run proceeds.
 *
 * Deliberately not async and deliberately not throwing: a recorder that can
 * fail is a recorder that takes down the run it was meant to observe. Every
 * method here either records something or does nothing.
 */
export class TrailRecorder {
  private readonly steps: TrailStep[] = [];
  private mark: number;

  constructor(private readonly now: () => number = () => Date.now()) {
    this.mark = this.now();
  }

  /**
   * Record a completed step, timed from the end of the previous one.
   *
   * Timing from the previous mark rather than taking explicit start/end pairs
   * means a caller cannot forget to close a step, which is how trails end up
   * with a plausible-looking gap in the middle.
   */
  add(step: string, detail: string): void {
    const at = this.now();
    this.steps.push({ step, detail, ms: at - this.mark });
    this.mark = at;
  }

  /** Record a step that failed. The run may continue; the trail says it did not. */
  fail(step: string, detail: string, error: string): void {
    const at = this.now();
    this.steps.push({ step, detail, ms: at - this.mark, error });
    this.mark = at;
  }

  /**
   * Time an operation and record it either way.
   *
   * Rethrows after recording, so a failure is both logged and still a failure —
   * swallowing it here would turn an audit trail into a place bugs go to hide.
   */
  async track<T>(
    step: string,
    detail: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      const result = await operation();
      this.add(step, detail);
      return result;
    } catch (error) {
      this.fail(step, detail, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /** Everything recorded so far. A copy, so a caller cannot mutate the log. */
  toJSON(): TrailStep[] {
    return [...this.steps];
  }

  /** Total wall-clock time across every step. */
  totalMs(): number {
    return this.steps.reduce((sum, step) => sum + step.ms, 0);
  }
}

/** Narrow an untrusted jsonb value back to steps. Anything odd reads as empty. */
export function parseTrail(value: unknown): TrailStep[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (entry): entry is TrailStep =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as TrailStep).step === "string" &&
      typeof (entry as TrailStep).detail === "string" &&
      typeof (entry as TrailStep).ms === "number",
  );
}

/** "4.1s" / "820ms" — durations are read for scale, not precision. */
export function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}
