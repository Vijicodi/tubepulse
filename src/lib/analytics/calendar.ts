import type { CalendarSlotRow } from "@/lib/supabase/types";

/**
 * Building a month grid, and the date arithmetic behind it.
 *
 * Pure module — no database, no clock of its own beyond what is passed in —
 * so every edge case below is testable without a browser or a fixed system
 * timezone.
 *
 * ---------------------------------------------------------------------------
 * DATES HERE ARE STRINGS, NOT `Date` OBJECTS, AND THAT IS DELIBERATE.
 *
 * A slot is stored as a plain `date` column (YYYY-MM-DD) precisely because a
 * calendar has no time of day. The moment such a value is put through
 * `new Date("2026-09-01")` it becomes midnight UTC, and for anyone west of
 * UTC `getDate()` then reports the 31st of August — the slot silently moves a
 * day, and only for some users, which is the worst kind of bug to reproduce.
 *
 * So the key type throughout is a `YYYY-MM-DD` STRING, compared and built as
 * text. `Date` is used only where genuine calendar arithmetic is unavoidable
 * (how many days a month has, which weekday it starts on), and there it is
 * always constructed with explicit numeric parts in UTC.
 * ---------------------------------------------------------------------------
 */

/** A calendar day key: `YYYY-MM-DD`. */
export type DateKey = string;

export interface CalendarDay {
  /** `YYYY-MM-DD`, the key slots are matched on. */
  key: DateKey;
  /** Day of the month, 1-31. */
  dayOfMonth: number;
  /** False for the leading and trailing days borrowed from adjacent months. */
  inMonth: boolean;
  /** True only for the real today, passed in rather than read from a clock. */
  isToday: boolean;
  /** Slots falling on this day, in the order they were given. */
  slots: CalendarSlotRow[];
}

export interface CalendarMonth {
  year: number;
  /** 1-12. Human numbering, because this is read by people, not by `Date`. */
  month: number;
  label: string;
  /** Always whole weeks, so the grid never has a ragged final row. */
  weeks: CalendarDay[][];
  /** Slots in this month, across every day. */
  slotCount: number;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Zero-pad to two digits without pulling in a formatting library. */
function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Build a `YYYY-MM-DD` key from human-numbered parts (month 1-12). */
export function dateKey(year: number, month: number, day: number): DateKey {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Today, as a key, in the viewer's own timezone.
 *
 * Uses the LOCAL parts rather than `toISOString()`, which would return the UTC
 * date and mark the wrong cell as today for most of the world for part of
 * every day.
 */
export function todayKey(now: Date = new Date()): DateKey {
  return dateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** How many days in a month. Month is 1-12. */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the NEXT month is the last day of this one. UTC throughout so a
  // local timezone cannot shift the answer.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Which weekday a month starts on. 0 = Sunday. */
function firstWeekday(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

/** Step a month, handling the year boundary. Month is 1-12. */
export function shiftMonth(
  year: number,
  month: number,
  by: number,
): { year: number; month: number } {
  // Convert to a zero-based absolute month count so the arithmetic cannot
  // produce month 0 or 13, which is the classic off-by-one here.
  const absolute = year * 12 + (month - 1) + by;
  return {
    year: Math.floor(absolute / 12),
    month: (absolute % 12) + 1,
  };
}

/**
 * Group slots by the day they fall on.
 *
 * `scheduled_for` may arrive as `2026-09-01` or, if the column type ever
 * changes underneath us, as a full timestamp. Taking the first ten characters
 * handles both without parsing, and without a timezone ever being consulted.
 */
export function groupSlotsByDay(
  slots: CalendarSlotRow[],
): Map<DateKey, CalendarSlotRow[]> {
  const byDay = new Map<DateKey, CalendarSlotRow[]>();

  for (const slot of slots) {
    const key = slot.scheduled_for.slice(0, 10);
    const existing = byDay.get(key);
    if (existing) existing.push(slot);
    else byDay.set(key, [slot]);
  }

  return byDay;
}

/**
 * The month grid: whole weeks, Sunday-first, with adjacent days filled in.
 *
 * Leading and trailing days are included rather than left blank so the grid is
 * always a clean rectangle. They are marked `inMonth: false` so the UI can dim
 * them — a calendar that hides them entirely makes the first week jump around,
 * and one that treats them as normal invites scheduling into the wrong month.
 */
export function buildMonth({
  year,
  month,
  slots,
  today = todayKey(),
}: {
  year: number;
  /** 1-12. */
  month: number;
  slots: CalendarSlotRow[];
  today?: DateKey;
}): CalendarMonth {
  const byDay = groupSlotsByDay(slots);
  const total = daysInMonth(year, month);
  const offset = firstWeekday(year, month);

  const previous = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const previousTotal = daysInMonth(previous.year, previous.month);

  const cells: CalendarDay[] = [];

  // Leading days from the previous month.
  for (let index = offset - 1; index >= 0; index -= 1) {
    const day = previousTotal - index;
    const key = dateKey(previous.year, previous.month, day);
    cells.push({
      key,
      dayOfMonth: day,
      inMonth: false,
      isToday: key === today,
      slots: byDay.get(key) ?? [],
    });
  }

  // The month itself.
  for (let day = 1; day <= total; day += 1) {
    const key = dateKey(year, month, day);
    cells.push({
      key,
      dayOfMonth: day,
      inMonth: true,
      isToday: key === today,
      slots: byDay.get(key) ?? [],
    });
  }

  // Trailing days, enough to complete the final week.
  let day = 1;
  while (cells.length % 7 !== 0) {
    const key = dateKey(next.year, next.month, day);
    cells.push({
      key,
      dayOfMonth: day,
      inMonth: false,
      isToday: key === today,
      slots: byDay.get(key) ?? [],
    });
    day += 1;
  }

  const weeks: CalendarDay[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  return {
    year,
    month,
    label: `${MONTH_NAMES[month - 1]} ${year}`,
    weeks,
    // Counted from the cells that are actually IN the month, so a slot in a
    // borrowed leading day is not double-counted against this month's total.
    slotCount: cells.filter((cell) => cell.inMonth).reduce(
      (sum, cell) => sum + cell.slots.length,
      0,
    ),
  };
}

/** Is this a well-formed `YYYY-MM-DD` that names a real day? */
export function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;

  // Catches 31 February and similar, which the regex alone cannot.
  return day <= daysInMonth(year, month);
}
