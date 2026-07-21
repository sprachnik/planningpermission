import { describe, it, expect } from "vitest";
import type { Wing } from "../data/types";
import { boundaryClearances, boundaryInPlanFrame } from "./siteplan";

function wing(overrides: Partial<Wing> = {}): Wing {
  return {
    id: overrides.id ?? "w1",
    name: "Main house",
    x: 0,
    y: 0,
    widthM: 8,
    depthM: 6,
    roofType: "gable",
    pitchDegrees: 40,
    eaveHeightM: 5,
    ...overrides,
  };
}

describe("boundaryClearances", () => {
  // boundary box from (-4,-3) to (12,10) around an 8×6 house at the origin
  const boundary = [
    { x: -4, y: -3 },
    { x: 12, y: -3 },
    { x: 12, y: 10 },
    { x: -4, y: 10 },
  ];

  it("measures the gap from each building face to the boundary", () => {
    const byDir = Object.fromEntries(boundaryClearances(boundary, [wing()]).map((c) => [c.dir, c.distM]));
    expect(byDir.W).toBeCloseTo(4, 6);
    expect(byDir.S).toBeCloseTo(3, 6);
    expect(byDir.E).toBeCloseTo(4, 6);
    expect(byDir.N).toBeCloseTo(4, 6);
  });

  it("ignores context-only neighbour blocks when finding the building envelope", () => {
    const withNeighbour = [wing(), wing({ id: "n1", x: 8.5, isContext: true })];
    const byDir = Object.fromEntries(boundaryClearances(boundary, withNeighbour).map((c) => [c.dir, c.distM]));
    expect(byDir.E).toBeCloseTo(4, 6); // still measured from the application house
  });

  it("drops directions where the building sits outside the red line", () => {
    const east = boundaryClearances(boundary, [wing({ x: 20 })]);
    expect(east.find((c) => c.dir === "E")).toBeUndefined();
  });
});

describe("boundaryInPlanFrame", () => {
  it("returns local metres about the centroid, honouring the underlay rotation", () => {
    const square = [
      { lng: 0, lat: 0 },
      { lng: 0.0001, lat: 0 },
      { lng: 0.0001, lat: 0.0001 },
      { lng: 0, lat: 0.0001 },
    ];
    const plain = boundaryInPlanFrame(square);
    expect(plain).toHaveLength(4);
    const cx = plain.reduce((s, p) => s + p.x, 0) / 4;
    expect(cx).toBeCloseTo(0, 6);
    // a 90° underlay turn rotates the local points, not the saved boundary
    const turned = boundaryInPlanFrame(square, 90);
    expect(turned[0].x).toBeCloseTo(-plain[0].y, 6);
    expect(turned[0].y).toBeCloseTo(plain[0].x, 6);
  });

  it("needs at least three points", () => {
    expect(boundaryInPlanFrame([{ lng: 0, lat: 0 }])).toHaveLength(0);
  });
});
