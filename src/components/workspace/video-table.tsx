import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { VideoRow } from "@/lib/supabase/types";

/**
 * Videos ranked by outlier score.
 *
 * The score is encoded as a coloured band as well as a number, because this
 * table is scanned rather than read — a breakout should be visible without
 * parsing a single digit.
 */
export function VideoTable({
  videos,
  channelNames,
}: {
  videos: VideoRow[];
  channelNames?: Record<string, string>;
}) {
  return (
    <div className="surface-raised overflow-x-auto rounded-xl">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="min-w-[260px]">Video</TableHead>
            {channelNames && <TableHead className="min-w-[120px]">Channel</TableHead>}
            <TableHead className="text-right">Views</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead className="text-right">Views/day</TableHead>
            <TableHead className="text-right">Published</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {videos.map((video) => (
            <TableRow key={video.id}>
              <TableCell className="max-w-[380px]">
                <a
                  href={video.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-start gap-1.5 font-medium transition-colors hover:text-[var(--brand-2)]"
                >
                  <span className="line-clamp-2">{video.title}</span>
                  <ExternalLink className="mt-1 size-3 shrink-0 opacity-50" aria-hidden />
                </a>
              </TableCell>

              {channelNames && (
                <TableCell className="text-muted-foreground truncate text-sm">
                  {channelNames[video.channel_id] ?? "—"}
                </TableCell>
              )}

              <TableCell className="text-right font-mono tabular-nums">
                {Number(video.view_count).toLocaleString()}
              </TableCell>
              <TableCell className="text-right">
                <ScoreBadge score={video.outlier_score} />
              </TableCell>
              <TableCell className="text-muted-foreground text-right font-mono tabular-nums">
                {video.velocity === null
                  ? "—"
                  : Math.round(Number(video.velocity)).toLocaleString()}
              </TableCell>
              <TableCell className="text-muted-foreground text-right font-mono text-xs whitespace-nowrap">
                {new Date(video.published_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted-foreground">—</span>;

  const value = Number(score);

  // A breakout gets the brand gradient; everything else stays quiet so the
  // gradient means something.
  if (value >= 3) {
    return (
      <span className="bg-brand-gradient inline-flex rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-white">
        {value.toFixed(1)}×
      </span>
    );
  }

  return (
    <Badge
      variant={value >= 1.5 ? "secondary" : "outline"}
      className="font-mono tabular-nums"
    >
      {value.toFixed(1)}×
    </Badge>
  );
}
