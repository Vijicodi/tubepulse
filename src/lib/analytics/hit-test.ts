/**
 * Which mark a pointer means, on a chart whose marks overlap.
 *
 * The outliers strip draws hundreds of small dots on one axis, and two videos
 * with nearly the same score land on top of each other. Letting each dot be
 * its own click target meant whichever was painted LAST won the click: the
 * sweep found a dot opening a different video and four dots that could not be
 * clicked at all. Choosing the mark whose centre is nearest the pointer gives
 * every dot the area around it that is closer to it than to any other — so
 * aiming at a dot opens that dot.
 */
export interface HitPoint {
  id: string;
  /** Centre, in the same pixel space as the pointer. */
  x: number;
  y: number;
}

export function nearestPoint(
  points: readonly HitPoint[],
  px: number,
  py: number,
  /** Beyond this distance the pointer is on empty chart, not on a mark. */
  maxDistance: number,
): string | null {
  let best: string | null = null;
  let bestDistance = maxDistance * maxDistance;

  for (const point of points) {
    const dx = point.x - px;
    const dy = point.y - py;
    const distance = dx * dx + dy * dy;
    // Strictly less: on an exact tie the earlier point keeps it, so the
    // answer never flickers between two marks as the pointer sits still.
    if (distance < bestDistance || (best === null && distance === bestDistance)) {
      best = point.id;
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * Spread marks across lanes so no two sit on the same spot.
 *
 * Each mark starts in its preferred lane (a hash of its id, so the layout is
 * stable between renders) and moves to the next lane while a mark already
 * placed there is within `minGap` on the axis. Without this, two videos with
 * the same score and the same hashed lane were drawn exactly on top of each
 * other, and no pointer rule can tell those apart. When every lane is taken,
 * the lane whose nearest neighbour is furthest away wins.
 */
export function assignLanes(
  marks: readonly { id: string; value: number; preferred: number }[],
  laneCount: number,
  minGap: number,
): Map<string, number> {
  const placed: number[][] = Array.from({ length: laneCount }, () => []);
  const result = new Map<string, number>();

  for (const mark of marks) {
    let chosen = -1;
    let bestRoom = -1;

    for (let step = 0; step < laneCount; step += 1) {
      const lane = (mark.preferred + step) % laneCount;
      const room = Math.min(
        Infinity,
        ...placed[lane].map((value) => Math.abs(value - mark.value)),
      );
      if (room >= minGap) {
        chosen = lane;
        break;
      }
      if (room > bestRoom) {
        bestRoom = room;
        chosen = lane;
      }
    }

    placed[chosen].push(mark.value);
    result.set(mark.id, chosen);
  }

  return result;
}
