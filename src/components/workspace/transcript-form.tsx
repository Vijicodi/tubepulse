"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JobStatusCard } from "./job-status";

/**
 * Paste a video URL, get its transcript.
 *
 * Same shape as the research form and deliberately so: it returns a job id in
 * under a second and hands the reporting to <JobStatusCard />, which watches
 * the row over realtime with a polling fallback. Nothing here waits.
 */
export function TranscriptForm({
  projectId,
  activeJobId,
}: {
  projectId: string | null;
  activeJobId?: string | null;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(activeJobId ?? null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (url.trim() === "" || submitting) return;

    setSubmitting(true);
    setJobId(null);

    try {
      const response = await fetch("/api/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: url, projectId }),
      });

      const data = await response.json();

      if (!response.ok) {
        // 402 means buy something; 429 means wait. Only one of them has an
        // action worth offering.
        if (response.status === 402) {
          toast.error(data.error ?? "You are out of scrapes.", {
            action: { label: "Billing", onClick: () => router.push("/billing") },
          });
        } else {
          toast.error(data.error ?? "Could not start the transcript.");
        }
        return;
      }

      setJobId(data.jobId);
      setUrl("");
      toast.success("Pulling the captions. This is usually quick.");
    } catch {
      toast.error("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="video-url" className="text-xs">
            YouTube video URL
          </Label>
          <Input
            id="video-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            disabled={submitting}
            className="h-11"
          />
        </div>
        <Button
          type="submit"
          disabled={submitting || url.trim() === ""}
          className="bg-brand-gradient h-11 text-white"
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Starting
            </>
          ) : (
            <>
              <FileText aria-hidden />
              Extract transcript
            </>
          )}
        </Button>
      </form>

      {jobId && <JobStatusCard jobId={jobId} />}
    </div>
  );
}
