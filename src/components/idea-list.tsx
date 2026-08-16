import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { IdeaRow } from "@/lib/supabase/types";

/**
 * Ideas, each with its evidence.
 *
 * Confidence is shown as the model reported it, including low numbers. An
 * honest 40 is more useful than an inflated 90 — the prompt asks for that and
 * the UI must not hide it.
 */
export function IdeaList({ ideas }: { ideas: IdeaRow[] }) {
  if (ideas.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        No ideas yet. Generate them once the channel has been researched.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {ideas.map((idea) => (
        <Card key={idea.id}>
          <CardContent className="space-y-3 py-5">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-lg leading-snug font-semibold text-balance">{idea.title}</h3>
              <Badge variant={confidenceVariant(idea.confidence)} className="shrink-0 font-mono">
                {idea.confidence}
              </Badge>
            </div>

            <p className="text-sm">{idea.angle}</p>

            <p className="text-muted-foreground border-l-2 pl-3 text-sm">{idea.reasoning}</p>

            {idea.evidence_video_ids.length > 0 && (
              <p className="text-muted-foreground font-mono text-xs">
                Evidence:{" "}
                {idea.evidence_video_ids.map((videoId, index) => (
                  <span key={videoId}>
                    {index > 0 && ", "}
                    <a
                      href={`https://www.youtube.com/watch?v=${videoId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-foreground underline underline-offset-2"
                    >
                      {videoId}
                    </a>
                  </span>
                ))}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function confidenceVariant(confidence: number) {
  if (confidence >= 70) return "default" as const;
  if (confidence >= 45) return "secondary" as const;
  return "outline" as const;
}
