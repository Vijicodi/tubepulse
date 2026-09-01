"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2, Plus, X } from "lucide-react";
import type { CalendarMonth } from "@/lib/analytics/calendar";
import { shiftMonth } from "@/lib/analytics/calendar";
import {
  removeSlot,
  scheduleIdea,
  setSlotStatus,
  type CalendarFormState,
} from "@/lib/calendar/actions";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const INITIAL: CalendarFormState = { error: null };

/**
 * The month grid, and the small forms that write to it.
 *
 * MONTH NAVIGATION IS LINKS, NOT STATE. Each arrow is a real href, so a month
 * can be bookmarked, shared and reloaded, and the back button does what it
 * looks like it does. Client state here would be invisible to all three.
 *
 * The grid itself is plain CSS grid rather than a calendar library: seven
 * columns and whole weeks is the entire requirement, and the arithmetic that
 * is genuinely easy to get wrong already lives in lib/analytics/calendar.ts,
 * tested away from the DOM.
 *
 * WHY NO DRAG AND DROP. Dragging a slot to another day looks like the obvious
 * interaction and is the wrong first version: it needs pointer, touch and
 * keyboard paths to be equivalent or it silently excludes anyone not using a
 * mouse. A date input on each slot is duller, works everywhere, and is honest
 * about what it does.
 */
