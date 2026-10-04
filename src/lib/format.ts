/**
 * One way to print a date and a number, everywhere in the workspace.
 *
 * WHY THIS EXISTS. The sweep on 2026-10-04 found three date styles on one
 * account ("Dec 31, 25", "4 Nov", "November 3, 2026") and two digit groupings
 * on one screen ("2,13,00,000" next to "60,395,634"). Each came from a
 * `toLocale…String()` call with no locale or no time zone — and these pages
 * render on Vercel's servers, which run in UTC with an en-US default. For an
 * India-only product that meant US formatting, and a date a day early for
 * anything published between 00:00 and 05:30 IST.
 *
 * So: India Standard Time, day-month order, and en-IN grouping, in one place.
 *
 * Month names come from a fixed list rather than Intl, because ICU versions
 * disagree on September ("Sep" or "Sept") and a server and a browser on
 * different versions would print the same date two ways.
 */

export const IST = "Asia/Kolkata";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const istParts = new Intl.DateTimeFormat("en-US", {
  timeZone: IST,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});

type DateInput = string | number | Date;

function toDate(value: DateInput): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The calendar fields of an instant, as a clock in India reads them. */
export function istFields(value: DateInput): {
  year: number;
  month: number;
  day: number;
  /** 0 = Sunday, matching Date#getDay. */
  weekday: number;
  hour: number;
  minute: number;
} | null {
  const date = toDate(value);
  if (!date) return null;

  const parts: Record<string, string> = {};
  for (const part of istParts.formatToParts(date)) parts[part.type] = part.value;

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAYS.indexOf(parts.weekday),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** "4 Nov 2026". An unparseable value prints as a dash, never "Invalid Date". */
export function formatDate(value: DateInput): string {
  const f = istFields(value);
  return f ? `${f.day} ${MONTHS[f.month - 1]} ${f.year}` : "—";
}

/** "4 Nov" — for tight spaces where the year is obvious from context. */
export function formatDay(value: DateInput): string {
  const f = istFields(value);
  return f ? `${f.day} ${MONTHS[f.month - 1]}` : "—";
}

/** "4 Nov, 6:19 pm" — the runs page's existing style, now shared. */
export function formatDayTime(value: DateInput): string {
  const f = istFields(value);
  if (!f) return "—";
  const hour12 = f.hour % 12 === 0 ? 12 : f.hour % 12;
  const minute = String(f.minute).padStart(2, "0");
  return `${f.day} ${MONTHS[f.month - 1]}, ${hour12}:${minute} ${f.hour < 12 ? "am" : "pm"}`;
}

/** Day of the week in IST, 0 = Sunday. -1 for an unparseable value. */
export function istWeekday(value: DateInput): number {
  return istFields(value)?.weekday ?? -1;
}

const grouped = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const compactFormat = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** "6,03,95,634" — Indian grouping, whole numbers. Null prints as a dash. */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return grouped.format(value);
}

/** "6Cr", "60.4L", "1.2K" — the short form, in the same en-IN system. */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return compactFormat.format(value);
}
