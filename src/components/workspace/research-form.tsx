"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JobStatusCard } from "./job-status";

/**
 * The whole input surface of the product: one field.
 *
 * Submitting returns in well under a second with a job id — it does not wait
 * for the scrape, which takes minutes. <JobStatusCard /> then takes over the
 * reporting via realtime plus a polling fallback.
 */
export function ResearchForm({
  projectId,
  activeJobId,
}: {
  projectId: string;
  activeJobId?: string | null;
}) {
  const [channel, setChannel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(activeJobId ?? null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (channel.trim() === "" || submitting) return;

    setSubmitting(true);
    setJobId(null);

    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, projectId }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error ?? "Could not start the research.");
        return;
      }

      setJobId(data.jobId);
      setChannel("");
      toast.success(`Researching ${data.handle}. This takes a few minutes.`);
    } catch {
      toast.error("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={channel}
          onChange={(event) => setChannel(event.target.value)}
          placeholder="@mkbhd, or paste a channel URL"
          aria-label="YouTube channel handle or URL"
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
