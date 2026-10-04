import { describe, expect, it } from "vitest";
import { assignLanes, nearestPoint } from "@/lib/analytics/hit-test";

/**
 * The sweep found outlier dots that opened the wrong video, and four that
 * could not be clicked at all, because overlapping buttons let the last one
 * painted take every click. The rule now: the nearest centre wins.
 */
describe("nearestPoint", () => {
  const points = [
    { id: "a", x: 100, y: 20 },
    { id: "b", x: 104, y: 22 }, // overlaps a
    { id: "c", x: 300, y: 40 },
  ];

  it("picks the mark whose centre is closest, even when marks overlap", () => {
    expect(nearestPoint(points, 99, 19, 12)).toBe("a");
    expect(nearestPoint(points, 105, 23, 12)).toBe("b");
  });

  it("reaches a mark that another one is drawn over", () => {
    // Exactly on b's centre: b, although a is listed first and nearby.
    expect(nearestPoint(points, 104, 22, 12)).toBe("b");
  });

  it("returns null on empty chart", () => {
    expect(nearestPoint(points, 200, 30, 12)).toBeNull();
    expect(nearestPoint([], 0, 0, 12)).toBeNull();
  });

  it("keeps the first of two equally near marks, so it never flickers", () => {
    const tie = [
      { id: "left", x: 0, y: 0 },
      { id: "right", x: 10, y: 0 },
    ];
    expect(nearestPoint(tie, 5, 0, 12)).toBe("left");
  });
});

describe("assignLanes", () => {
  it("moves a mark off a spot another mark already holds", () => {
    const lanes = assignLanes(
      [
        { id: "a", value: 1.2, preferred: 3 },
        { id: "b", value: 1.2, preferred: 3 }, // same score, same hashed lane
      ],
      7,
      0.1,
    );
    expect(lanes.get("a")).toBe(3);
    expect(lanes.get("b")).toBe(4);
  });

  it("keeps the preferred lane when there is room", () => {
    const lanes = assignLanes(
      [
        { id: "a", value: 1, preferred: 2 },
        { id: "b", value: 3, preferred: 2 },
      ],
      7,
      0.1,
    );
    expect(lanes.get("b")).toBe(2);
  });

  it("uses the roomiest lane when every lane is crowded", () => {
    const marks = [
      { id: "a", value: 1, preferred: 0 },
      { id: "b", value: 1.05, preferred: 0 },
      { id: "c", value: 1, preferred: 0 },
    ];
    const lanes = assignLanes(marks, 2, 0.5);
    // Lane 0 holds 1, lane 1 holds 1.05: c (at 1) has more room in lane 1.
    expect(lanes.get("c")).toBe(1);
  });
});
