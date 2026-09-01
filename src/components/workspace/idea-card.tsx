import { ChevronRight, ExternalLink } from "lucide-react";
import { SaveIdeaButton } from "./save-idea-button";
import type { IdeaRow } from "@/lib/supabase/types";

/**
 * One idea, with its working shown.
 *
 * THE EVIDENCE IS NOT DECORATION. The product's whole claim is "here is why",
 * so the videos an idea was drawn from are rendered as links you can open and
 * check — an idea whose evidence has since been deleted says so rather than
 * quietly appearing unsupported.
 *
 * Confidence is printed as the model reported it, low numbers included. An
 * honest 40 is more useful than an inflated 90, and rounding the bad ones out
 * of sight would make the number decorative.
 */

export interface EvidenceVideo {
  videoId: string;
  title: string;
  url: string;
  /** Views ÷ this channel's own median. Null if it was never scored. */
  score: number | null;
}

function ConfidenceMeter({ value }: { value: number }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div
        className="bg-muted h-1.5 w-16 overflow-hidden rounded-full"
        role="img"
        aria-label={`Confidence ${value} out of 100`}
      >
        <div
          className="bg-brand-gradient h-full rounded-full"
          style={{ width: `${Math.max(value, 2)}%` }}
        />
      </div>
      <span className="text-muted-foreground font-mono text-xs tabular-nums">
        {value}
      </span>
    </div>
  );
}

export function IdeaCard({
  idea,
  evidence,
  channelName,
}: {
  idea: IdeaRow;
  /** Resolved from `idea.evidence_video_ids`, in the order the model cited them. */
  evidence: EvidenceVideo[];
  /** Shown only on Saved ideas, where cards from several channels sit together. */
  channelName?: string;
}) {
  return (
    <article className="surface-raised rounded-xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {channelName && (
            <p className="text-muted-foreground mb-1 font-mono text-[0.62rem] tracking-[0.14em] uppercase">
              {channelName}
            </p>
          )}
          <h3 className="font-semibold tracking-tight text-pretty">{idea.title}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ConfidenceMeter value={idea.confidence} />
          <SaveIdeaButton ideaId={idea.id} saved={idea.saved_at !== null} />
        </div>
      </div>

      <p className="mt-3 text-sm">{idea.angle}</p>

      <p className="text-muted-foreground mt-2 text-sm">{idea.reasoning}</p>

      {idea.script && (
        // A native <details>, not React state: the card is a server component
        // and a disclosure triangle is not worth shipping JavaScript for. It
        // also means the script is inside the page for Ctrl+F and for print
        // even while collapsed.
        <details className="group border-border/50 mt-4 border-t pt-3">
          <summary className="text-muted-foreground hover:text-foreground marker:content-none flex cursor-pointer list-none items-center gap-2 font-mono text-[0.6rem] tracking-[0.16em] uppercase transition-colors">
            <ChevronRight
              aria-hidden
              className="size-3.5 transition-transform duration-200 group-open:rotate-90"
            />
            Beat sheet
          </summary>

          <pre className="bg-muted/25 text-foreground mt-3 overflow-x-auto rounded-lg p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap">
            {idea.script}
          </pre>
        </details>
      )}

      {/*
        TITLE VARIANTS and THUMBNAIL CONCEPTS — paid-tier extras.
        Both render only when present. Absent is a legitimate state, not a gap:
        Scout gets neither, and an idea generated before these existed has
        neither either. Nothing here says "upgrade for this" — a card is not
        the place to sell, and an empty labelled box reads as a broken feature.
      */}
      {idea.title_variants && idea.title_variants.length > 0 && (
        <details className="group border-border/50 mt-4 border-t pt-3">
          <summary className="text-muted-foreground hover:text-foreground marker:content-none flex cursor-pointer list-none items-center gap-2 font-mono text-[0.6rem] tracking-[0.16em] uppercase transition-colors">
            <ChevronRight
              aria-hidden
              className="size-3.5 transition-transform duration-200 group-open:rotate-90"
            />
            {idea.title_variants.length} other titles
          </summary>

          <ul className="mt-3 space-y-2">
            {idea.title_variants.map((variant) => (
              <li
                key={variant}
                className="bg-muted/25 rounded-lg px-4 py-2.5 text-sm text-pretty"
              >
                {variant}
              </li>
            ))}
          </ul>
        </details>
      )}

      {idea.thumbnail_concepts && idea.thumbnail_concepts.length > 0 && (
        <details className="group border-border/50 mt-4 border-t pt-3">
          <summary className="text-muted-foreground hover:text-foreground marker:content-none flex cursor-pointer list-none items-center gap-2 font-mono text-[0.6rem] tracking-[0.16em] uppercase transition-colors">
            <ChevronRight
              aria-hidden
              className="size-3.5 transition-transform duration-200 group-open:rotate-90"
            />
            Thumbnail concepts
          </summary>

          <ul className="mt-3 space-y-2">
            {idea.thumbnail_concepts.map((concept) => (
              <li key={concept.text} className="bg-muted/25 rounded-lg px-4 py-3">
                {/*
                  The overlay text is set in the display face and sized up,
                  because that is what it will be: a few words read at a glance.
                  Showing it at body size misrepresents the thing being judged.
                */}
                <p className="font-display text-base leading-tight tracking-tight">
                  {concept.text}
                </p>
                <p className="text-muted-foreground mt-1.5 text-sm">{concept.visual}</p>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="border-border/50 mt-4 border-t pt-3">
        <p className="text-muted-foreground font-mono text-[0.6rem] tracking-[0.16em] uppercase">
          Drawn from
        </p>

        {evidence.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-xs">
            The videos behind this idea are no longer stored. Re-research the
            channel to restore them.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {evidence.map((video) => (
              <li key={video.videoId} className="flex items-baseline gap-2 text-xs">
                <span className="text-muted-foreground shrink-0 font-mono tabular-nums">
                  {video.score === null ? "—" : `${video.score.toFixed(1)}\u00d7`}
                </span>
                <a
                  href={video.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground text-muted-foreground inline-flex min-w-0 items-center gap-1 underline underline-offset-2"
                >
                  <span className="truncate">{video.title}</span>
                  <ExternalLink className="size-3 shrink-0" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
