"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/client";
import type { JobStatus as Status } from "@/lib/supabase/types";

/**
 * The live job card.
 *
 * Two independent ways of learning that the scrape finished, because either one
 * alone leaves a hole:
 *
 *   1. Supabase realtime — instant, but only fires if the webhook wrote the row,
 *      which needs a publicly reachable URL
 *   2. Polling /api/jobs/[id]/sync every 12s — works on localhost with no tunnel
 *
 * Both are idempotent, so whichever arrives first wins and the other is a no-op.
 * Without the poll, the very first local scrape would appear to hang forever.
 *
 * The progress bar is deliberately honest: it is an elapsed-time estimate
 * against a typical run, not real progress. Apify does not report percentages,
 * and inventing one would be a lie the UI tells.
 */

const TYPICAL_RUN_SECONDS = 210;
const POLL_INTERVAL_MS = 12_000;

export function JobStatusCard({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("queued");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const settled = useRef(false);

  const finish = (next: Status, message: string | null) => {
    setStatus(next);
    setError(message);
    if (!settled.current && (next === "succeeded" || next === "failed")) {
      settled.current = true;
      router.refresh();
    }
  };

  // Elapsed-time ticker, purely for the estimate bar.
  useEffect(() => {
    if (status === "succeeded" || status === "failed") return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  // Path 1: realtime.
  useEffect(() => {
    const supabase = createClient();

    void supabase
      .from("jobs")
      .select("status, error")
      .eq("id", jobId)
      .single()
      .then(({ data }) => {
        if (data) finish(data.status, data.error);
      });

    const channel = supabase
      .channel(`job:${jobId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${jobId}` },
        (payload) => {
          const next = payload.new as { status: Status; error: string | null };
          finish(next.status, next.error);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Path 2: polling fallback.
  useEffect(() => {
    if (status === "succeeded" || status === "failed") return;

    const poll = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}/sync`, { method: "POST" });
        const data = await response.json();
        if (data.status === "succeeded" || data.status === "failed") {
          finish(data.status, data.error ?? null);
        }
      } catch {
        // Network blip. The next tick tries again.
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, status]);

  const percent = Math.min(Math.round((elapsed / TYPICAL_RUN_SECONDS) * 100), 95);

  return (
    <div className="surface-raised flex items-start gap-3 rounded-xl p-4">
      <Icon status={status} />

      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium">{label(status)}</p>

        {status === "failed" && error && (
          <p className="text-destructive text-sm">{error}</p>
        )}

        {(status === "queued" || status === "running") && (
          <>
            <Progress value={percent} aria-label="Estimated progress" />
            <p className="text-muted-foreground font-mono text-xs">
              {formatElapsed(elapsed)} elapsed · usually 2–6 minutes · safe to leave
              this page
            </p>
          </>
        )}

        {status === "succeeded" && (
          <p className="text-muted-foreground text-xs">
            Videos are in. Open Outliers to see what beat their own average.
          </p>
        )}
      </div>
    </div>
  );
}

function Icon({ status }: { status: Status }) {
  if (status === "succeeded")
    return <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--brand-2)]" aria-hidden />;
  if (status === "failed")
    return <AlertCircle className="text-destructive mt-0.5 size-5 shrink-0" aria-hidden />;
  return (
    <Loader2
      className="mt-0.5 size-5 shrink-0 animate-spin text-[var(--brand-2)]"
      aria-hidden
    />
  );
}

function label(status: Status): string {
  switch (status) {
    case "queued":
      return "Queued — waiting for a scraper slot";
    case "running":
      return "Reading the channel's videos";
    case "succeeded":
      return "Done";
    case "failed":
      return "That didn't work";
  }
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
