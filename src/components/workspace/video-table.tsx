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
import { formatDate, formatNumber } from "@/lib/format";

/**
 * Videos ranked by outlier score.
 *
 * The score is encoded as a coloured band as well as a number, because this
 * table is scanned rather than read — a breakout should be visible without
 * parsing a single digit.
 *
 * ON A PHONE the number columns fold under the title. At 390px only the title
 * column fit, so the score — the reason this table exists — sat behind a
 * sideways scroll nobody discovers. Below `sm` each row carries its own score,
 * reach and date on a second line instead.
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
            <TableHead className="sm:w-[42%] sm:min-w-[13rem]">Video</TableHead>
            {channelNames && (
              <TableHead className="hidden min-w-[120px] sm:table-cell">Channel</TableHead>
            )}
            <TableHead className="hidden text-right sm:table-cell">Reach</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Score</TableHead>
            <TableHead className="hidden text-right xl:table-cell">Per day</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Published</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {videos.map((video) => (
            <TableRow key={video.id}>
              {/* min-w-0 on BOTH the flex row and the clamped span. Without it
                  the title refuses to shrink and spills into the Views column —
                  which is the overlap that got reported. */}
              <TableCell className="min-w-0 align-top max-sm:whitespace-normal">
                <a
                  href={video.url}
                  target="_blank"
                  rel="noreferrer"
                  title={video.title}
                  className="flex min-w-0 items-start gap-1.5 font-medium transition-colors hover:text-[var(--brand-2)]"
                >
                  <span className="line-clamp-2 min-w-0 break-words">{video.title}</span>
                  <ExternalLink className="mt-1 size-3 shrink-0 opacity-50" aria-hidden />
                </a>

                {/* The phone row: the same numbers as the hidden columns. */}
                <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:hidden">
                  <ScoreBadge score={video.outlier_score} />
                  <span className="text-foreground font-mono tabular-nums">
                    <Reach video={video} />
                  </span>
                  {video.velocity !== null && (
                    <span className="font-mono tabular-nums">
                      {formatNumber(Math.round(Number(video.velocity)))}/day
                    </span>
                  )}
                  <span className="font-mono">{formatDate(video.published_at)}</span>
                  {channelNames && (
                    <span className="max-w-full truncate">
                      {channelNames[video.channel_id] ?? "—"}
                    </span>
                  )}
                </div>
              </TableCell>

              {channelNames && (
                <TableCell className="text-muted-foreground hidden max-w-[9rem] truncate align-top text-sm sm:table-cell">
                  {channelNames[video.channel_id] ?? "—"}
                </TableCell>
              )}

              <TableCell className="hidden text-right align-top font-mono tabular-nums whitespace-nowrap sm:table-cell">
                <Reach video={video} />
              </TableCell>
              <TableCell className="hidden text-right align-top sm:table-cell">
                <ScoreBadge score={video.outlier_score} />
              </TableCell>
              <TableCell className="text-muted-foreground hidden text-right align-top font-mono tabular-nums whitespace-nowrap xl:table-cell">
                {video.velocity === null
                  ? "—"
                  : formatNumber(Math.round(Number(video.velocity)))}
              </TableCell>
              <TableCell className="text-muted-foreground hidden text-right align-top font-mono text-xs whitespace-nowrap sm:table-cell">
                {formatDate(video.published_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * The number this row is actually judged on.
 *
 * A static Instagram post has NO view count — it is not something you watch —
 * so it shows likes, which is what it was scored against. Printing "0 views"
 * would read as a post nobody saw, which is a different and false claim.
 *
 * The unit is spelled out because the column now holds three different things
 * depending on the row, and an unlabelled number would be a guess.
 */
function Reach({ video }: { video: VideoRow }) {
  if (video.kind === "post") {
    return video.like_count === null ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <>
        {formatNumber(Number(video.like_count))}
        <span className="text-muted-foreground ml-1 text-[0.65rem]">likes</span>
      </>
    );
  }

  if (video.view_count === null) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <>
      {formatNumber(Number(video.view_count))}
      <span className="text-muted-foreground ml-1 text-[0.65rem]">
        {video.kind === "reel" ? "plays" : "views"}
      </span>
    </>
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
