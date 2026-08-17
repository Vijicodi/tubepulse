import { describe, expect, it } from "vitest";
import { indexByVideoId, resolveEvidence } from "@/lib/ideas/evidence";
import type { VideoRow } from "@/lib/supabase/types";

type Stored = Pick<VideoRow, "video_id" | "title" | "url" | "outlier_score">;

const video = (video_id: string, outlier_score: number | null = 3.2): Stored => ({
  video_id,
  title: `Video ${video_id}`,
  url: `https://youtube.com/watch?v=${video_id}`,
  outlier_score,
});

describe("resolveEvidence", () => {
  it("resolves cited ids to the stored videos, in the order cited", () => {
    const index = indexByVideoId([video("aaa"), video("bbb"), video("ccc")]);

    const resolved = resolveEvidence(["ccc", "aaa"], index);

    expect(resolved.map((entry) => entry.videoId)).toEqual(["ccc", "aaa"]);
    expect(resolved[0].url).toBe("https://youtube.com/watch?v=ccc");
  });

  it("DROPS a citation whose video is no longer stored", () => {
    // Re-researching a channel replaces its videos, so an older idea can cite
    // one that has since gone. Dropping it lets the card say the evidence is
    // missing; inventing a placeholder would make the idea look supported by
    // something that is not there.
    const index = indexByVideoId([video("aaa")]);

    expect(resolveEvidence(["aaa", "gone"], index)).toHaveLength(1);
    expect(resolveEvidence(["gone"], index)).toEqual([]);
  });

  it("lists a video once even if the model cites it twice", () => {
    const index = indexByVideoId([video("aaa")]);
    expect(resolveEvidence(["aaa", "aaa"], index)).toHaveLength(1);
  });

  it("keeps a null score null rather than showing it as zero", () => {
    // 0.0x would read as "this video flopped", which is a different claim from
    // "this video was never scored".
    const index = indexByVideoId([video("aaa", null)]);
    expect(resolveEvidence(["aaa"], index)[0].score).toBeNull();
  });
});