export function CalendarGrid({
  month,
  titles,
  savedIdeas,
  today,
}: {
  month: CalendarMonth;
  /** idea id → title, for whatever is on the grid. */
  titles: Record<string, string>;
  savedIdeas: { id: string; title: string }[];
  today: string;
}) {
  const [openDay, setOpenDay] = useState<string | null>(null);

  const previous = shiftMonth(month.year, month.month, -1);
  const next = shiftMonth(month.year, month.month, 1);

  return (
    <div>
      <nav className="mb-4 flex items-center justify-between gap-3">
        <Link
          href={`/calendar?y=${previous.year}&m=${previous.month}`}
          aria-label="Previous month"
          className="border-border/60 hover:bg-muted/40 rounded-lg border p-1.5 transition-colors"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Link>

        <p className="text-sm font-medium">
          {month.label}
          <span className="text-muted-foreground ml-2 font-normal">
            {month.slotCount} planned
          </span>
        </p>

        <Link
          href={`/calendar?y=${next.year}&m=${next.month}`}
          aria-label="Next month"
          className="border-border/60 hover:bg-muted/40 rounded-lg border p-1.5 transition-colors"
        >
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </nav>

      {/* Scrolls inside its own container on narrow screens rather than making
          the page scroll sideways. Seven columns cannot usefully reflow. */}
      <div className="overflow-x-auto">
        <div className="min-w-[42rem]">
          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="text-muted-foreground px-1 py-1 text-[0.68rem] tracking-wide uppercase"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {month.weeks.flat().map((day) => (
              <div
                key={day.key}
                className={cn(
                  "border-border/50 min-h-24 rounded-lg border p-1.5",
                  day.inMonth ? "bg-card/30" : "bg-muted/10",
                  day.isToday && "border-[var(--brand-2)]",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      "font-mono text-[0.68rem] tabular-nums",
                      day.inMonth ? "text-muted-foreground" : "text-muted-foreground/40",
                      day.isToday && "text-[var(--brand-2)] font-medium",
                    )}
                  >
                    {day.dayOfMonth}
                  </span>

                  {/* Only inside the month, and only forwards. Scheduling into
                      a borrowed cell would silently write to another month. */}
                  {day.inMonth && day.key >= today && savedIdeas.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setOpenDay(openDay === day.key ? null : day.key)}
                      aria-label={`Schedule an idea on ${day.key}`}
                      aria-expanded={openDay === day.key}
                      className="text-muted-foreground/60 hover:text-foreground transition-colors"
                    >
                      <Plus className="size-3.5" aria-hidden />
                    </button>
                  )}
                </div>

                <ul className="mt-1 space-y-1">
                  {day.slots.map((slot) => (
                    <li key={slot.id}>
                      <SlotChip
                        slotId={slot.id}
                        title={titles[slot.idea_id] ?? "Untitled idea"}
                        status={slot.status}
                      />
                    </li>
                  ))}
                </ul>

                {openDay === day.key && (
                  <ScheduleForm
                    date={day.key}
                    savedIdeas={savedIdeas}
                    onDone={() => setOpenDay(null)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {savedIdeas.length === 0 && (
        <p className="text-muted-foreground mt-4 text-xs">
          Nothing to schedule yet. Shortlist an idea in{" "}
          <Link href="/saved-ideas" className="text-foreground underline underline-offset-2">
            Saved ideas
          </Link>{" "}
          and it becomes available here.
        </p>
      )}
    </div>
  );
}

/** One planned slot: its title, its state, and a way to remove it. */
function SlotChip({
  slotId,
  title,
  status,
}: {
  slotId: string;
  title: string;
  status: "planned" | "published" | "dropped";
}) {
  const [removeState, remove, removing] = useActionState(removeSlot, INITIAL);
  const [statusState, changeStatus, changing] = useActionState(
    setSlotStatus,
    INITIAL,
  );

  const error = removeState.error ?? statusState.error;

  return (
    <div
      className={cn(
        "group rounded px-1.5 py-1 text-[0.7rem] leading-tight",
        status === "published" && "bg-[var(--brand-2)]/15 text-foreground",
        status === "planned" && "bg-muted/60 text-foreground",
        status === "dropped" && "bg-muted/30 text-muted-foreground line-through",
      )}
    >
      <div className="flex items-start gap-1">
        <span className="min-w-0 flex-1 break-words">{title}</span>

        <form action={remove}>
          <input type="hidden" name="slotId" value={slotId} />
          <button
            type="submit"
            disabled={removing}
            aria-label={`Remove ${title} from the calendar`}
            className="text-muted-foreground/50 hover:text-foreground shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            {removing ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : (
              <X className="size-3" aria-hidden />
            )}
          </button>
        </form>
      </div>

      {/* Cycles planned → published → dropped → planned. One control rather
          than three: a chip this size cannot carry a menu, and the label
          always says what the next press does. */}
      <form action={changeStatus} className="mt-0.5">
        <input type="hidden" name="slotId" value={slotId} />
        <input
          type="hidden"
          name="status"
          value={
            status === "planned"
              ? "published"
              : status === "published"
                ? "dropped"
                : "planned"
          }
        />
        <button
          type="submit"
          disabled={changing}
          className="text-muted-foreground/70 hover:text-foreground text-[0.62rem] tracking-wide uppercase transition-colors"
        >
          {status === "planned"
            ? "Mark published"
            : status === "published"
              ? "Mark dropped"
              : "Mark planned"}
        </button>
      </form>

      {error && <p className="text-destructive mt-0.5 text-[0.62rem]">{error}</p>}
    </div>
  );
}

/** The little form that puts a saved idea on a day. */
function ScheduleForm({
  date,
  savedIdeas,
  onDone,
}: {
  date: string;
  savedIdeas: { id: string; title: string }[];
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(scheduleIdea, INITIAL);

  return (
    <form
      action={async (formData) => {
        await submit(formData);
        // Closed optimistically. The action revalidates the page, so a failure
        // still surfaces — on the reloaded grid rather than in a panel that
        // has already gone.
        onDone();
      }}
      className="border-border/60 bg-background mt-1.5 space-y-1 rounded-lg border p-1.5"
    >
      <input type="hidden" name="scheduledFor" value={date} />

      <label className="sr-only" htmlFor={`idea-${date}`}>
        Idea to schedule
      </label>
      <select
        id={`idea-${date}`}
        name="ideaId"
        required
        defaultValue=""
        className="border-border/60 bg-background w-full rounded border px-1 py-1 text-[0.7rem]"
      >
        <option value="" disabled>
          Pick an idea
        </option>
        {savedIdeas.map((idea) => (
          <option key={idea.id} value={idea.id}>
            {idea.title}
          </option>
        ))}
      </select>

      <button
        type="submit"
        disabled={pending}
        className="bg-muted/60 hover:bg-muted w-full rounded px-1 py-1 text-[0.7rem] font-medium transition-colors disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add"}
      </button>

      {state.error && (
        <p className="text-destructive text-[0.62rem]">{state.error}</p>
      )}
    </form>
  );
}
