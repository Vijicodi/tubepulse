import type { EvidenceVideo } from "@/components/workspace/idea-card";
import type { VideoRow } from "@/lib/supabase/types";

/**
 * Turn the video ids an idea cites into the videos themselves.
 *
 * `ideas.evidence_video_ids` holds YouTube ids, not our row ids, because that
 * is what the model was shown and what it cites back. So the join happens here
 * rather than in the database.
 *
 * A CITED VIDEO THAT IS NO LONGER STORED IS DROPPED, NOT FAKED. Re-researching
 * a channel replaces its videos, so an older idea can cite one that has gone.
 * The card then says the evidence is missing — which is true — instead of
 * rendering a dead row or, worse, silently showing fewer sources than the idea
 * actually rested on.
 *
 * Pure, so the behaviour above is testable without a database.
 */
export function resolveEvidence(
  videoIds: string[],
  byVideoId: Map<string, Pick<VideoRow, "video_id" | "title" | "url" | "outlier_score">>,
): EvidenceVideo[] {
  const seen = new Set<string>();

  return videoIds
    .filter((id) => {
      // A model citing the same video twice should not list it twice.
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((id) => byVideoId.get(id))
    .filter((video) => video !== undefined)
    .map((video) => ({
      videoId: video.video_id,
      title: video.title,
      url: video.url,
      score: video.outlier_score === null ? null : Number(video.outlier_score),
    }));
}

/** Index a channel's videos by their YouTube id, ready for the lookup above. */
export function indexByVideoId<
  T extends Pick<VideoRow, "video_id" | "title" | "url" | "outlier_score">,
>(videos: T[]): Map<string, T> {
  return new Map(videos.map((video) => [video.video_id, video]));
}
