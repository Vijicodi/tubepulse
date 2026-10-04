import { describe, expect, it } from "vitest";
import {
  formatCompact,
  formatDate,
  formatDay,
  formatDayTime,
  formatNumber,
  istWeekday,
} from "@/lib/format";
import { byDayOfWeek, MIN_SAMPLE } from "@/lib/analytics/patterns";
import type { VideoRow } from "@/lib/supabase/types";

/**
 * Every workspace date is India time in one style, and every number uses
 * Indian grouping. The servers run in UTC, so these are the cases where the
 * old `toLocale…String()` calls printed the wrong day.
 */
describe("dates in IST", () => {
  it("prints one style: day, short month, year", () => {
    expect(formatDate("2026-11-04T06:00:00Z")).toBe("4 Nov 2026");
    expect(formatDay("2026-11-04T06:00:00Z")).toBe("4 Nov");
  });

  it("moves a late-evening UTC instant to the next day", () => {
    // 20:00 UTC on 31 Dec is 01:30 IST on 1 Jan.
    expect(formatDate("2025-12-31T20:00:00Z")).toBe("1 Jan 2026");
  });

  it("never prints Sept, whatever ICU the runtime carries", () => {
    expect(formatDay("2026-09-15T00:00:00Z")).toBe("15 Sep");
  });

  it("prints times on a 12-hour clock in IST", () => {
    // The runs page's own example: 12:49 UTC is 6:19 pm IST.
    expect(formatDayTime("2026-10-04T12:49:00Z")).toBe("4 Oct, 6:19 pm");
    expect(formatDayTime("2026-10-04T18:45:00Z")).toBe("5 Oct, 12:15 am");
    expect(formatDayTime("2026-10-04T06:30:00Z")).toBe("4 Oct, 12:00 pm");
  });

  it("prints a dash for an unparseable value, never Invalid Date", () => {
    expect(formatDate("not a date")).toBe("—");
    expect(formatDayTime("")).toBe("—");
  });

  it("reads the weekday in IST", () => {
    // Tuesday 20:00 UTC is Wednesday 01:30 IST.
    expect(istWeekday("2026-08-04T20:00:00Z")).toBe(3);
    expect(istWeekday("2026-08-04T12:00:00Z")).toBe(2);
    expect(istWeekday("nope")).toBe(-1);
  });
});

describe("numbers in en-IN", () => {
  it("groups in lakhs and crores", () => {
    expect(formatNumber(60395634)).toBe("6,03,95,634");
    expect(formatNumber(1234)).toBe("1,234");
    expect(formatNumber(null)).toBe("—");
  });

  it("keeps the compact form in the same system", () => {
    expect(formatCompact(21300000)).toBe("2.1Cr");
    expect(formatCompact(null)).toBe("—");
  });
});

describe("patterns bucket weekdays in IST", () => {
  const video = (published_at: string, id: number): VideoRow =>
    ({
      id: `v${id}`,
      channel_id: "c",
      kind: "video",
      title: `Video ${id}`,
      url: "https://youtube.com/watch?v=x",
      view_count: 1000,
      like_count: 10,
      comment_count: 1,
      duration_seconds: 300,
      published_at,
      outlier_score: 2,
      velocity: 10,
    }) as unknown as VideoRow;

  it("puts an upload at 01:30 IST on the IST day, not the UTC one", () => {
    // Every one of these is a Tuesday in UTC and a Wednesday in India.
    const late = Array.from({ length: MIN_SAMPLE }, (_, i) =>
      video("2026-08-04T20:00:00Z", i),
    );
    const pattern = byDayOfWeek(late);
    const labels = pattern.buckets.map((bucket) => bucket.label);
    expect(labels).toContain("Wednesday");
    expect(labels).not.toContain("Tuesday");
  });
});
