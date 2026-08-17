"use client";

import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import type { BillingCycle, TopupKey } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

/**
 * The "have a code?" field.
 *
 * Collapsed to a link by default, on purpose. An empty promo box sitting under
 * a price is a message that everyone else is paying less than you, and it sends
 * people off to hunt for a coupon rather than buy. Someone who has a code will
 * find the link; someone who does not is never shown a gap to fill.
 *
 * WHAT IT DOES AND DOES NOT DO. It previews. The discount shown here grants
 * nothing — checkout re-validates the same code server-side and is what decides
 * the charge. So a stale preview cannot become a wrong price; the worst case is
 * an error at checkout saying the code expired.
 */

export interface AppliedPromo {
  code: string;
  label: string;
  discountPaise: number;
  finalPaise: number;
  originalPaise: number;
}

export function PromoField({
  target,
  cycle,
  pack,
  applied,
  onApplied,
  disabled = false,
  className,
}: {
  target: "subscription" | "topup";
  cycle?: BillingCycle;
  pack?: TopupKey;
  applied: AppliedPromo | null;
  onApplied: (promo: AppliedPromo | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    const trimmed = code.trim();
    if (trimmed === "") return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/billing/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed, target, cycle, pack }),
      });

      const data = (await response.json()) as
        | ({ ok: true } & AppliedPromo)
        | { ok: false; reason: string };

      if (!data.ok) {
        setError(data.reason);
        onApplied(null);
        return;
      }

      onApplied({
        code: data.code,
        label: data.label,
        discountPaise: data.discountPaise,
        finalPaise: data.finalPaise,
        originalPaise: data.originalPaise,
      });
      setError(null);
    } catch {
      setError("Could not check that code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    onApplied(null);
    setCode("");
    setError(null);
  }

  if (applied) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm",
          "border-border/60 bg-muted/30 border",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Check className="size-4 shrink-0 text-[var(--brand-2)]" aria-hidden />
          <span className="truncate font-mono text-xs uppercase">{applied.code}</span>
          <span className="text-muted-foreground shrink-0">{applied.label}</span>
        </span>
        <button
          type="button"
          onClick={clear}
          className="text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Remove code"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={cn(
          "text-muted-foreground hover:text-foreground text-xs underline underline-offset-4",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        Have a promo code?
      </button>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void check();
            }
          }}
          placeholder="Enter code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={disabled || busy}
          className={cn(
            "border-border/60 bg-background/50 h-9 min-w-0 flex-1 rounded-lg border px-3",
            "font-mono text-sm uppercase placeholder:font-sans placeholder:normal-case",
            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
          )}
        />
        <button
          type="button"
          onClick={() => void check()}
          disabled={disabled || busy || code.trim() === ""}
          className={cn(
            "border-border/60 hover:bg-muted/40 h-9 shrink-0 rounded-lg border px-4 text-sm font-medium",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Apply"}
        </button>
      </div>

      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
