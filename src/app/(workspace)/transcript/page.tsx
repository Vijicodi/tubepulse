import Link from "next/link";
import { ArrowUpRight, ChevronRight, ExternalLink, FileText, Lock } from "lucide-react";
import { EmptyState, PanelBadge, WorkspacePanel } from "@/components/workspace/panel";
import { TranscriptForm } from "@/components/workspace/transcript-form";
import { ComingSoon } from "@/components/workspace/coming-soon";
import { Button } from "@/components/ui/button";
import { isTranscriptConfigured } from "@/lib/env";
import { PLANS } from "@/lib/billing/plans";
import { getBillingState } from "@/lib/billing/store";
import { getCurrentProject } from "@/lib/projects/current";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Extract transcript — TubePulse" };

function compactWords(count: number): string {
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(count);
}

export default async function TranscriptPage() {
  // Blank actor means the feature cannot work. Say so plainly rather than
  // rendering a button that fails on press — the same honesty the billing page
  // owes when a Razorpay key is missing.
  if (!isTranscriptConfigured()) {
    return (
      <WorkspacePanel
        title="Extract transcript"
        description="Pull the spoken-word transcript from any public video."
      >
        {/*
          NAME THE VALUE, and do not name the wrong FILE. `blockedBy` said "in
          .env.local", which is right on a dev machine and wrong everywhere
          else — in production the variable lives in Vercel and there is no such
          file. It also never said WHAT to set it to, so the only source for the
          actor id was a comment inside client.ts.
        */}
        <ComingSoon
          icon={FileText}
          heading="Transcripts are not switched on"
          what="Pastes one public YouTube video URL and pulls its spoken-word transcript, using auto-generated captions where the creator has not supplied their own — then summarises it in a few lines."
          blockedBy="Set APIFY_TRANSCRIPT_ACTOR to supreme_coder/youtube-transcript-scraper — in .env.local for local dev, or in the Vercel project settings for production. See docs/deploy.md."
        >
          <Button disabled className="bg-brand-gradient h-11 text-white">
            Extract transcript
          </Button>
        </ComingSoon>
      </WorkspacePanel>
    );
  }

  /*
   * Gate up front, like the hook library. Free users used to get the full
   * form, paste a link, press the button and only then hear "Transcripts are
   * on the paid plans" in a toast that vanished after four seconds.
   */
  const billing = await getBillingState();
  if (!PLANS[billing.planKey].features.transcripts) {
    const creator = PLANS.creator;
    return (
      <WorkspacePanel
        title="Extract transcript"
        description="Paste one public video. You get its words, and a few lines saying what it covers."
        badge={<PanelBadge>{creator.name}</PanelBadge>}
      >
        <EmptyState>
          <span className="flex flex-col items-center gap-3">
            <Lock className="text-muted-foreground/60 size-5" aria-hidden />
            <span>
              Transcripts pull the words from any public video and summarise
              them in a few lines. They start on {creator.name}; you are on{" "}
              {PLANS[billing.planKey].name}.
            </span>
            <Link
              href="/billing"
              className="text-foreground inline-flex items-center gap-1 underline underline-offset-4"
            >
              See {creator.name}
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </span>
        </EmptyState>
      </WorkspacePanel>
    );
  }

  const project = await getCurrentProject();
  const supabase = await createServerClient();

  const [{ data: transcripts }, { data: runningJob }] = await Promise.all([
    supabase
      .from("transcripts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
    // Resume the card if an extraction was left running when the page closed.
    supabase
      .from("jobs")
      .select("id")
      .eq("kind", "transcript")
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const rows = transcripts ?? [];

  return (
    <WorkspacePanel
      title="Extract transcript"
      description="Paste one public video. You get its words, and a few lines saying what it covers."
      badge={<PanelBadge>Captions + summary</PanelBadge>}
    >
      <div className="flex flex-col gap-8">
        <div className="surface-raised rounded-2xl p-6">
          <TranscriptForm
            projectId={project?.id ?? null}
            activeJobId={runningJob?.id ?? null}
          />
          <p className="text-muted-foreground mt-3 text-xs">
            Uses auto-generated captions where the creator has not supplied their
            own. Costs one scrape.
          </p>
        </div>

        {rows.length === 0 ? (
          <EmptyState>
            No transcripts yet. Paste a video above — a ten-minute video is
            usually ready in under a minute.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((row) => (
              <article key={row.id} className="surface-raised rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold tracking-tight">
                      {row.title ?? row.video_id}
                    </h3>
                    <p className="text-muted-foreground mt-0.5 font-mono text-[0.62rem] tracking-[0.14em] uppercase">
                      {compactWords(row.word_count)} words
                      {row.language ? ` · ${row.language}` : ""}
                    </p>
                  </div>
                  <a
                    href={row.video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 text-xs underline underline-offset-2"
                  >
                    Watch
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                </div>

                {row.summary ? (
                  <pre className="bg-muted/25 text-foreground mt-4 overflow-x-auto rounded-lg p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap">
                    {row.summary}
                  </pre>
                ) : (
                  <p className="text-muted-foreground mt-4 text-sm">
                    The summary could not be generated for this one. The full
                    transcript below is unaffected.
                  </p>
                )}

                <details className="group border-border/50 mt-4 border-t pt-3">
                  <summary className="text-muted-foreground hover:text-foreground marker:content-none flex cursor-pointer list-none items-center gap-2 font-mono text-[0.6rem] tracking-[0.16em] uppercase transition-colors">
                    <ChevronRight
                      aria-hidden
                      className="size-3.5 transition-transform duration-200 group-open:rotate-90"
                    />
                    Full transcript
                  </summary>
                  <p className="text-muted-foreground mt-3 max-h-96 overflow-y-auto text-sm leading-relaxed">
                    {row.text}
                  </p>
                </details>
              </article>
            ))}
          </div>
        )}
      </div>
    </WorkspacePanel>
  );
}
