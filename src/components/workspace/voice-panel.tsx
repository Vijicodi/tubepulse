"use client";

import { useState } from "react";
import { ArrowUp, Mic, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The voice agent panel.
 *
 * The orb is the visual centre of the product, so it gets the depth work: three
 * stacked layers (an outer bloom, the ring that ripples, and the button itself
 * with an inner highlight) which together read as a lit sphere rather than a
 * flat circle.
 *
 * Voice is not wired up yet — that arrives with the OpenAI Realtime session in
 * a later feature. Until then the mic states it plainly instead of pretending:
 * a control that looks live and does nothing is worse than one that says
 * "coming soon".
 */
export function VoicePanel() {
  const [draft, setDraft] = useState("");

  return (
    <section
      aria-label="Growth agent"
      className="surface-raised flex min-h-0 flex-col overflow-hidden rounded-2xl"
    >
      {/* Header */}
      <header className="flex items-start justify-between border-b px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Growth agent</h2>
            <span
              className="size-1.5 rounded-full bg-[var(--brand-2)]"
              aria-hidden
            />
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">Ready when you are</p>
        </div>
        <Sparkles className="size-4 text-[var(--brand-2)]" aria-hidden />
      </header>

      {/* Orb */}
      <div className="flex flex-col items-center gap-3 px-6 py-10">
        <div className="relative grid place-items-center">
          {/* Outer bloom — the light the sphere casts. */}
          <span
            aria-hidden
            className="absolute size-40 rounded-full blur-2xl"
            style={{ background: "var(--brand-gradient)", opacity: 0.32 }}
          />
          {/* Ripple ring — will animate continuously once the agent listens. */}
          <span
            aria-hidden
            className="absolute size-28 rounded-full border"
            style={{ borderColor: "color-mix(in oklab, var(--brand-2) 45%, transparent)" }}
          />
          <button
            type="button"
            disabled
            aria-label="Voice input — coming soon"
            className="bg-brand-gradient relative grid size-24 cursor-not-allowed place-items-center rounded-full text-white opacity-90 shadow-2xl"
          >
            {/* Inner highlight, top-left, so the sphere reads as lit. */}
            <span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "radial-gradient(70% 60% at 32% 26%, rgb(255 255 255 / 0.45) 0%, transparent 62%)",
              }}
            />
            <Mic className="relative size-8" aria-hidden />
          </button>
        </div>

        <p className="text-sm font-medium">Voice arrives next</p>
        <p className="text-muted-foreground max-w-[15rem] text-center text-xs">
          Tap-to-talk switches on once the OpenAI key is added. Type below in the
          meantime.
        </p>
      </div>

      {/* Transcript */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        <div className="bg-muted/50 max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm">
          Tell me what you want to learn about your niche. I can research
          competitors, find outliers, and shape evidence-backed ideas.
        </div>
      </div>

      {/* Composer */}
      <div className="border-t p-3">
        <div
          className={cn(
            "bg-background/60 flex items-center gap-2 rounded-full border py-1 pr-1 pl-4 transition-colors",
            "focus-within:border-[var(--brand-2)]",
          )}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Or type a message…"
            aria-label="Message the growth agent"
            disabled
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent py-2 text-sm outline-none disabled:cursor-not-allowed"
          />
          <Button
            size="icon"
            disabled
            aria-label="Send message"
            className="bg-brand-gradient size-9 shrink-0 rounded-full text-white"
          >
            <ArrowUp className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </section>
  );
}
