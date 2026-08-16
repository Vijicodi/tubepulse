"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JobStatus } from "@/components/job-status";
import { isSupabaseConfigured } from "@/lib/public-env";

/**
 * The entire input surface of the product: one field.
 *
 * On submit this returns in well under a second with a job id — it does not
 * wait for the scrape. <JobStatus /> then watches the job row over Supabase
 * realtime and takes over the reporting.
 */
export function ResearchForm() {
  const router = useRouter();
  const [channel, setChannel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<{ id: string; channelId: string } | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (channel.trim() === "" || submitting) return;

    setSubmitting(true);
    setJob(null);

    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error ?? "Could not start the research.");
        return;
      }

      setJob({ id: data.jobId, channelId: data.channelId });
      toast.success(`Researching ${data.handle}. This takes a few minutes.`);
    } catch {
      toast.error("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3 sm:flex-row">
        <Input
          value={channel}
          onChange={(event) => setChannel(event.target.value)}
          placeholder="@mkbhd, or paste a channel URL"
          aria-label="YouTube channel handle or URL"
          disabled={submitting}
          className="h-12 flex-1 text-base"
        />
        <Button type="submit" size="lg" disabled={submitting || channel.trim() === ""} className="h-12">
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

      {!isSupabaseConfigured && (
        <p className="text-muted-foreground text-sm">
          Supabase is not configured yet, so this form cannot save anything. Copy{" "}
          <code className="font-mono text-xs">.env.example</code> to{" "}
          <code className="font-mono text-xs">.env.local</code> and fill it in.
        </p>
      )}

      {job && (
        <JobStatus
          jobId={job.id}
          onSucceeded={() => router.push(`/channels/${job.channelId}`)}
        />
      )}
    </div>
  );
}
