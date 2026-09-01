"use client";

import { useState } from "react";
import { ArrowRight, Check, Loader2, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useVoiceInput } from "./use-voice-input";

/**
 * Say a niche, get something researchable.
 *
 * The competitor's headline is "say the niche, get ideas that cite their
 * sources". This is that path: speak, the agent works out what you meant, and
 * either asks one question or hands back real accounts to pick from.
 *
 * ---------------------------------------------------------------------------
 * IT NEVER SCRAPES ON ITS OWN. Picking a candidate calls the SAME research
 * endpoint the typed form calls, with all of its quota checks. A misheard
 * request costs a moment rather than a run, and there is exactly one path that
 * spends money — which is the one that can be reasoned about.
 * ---------------------------------------------------------------------------
 * THE STEPS ARE SHOWN AS THEY LAND, because a minute of silence looks like a
 * frozen screen. That is the second half of what makes their version feel
 * alive, and it costs nothing but saying what is already happening.
 */

interface Candidate {
  handle: string;
  name: string;
  why: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "thinking"; steps: string[] }
  | { kind: "question"; question: string; niche: string | null; steps: string[] }
  | {
      kind: "candidates";
      niche: string;
      platform: "youtube" | "instagram";
      candidates: Candidate[];
      steps: string[];
    }
  | { kind: "error"; message: string };

export function VoiceResearch({
  enabled,
  onResearch,
  busy = false,
}: {
  /** Whether this plan includes voice. False renders nothing. */
  enabled: boolean;
  /** Hand a chosen handle to the existing research flow. */
  onResearch: (channel: string, platform: "youtube" | "instagram") => void;
  busy?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const voice = useVoiceInput({
    enabled,
    onText: (text) => void ask(text),
  });

  async function ask(request: string, platform?: "youtube" | "instagram") {
    setPhase({ kind: "thinking", steps: ["Working out what you asked for"] });

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request, platform }),
      });

      const data = await response.json();

      if (!response.ok) {
        setPhase({ kind: "error", message: data.error ?? "That did not work." });
        return;
      }

      const steps: string[] = (data.trail ?? []).map(
        (entry: { detail: string }) => entry.detail,
      );

      // A named channel goes straight through — they already did the hard part.
      if (data.kind === "channel") {
        setPhase({ kind: "idle" });
        onResearch(data.channel, data.platform);
        return;
      }

      if (data.kind === "question") {
        setPhase({ kind: "question", question: data.question, niche: data.niche, steps });
        return;
      }

      if (data.kind === "candidates") {
        setPhase({
          kind: "candidates",
          niche: data.niche,
          platform: data.platform,
          candidates: data.candidates,
          steps,
        });
        return;
      }

      setPhase({ kind: "error", message: "That did not work." });
    } catch {
      setPhase({ kind: "error", message: "Could not reach the research agent." });
    }
  }

  if (!voice.available) return null;

  return (
    <div className="border-border/60 space-y-4 rounded-xl border border-dashed p-5">
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={voice.recording ? voice.stop : () => void voice.start()}
          disabled={busy || voice.busy || phase.kind === "thinking"}
          aria-label={voice.recording ? "Stop recording" : "Say what to research"}
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-full border transition-colors",
            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-50",
            voice.recording
              ? "border-destructive bg-destructive/10 text-destructive"
              : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40",
          )}
        >
          {voice.busy || phase.kind === "thinking" ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : voice.recording ? (
            <Square className="size-4 fill-current" aria-hidden />
          ) : (
            <Mic className="size-5" aria-hidden />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {voice.recording
              ? `Listening… ${voice.seconds}s`
              : voice.busy
                ? "Making that out…"
                : phase.kind === "thinking"
                  ? "Working on it…"
                  : "Say what you want researched"}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {/*
              An example rather than an instruction. "Describe a niche" tells
              someone the shape of an answer; a sentence they could say tells
              them the answer.
            */}
            A niche — &ldquo;fitness for beginners over forty&rdquo; — or a
            channel you already have in mind.
          </p>

          {voice.error && (
            <p className="text-muted-foreground mt-2 text-xs" role="alert">
              {voice.error}
            </p>
          )}
        </div>
      </div>

      {/* --------------------------------------------------- what it did */}
      {"steps" in phase && phase.steps.length > 0 && (
        <ol className="border-border/50 space-y-1.5 border-t pt-3">
          {phase.steps.map((step, index) => (
            <li key={index} className="text-muted-foreground flex items-baseline gap-2 text-sm">
              <Check className="size-3.5 shrink-0 text-[var(--brand-2)]" aria-hidden />
              {step}
            </li>
          ))}
        </ol>
      )}

      {/* ------------------------------------------------- one question */}
      {phase.kind === "question" && (
        <div className="border-border/50 border-t pt-4">
          <p className="text-sm font-medium">{phase.question}</p>

          {/*
            Buttons, not a text box. The question is nearly always about
            platform, and two taps beat making someone type an answer they have
            already been offered.
          */}
          <div className="mt-3 flex flex-wrap gap-2">
            {(["youtube", "instagram"] as const).map((option) => (
              <Button
                key={option}
                type="button"
                variant="outline"
                size="sm"
                disabled={!phase.niche}
                onClick={() => phase.niche && void ask(phase.niche, option)}
              >
                {option === "youtube" ? "YouTube" : "Instagram"}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* -------------------------------------------------- the shortlist */}
      {phase.kind === "candidates" && (
        <div className="border-border/50 border-t pt-4">
          <p className="text-muted-foreground text-sm">
            Accounts worth studying for{" "}
            <span className="text-foreground">{phase.niche}</span>. Pick one to
            research — that is the part that spends a run.
          </p>

          <ul className="mt-3 space-y-2">
            {phase.candidates.map((candidate) => (
              <li key={candidate.handle}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onResearch(candidate.handle, phase.platform)}
                  className={cn(
                    "border-border/60 hover:bg-muted/40 group flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {candidate.name}
                      <span className="text-muted-foreground ml-2 font-mono text-xs">
                        @{candidate.handle}
                      </span>
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-sm">{candidate.why}</p>
                  </div>
                  <ArrowRight
                    className="text-muted-foreground group-hover:text-foreground mt-1 size-4 shrink-0 transition-colors"
                    aria-hidden
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {phase.kind === "error" && (
        <p className="text-muted-foreground border-border/50 border-t pt-4 text-sm" role="alert">
          {phase.message}
        </p>
      )}
    </div>
  );
}
