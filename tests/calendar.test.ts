import { describe, expect, it } from "vitest";
import {
  buildMonth,
  dateKey,
  daysInMonth,
  groupSlotsByDay,
  isValidDateKey,
  shiftMonth,
  todayKey,
} from "@/lib/analytics/calendar";
import type { CalendarSlotRow } from "@/lib/supabase/types";

/**
 * Calendar arithmetic, where the bugs are silent and timezone-shaped.
 *
 * The failure this file guards against: a slot planned for Tuesday showing up
 * on Monday for anyone west of UTC, because a `YYYY-MM-DD` string was put
 * through `new Date()` and became midnight UTC. It reproduces for some users
 * and not others, which makes it nearly impossible to diagnose from a report.
 */

function slot(over: Partial<CalendarSlotRow> = {}): CalendarSlotRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    owner_id: "00000000-0000-0000-0000-0000000000aa",
    project_id: "00000000-0000-0000-0000-0000000000bb",
    idea_id: "00000000-0000-0000-0000-0000000000cc",
    scheduled_for: "2026-09-15",
    status: "planned",
    note: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

describe("month lengths", () => {
  it("knows the ordinary months", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("handles February in a common year and a leap year", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
  });

  it("gets the 100 and 400 year leap rules right", () => {
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });
});

describe("stepping between months", () => {
  it("moves forward and back within a year", () => {
    expect(shiftMonth(2026, 5, 1)).toEqual({ year: 2026, month: 6 });
    expect(shiftMonth(2026, 5, -1)).toEqual({ year: 2026, month: 4 });
  });

  it("crosses the year boundary in both directions", () => {
    // The classic off-by-one: month 0 or month 13.
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("steps more than a year at once", () => {
    expect(shiftMonth(2026, 6, 12)).toEqual({ year: 2027, month: 6 });
    expect(shiftMonth(2026, 6, -18)).toEqual({ year: 2024, month: 12 });
  });

  it("never produces a month outside 1-12", () => {
    for (let by = -30; by <= 30; by += 1) {
      const { month } = shiftMonth(2026, 7, by);
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(12);
    }
  });
});

describe("date keys", () => {
  it("zero-pads months and days", () => {
    expect(dateKey(2026, 1, 5)).toBe("2026-01-05");
    expect(dateKey(2026, 12, 25)).toBe("2026-12-25");
  });

  it("reads today from LOCAL parts, not UTC", () => {
    // toISOString() would give the UTC date, marking the wrong cell as today
    // for most of the world for part of every day.
    const localEvening = new Date(2026, 8, 15, 23, 30);
    expect(todayKey(localEvening)).toBe("2026-09-15");
  });

  it("accepts real dates and rejects impossible ones", () => {
    expect(isValidDateKey("2026-09-15")).toBe(true);
    expect(isValidDateKey("2028-02-29")).toBe(true);
    expect(isValidDateKey("2026-02-30")).toBe(false);
    expect(isValidDateKey("2026-13-01")).toBe(false);
    expect(isValidDateKey("2026-00-10")).toBe(false);
    expect(isValidDateKey("2026-9-15")).toBe(false);
    expect(isValidDateKey("not a date")).toBe(false);
    expect(isValidDateKey("")).toBe(false);
  });
});

describe("grouping slots", () => {
  it("groups by day", () => {
    const grouped = groupSlotsByDay([
      slot({ id: "a", scheduled_for: "2026-09-15" }),
      slot({ id: "b", scheduled_for: "2026-09-15" }),
      slot({ id: "c", scheduled_for: "2026-09-16" }),
    ]);
    expect(grouped.get("2026-09-15")).toHaveLength(2);
    expect(grouped.get("2026-09-16")).toHaveLength(1);
  });

  it("survives a full timestamp without shifting the day", () => {
    // If the column type ever changes underneath us, the day must not move.
    const grouped = groupSlotsByDay([
      slot({ scheduled_for: "2026-09-15T23:59:59.000Z" }),
    ]);
    expect(grouped.has("2026-09-15")).toBe(true);
  });

  it("returns an empty map for no slots", () => {
    expect(groupSlotsByDay([]).size).toBe(0);
  });
});

describe("the month grid", () => {
  it("is always whole weeks", () => {
    for (let month = 1; month <= 12; month += 1) {
      const built = buildMonth({ year: 2026, month, slots: [] });
      expect(built.weeks.every((week) => week.length === 7)).toBe(true);
    }
  });

  it("contains every day of the month exactly once", () => {
    const built = buildMonth({ year: 2026, month: 9, slots: [] });
    const inMonth = built.weeks.flat().filter((day) => day.inMonth);
    expect(inMonth).toHaveLength(30);
    expect(new Set(inMonth.map((day) => day.key)).size).toBe(30);
  });

  it("borrows leading and trailing days from the neighbouring months", () => {
    // September 2026 starts on a Tuesday, so Sunday and Monday come from
    // August and the grid is completed from October.
    const built = buildMonth({ year: 2026, month: 9, slots: [] });
    const cells = built.weeks.flat();
    expect(cells[0]?.key).toBe("2026-08-30");
    expect(cells[0]?.inMonth).toBe(false);
    expect(cells.at(-1)?.inMonth).toBe(false);
  });

  it("puts a slot on the right day", () => {
    const built = buildMonth({
      year: 2026,
      month: 9,
      slots: [slot({ scheduled_for: "2026-09-15" })],
    });
    const day = built.weeks.flat().find((cell) => cell.key === "2026-09-15");
    expect(day?.slots).toHaveLength(1);
  });

  it("marks exactly one day as today, and only when it is in view", () => {
    const built = buildMonth({
      year: 2026,
      month: 9,
      slots: [],
      today: "2026-09-15",
    });
    expect(built.weeks.flat().filter((day) => day.isToday)).toHaveLength(1);

    const otherMonth = buildMonth({
      year: 2027,
      month: 3,
      slots: [],
      today: "2026-09-15",
    });
    expect(otherMonth.weeks.flat().some((day) => day.isToday)).toBe(false);
  });

  it("counts only slots that fall inside the month", () => {
    // A slot on a borrowed leading day belongs to August, and counting it
    // against September would make the header disagree with the grid.
    const built = buildMonth({
      year: 2026,
      month: 9,
      slots: [
        slot({ id: "a", scheduled_for: "2026-09-15" }),
        slot({ id: "b", scheduled_for: "2026-08-31" }),
      ],
    });
    expect(built.slotCount).toBe(1);
  });

  it("handles a February that starts on a Sunday without an empty first row", () => {
    // February 2026 starts on a Sunday and has 28 days: exactly four weeks.
    const built = buildMonth({ year: 2026, month: 2, slots: [] });
    expect(built.weeks).toHaveLength(4);
    expect(built.weeks[0]?.[0]?.key).toBe("2026-02-01");
  });

  it("labels the month for a human", () => {
    expect(buildMonth({ year: 2026, month: 9, slots: [] }).label).toBe(
      "September 2026",
    );
    expect(buildMonth({ year: 2026, month: 1, slots: [] }).label).toBe(
      "January 2026",
    );
  });

  it("crosses a year boundary in the borrowed days", () => {
    const built = buildMonth({ year: 2027, month: 1, slots: [] });
    expect(built.weeks.flat()[0]?.key.startsWith("2026-12")).toBe(true);
  });

  it("renders an empty month without throwing", () => {
    const built = buildMonth({ year: 2026, month: 9, slots: [] });
    expect(built.slotCount).toBe(0);
    expect(built.weeks.flat().every((day) => day.slots.length === 0)).toBe(true);
  });
});
