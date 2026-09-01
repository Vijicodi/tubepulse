"use client";

import { useState } from "react";
import { Camera, Loader2, MonitorPlay, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JobStatusCard } from "./job-status";
import { platformFromInput, type Platform } from "@/lib/platform/parse";
import { VoiceResearch } from "./voice-research";

/**
 * The whole input surface of the product: one field.
 *
 * Submitting returns in well under a second with a job id — it does not wait
 * for the scrape, which takes minutes. <JobStatusCard /> then takes over the
 * reporting via realtime plus a polling fallback.
 */
/**
 * Generic icons, not brand marks. `lucide-react` v1 removed every brand icon —
 * there is no Youtube and no Instagram export, and reaching for one breaks the
 * build. See the trap in AGENTS.md.
 */
const PLATFORMS = [
  { value: "youtube" as const, label: "YouTube", icon: MonitorPlay },
  { value: "instagram" as const, label: "Instagram", icon: Camera },
];

export function ResearchForm({
  projectId,
  activeJobId,
  voiceEnabled = false,
}: {
  projectId: string;
  activeJobId?: string | null;
  /**
   * Whether this plan includes voice. Passed from a server component that read
   * the plan, so this client component never decides entitlement itself.
   */
  voiceEnabled?: boolean;
}) {
  const [channel, setChannel] = useState("");
  const [platform, setPlatform] = useState<Platform>("youtube");
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(activeJobId ?? null);

  // What the box should say. A pasted URL decides the platform on its own, so
  // the placeholder follows the URL rather than the toggle — otherwise it would
  // contradict what is about to happen.
  const effective = platformFromInput(channel) ?? platform;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await research(channel, platform);
  }

  /**
   * The ONE path that spends a run.
   *
   * Both the typed form and the voice agent land here, so there is a single
   * place where money is committed — and every quota check the research route
   * makes applies identically whichever way the request arrived.
   */
  async function research(target: string, forPlatform: Platform) {
    if (target.trim() === "" || submitting) return;

    setSubmitting(true);
    setJobId(null);

    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: target, projectId, platform: forPlatform }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error ?? "Could not start the research.");
        return;
      }

      setJobId(data.jobId);
      setChannel("");
      toast.success(
        data.platform === "instagram"
          ? `Researching ${data.handle} on Instagram.`
          : `Researching ${data.handle}. This takes a few minutes.`,
      );
    } catch {
      toast.error("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/*
        The spoken path sits ABOVE the typed one, because it is the one that
        works when you do not already know whose channel to paste — which is
        the harder half of the job, and the reason this feature exists.
      */}
      <VoiceResearch
        enabled={voiceEnabled}
        busy={submitting}
        onResearch={(target, forPlatform) => {
          // Fill the box too, so what is about to be researched is visible
          // rather than something that just happened to you.
          setChannel(target);
          setPlatform(forPlatform);
          void research(target, forPlatform);
        }}
      />

      <div
        role="radiogroup"
        aria-label="Platform"
        className="border-border/60 inline-flex w-fit rounded-lg border p-0.5"
      >
        {PLATFORMS.map((option) => {
          const selected = effective === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPlatform(option.value)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors ${
                selected
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <option.icon className="size-3.5" aria-hidden />
              {option.label}
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={channel}
          onChange={(event) => setChannel(event.target.value)}
          placeholder={
            effective === "instagram"
              ? "@nasa, or paste a profile URL"
              : "@mkbhd, or paste a channel URL"
          }
          aria-label={
            effective === "instagram"
              ? "Instagram handle or profile URL"
              : "YouTube channel handle or URL"
          }
          disabled={submitting}
          className="h-11 flex-1"
        />
        <Button
          type="submit"
          disabled={submitting || channel.trim() === ""}
          className="bg-brand-gradient h-11 text-white"
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Starting
            </>
          ) : (
            <>
              <Search aria-hidden />
              Research
            </>
          )}
        </Button>
      </form>

      {jobId && <JobStatusCard jobId={jobId} />}
    </div>
  );
}
