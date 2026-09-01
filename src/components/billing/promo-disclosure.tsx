"use client";

import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * What happens AFTER the discount, stated where the customer cannot miss it.
 *
 * This is the component that turns a promo from a marketing line into an
 * informed agreement. A two-month discount on a subscription has a cliff: the
 * third invoice is 40-50% higher than the first two, and a customer who
 * discovers that on their statement is right to be angry no matter what the
 * terms page said.
 *
 * So this is deliberately NOT dim, NOT small and NOT collapsed. The pattern it
 * refuses is the one every dark-pattern checkout uses — a bright discounted
 * price and a grey renewal clause. Card networks treat an undisclosed renewal
 * as a chargeback risk, and the customer being sure of what they signed up for
 * is the whole point of taking the card before the discount ends.
 *
 * It renders nothing when there is nothing to disclose (a forever discount, or
 * a code with no cliff), because a reassurance nobody needs is noise.
 */
export function PromoDisclosure({
  cyclesCovered,
  discountedCents,
  renewsAtCents,
  cycle,
  className,
}: {
  /** Billing cycles the discount covers. Null means it never ends. */
  cyclesCovered: number | null;
  /** What they pay during the discounted cycles, in cents. */
  discountedCents: number;
  /** What they pay once it ends, in cents. */
  renewsAtCents: number | null;
  cycle: "monthly" | "yearly";
  className?: string;
}) {
  if (cyclesCovered === null || renewsAtCents === null) return null;

  const unit = cycle === "yearly" ? "year" : "month";
  const plural = cyclesCovered === 1 ? unit : `${unit}s`;
  const nextIndex = cyclesCovered + 1;

  return (
    <div
      className={cn(
        "border-border/70 bg-muted/30 rounded-lg border p-3",
        className,
      )}
    >
      <p className="flex items-center gap-2 text-xs font-medium">
        <CalendarClock className="size-3.5 shrink-0" aria-hidden />
        What you will be charged
      </p>

      <ol className="mt-2.5 space-y-1.5 text-xs">
        <li className="flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground">
            {cyclesCovered === 1
              ? `First ${unit}`
              : `${capitalise(numberWord(cyclesCovered))} ${plural}`}
          </span>
          <span className="font-medium text-[var(--brand-2)]">
            {formatCents(discountedCents)}/{unit}
          </span>
        </li>
        <li className="flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground">
            From {ordinal(nextIndex)} {unit}
          </span>
          <span className="font-medium">
            {formatCents(renewsAtCents)}/{unit}
          </span>
        </li>
      </ol>

      {/* The cancel sentence belongs HERE, next to the number that goes up —
          not buried in a terms link. Someone who knows they can leave before
          the price rises is a customer; someone who finds out afterwards is a
          dispute. */}
      <p className="text-muted-foreground mt-2.5 text-[0.7rem] leading-relaxed">
        Your card is charged {formatCents(discountedCents)} now. Cancel any time
        before the {ordinal(nextIndex)} {unit} and you are never charged the
        full price.
      </p>
    </div>
  );
}

function formatCents(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars.toLocaleString("en-US")}`
    : `$${dollars.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
}

/** Small numbers read better as words in a sentence. */
function numberWord(n: number): string {
  return ["zero", "one", "two", "three", "four", "five", "six"][n] ?? String(n);
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function ordinal(n: number): string {
  const words = ["", "first", "second", "third", "fourth", "fifth", "sixth"];
  return words[n] ?? `${n}th`;
}
