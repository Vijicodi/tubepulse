"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/client";
import type { JobStatus as Status } from "@/lib/supabase/types";

/**
 * The live job card.
 *
 * This is the payoff for the async design: the scrape takes minutes, but the
 * user watches a row change rather than a request hang. No polling loop, no
 * "check again in 5 seconds" — Supabase pushes the update when the webhook
 * writes it.
 *
 * The progress bar is deliberately honest: it is an elapsed-time estimate
 * against a typical run, not real progress. Apify does not report percentages,
 * and inventing one would be a lie the UI tells.
 */

const TYPICAL_RUN_SECONDS = 210;

export function JobStatus({
  jobId,
  onSucceeded,
}: {
  jobId: string;
  onSucceeded?: () => void;
}) {
  const [status, setStatus] = useState<Status>("queued");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Elapsed-time ticker, purely for the estimate bar.
  useEffect(() => {
    if (status === "succeeded" || status === "failed") return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    const supabase = createClient();

    // Read once on mount: the job may already have finished before we subscribed.
    void supabase
      .from("jobs")
      .select("status, error")
      .eq("id", jobId)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setStatus(data.status);
        setError(data.error);
        if (data.status === "succeeded") onSucceeded?.();
      });

    const channel = supabase
      .channel(`job:${jobId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${jobId}` },
        (payload) => {
          const next = payload.new as { status: Status; error: string | null };
          setStatus(next.status);
          setError(next.error);
          if (next.status === "succeeded") onSucceeded?.();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // onSucceeded is intentionally excluded: callers pass an inline closure and
    // re-subscribing on every render would drop realtime events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const percent = Math.min(Math.round((elapsed / TYPICAL_RUN_SECONDS) * 100), 95);

  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-4">
        <Icon status={status} />
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium">{label(status)}</p>

          {status === "failed" && error && (
            <p className="text-destructive text-sm">{error}</p>
          )}

          {(status === "queued" || status === "running") && (
            <>
              <Progress value={percent} aria-label="Estimated progress" />
              <p className="text-muted-foreground font-mono text-xs">
                {formatElapsed(elapsed)} elapsed · usually 2–6 minutes · safe to leave this page
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Icon({ status }: { status: Status }) {
  if (status === "succeeded")
    return <CheckCircle2 className="text-secondary mt-0.5 size-5 shrink-0" aria-hidden />;
  if (status === "failed")
    return <AlertCircle className="text-destructive mt-0.5 size-5 shrink-0" aria-hidden />;
  return <Loader2 className="text-primary mt-0.5 size-5 shrink-0 animate-spin" aria-hidden />;
}

function label(status: Status): string {
  switch (status) {
    case "queued":
      return "Queued — waiting for a scraper slot";
    case "running":
      return "Reading the channel's videos";
    case "succeeded":
      return "Done. Opening the channel.";
    case "failed":
      return "That didn't work";
  }
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
