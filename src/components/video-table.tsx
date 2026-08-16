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
 * The score badge is colour-coded by band rather than printed as a bare number,
 * because the point of this table is scanning: a breakout should be visible
 * without reading a single digit.
 */
export function VideoTable({ videos }: { videos: VideoRow[] }) {
  if (videos.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        No videos stored yet. Research the channel to fill this in.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[280px]">Video</TableHead>
            <TableHead className="text-right">Views</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead className="text-right">Views/day</TableHead>
            <TableHead className="text-right">Published</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {videos.map((video) => (
            <TableRow key={video.id}>
              <TableCell className="max-w-[420px]">
                <a
                  href={video.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-primary inline-flex items-start gap-1.5 font-medium transition-colors"
                >
                  <span className="line-clamp-2">{video.title}</span>
                  <ExternalLink className="mt-1 size-3 shrink-0 opacity-50" aria-hidden />
                </a>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {Number(video.view_count).toLocaleString()}
              </TableCell>
              <TableCell className="text-right">
                <ScoreBadge score={video.outlier_score} />
              </TableCell>
              <TableCell className="text-muted-foreground text-right font-mono tabular-nums">
                {video.velocity === null ? "—" : Math.round(Number(video.velocity)).toLocaleString()}
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
  const variant = value >= 3 ? "default" : value >= 1.5 ? "secondary" : "outline";

  return (
    <Badge variant={variant} className="font-mono tabular-nums">
      {value.toFixed(1)}×
    </Badge>
  );
}
