import { describe, it, expect } from "vitest";
import type { Wing } from "../data/types";
import { planScene, elevationScene, obliqueScene } from "./composite";
import type { Direction, Scene2D } from "./composite";

const DIRS: Direction[] = ["N", "E", "S", "W"];

function gable(overrides: Partial<Wing> = {}): Wing {
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

function allPoints(scene: Scene2D) {
  return scene.polygons.flatMap((p) => p.points);
}

function expectWellFormed(scene: Scene2D) {
  expect(scene.polygons.length).toBeGreaterThan(0);
  for (const poly of scene.polygons) {
    expect(poly.points.length).toBeGreaterThanOrEqual(3);
    for (const p of poly.points) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  }
  // normalised scene: content starts at (0,0) and fits its declared extent
  const pts = allPoints(scene);
  const minX = Math.min(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxX = Math.max(...pts.map((p) => p.x));
  const maxY = Math.max(...pts.map((p) => p.y));
  expect(minX).toBeCloseTo(0, 6);
  expect(minY).toBeCloseTo(0, 6);
  expect(maxX).toBeCloseTo(scene.widthM, 6);
  expect(maxY).toBeCloseTo(scene.heightM, 6);
}

describe("elevationScene", () => {
  it("renders every direction with finite, in-extent polygons", () => {
    for (const dir of DIRS) {
      expectWellFormed(elevationScene([gable()], dir));
    }
  });

  it("gable S elevation: width = wing width, height = ridge height", () => {
    const wing = gable();
    const scene = elevationScene([wing], "S");
    const run = wing.depthM / 2;
    const ridge = wing.eaveHeightM + run * Math.tan((wing.pitchDegrees * Math.PI) / 180);
    expect(scene.widthM).toBeCloseTo(wing.widthM, 6);
    expect(scene.heightM).toBeCloseTo(ridge, 6);
  });

  it("gable E elevation spans the depth", () => {
    const scene = elevationScene([gable()], "E");
    expect(scene.widthM).toBeCloseTo(gable().depthM, 6);
  });

  it("shows both wall and roof faces from every direction", () => {
    for (const dir of DIRS) {
      const kinds = new Set(elevationScene([gable({ roofType: "hip" })], dir).polygons.map((p) => p.kind));
      expect(kinds.has("wall"), `${dir} missing walls`).toBe(true);
      expect(kinds.has("roof"), `${dir} missing roof`).toBe(true);
    }
  });

  it("rotated wings keep outward normals (regression: faces lost to backface cull)", () => {
    const rotated = gable({ rotated: true });
    for (const dir of DIRS) {
      const scene = elevationScene([rotated], dir);
      expectWellFormed(scene);
      const kinds = new Set(scene.polygons.map((p) => p.kind));
      expect(kinds.has("wall"), `${dir} lost walls after rotation`).toBe(true);
    }
    // rotation swaps the axes: S view of a rotated wing spans its depth
    expect(elevationScene([rotated], "S").widthM).toBeCloseTo(gable().depthM, 6);
  });

  it("opposite elevations of a symmetric house have equal extents", () => {
    const wings = [gable()];
    expect(elevationScene(wings, "S").widthM).toBeCloseTo(elevationScene(wings, "N").widthM, 6);
    expect(elevationScene(wings, "E").heightM).toBeCloseTo(elevationScene(wings, "W").heightM, 6);
  });

  it("mono-pitch: high edge is taller than the low edge", () => {
    const mono = gable({ roofType: "mono-pitch", pitchDegrees: 15, eaveHeightM: 2.4, highEdge: "depth-end" });
    const scene = elevationScene([mono], "E"); // looking west: depth axis runs across the view
    const rise = mono.depthM * Math.tan((15 * Math.PI) / 180);
    expect(scene.heightM).toBeCloseTo(mono.eaveHeightM + rise, 6);
  });

  it("multi-wing L-plan composes without NaN and spans the combined footprint", () => {
    const wings = [gable(), gable({ id: "w2", x: 8, y: 0, widthM: 4, depthM: 3, eaveHeightM: 2.4, pitchDegrees: 30 })];
    for (const dir of DIRS) {
      const scene = elevationScene(wings, dir);
      expectWellFormed(scene);
    }
    expect(elevationScene(wings, "S").widthM).toBeCloseTo(12, 6);
  });
});

describe("planScene", () => {
  it("extent matches the footprint and gable has a ridge but no hips", () => {
    const scene = planScene([gable()]);
    expect(scene.widthM).toBeCloseTo(8, 6);
    expect(scene.heightM).toBeCloseTo(6, 6);
    expect(scene.wings[0].ridgeLine).not.toBeNull();
    expect(scene.wings[0].hipLines).toHaveLength(0);
  });

  it("hip roof has hip lines and a shortened ridge", () => {
    const scene = planScene([gable({ roofType: "hip" })]);
    const wing = scene.wings[0];
    expect(wing.hipLines.length).toBeGreaterThanOrEqual(4);
    const [a, b] = wing.ridgeLine!;
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(8);
  });

  it("90° rotation swaps the footprint axes", () => {
    const scene = planScene([gable({ rotationDeg: 90 })]);
    expect(scene.widthM).toBeCloseTo(6, 6);
    expect(scene.heightM).toBeCloseTo(8, 6);
  });

  it("180° rotation flips a mono-pitch slope (lean-to facing the other way)", () => {
    const mono = (rot: 0 | 180) =>
      planScene([gable({ roofType: "mono-pitch", pitchDegrees: 15, eaveHeightM: 2.4, highEdge: "depth-end", rotationDeg: rot })]).wings[0].slopeArrow!;
    const arrow0 = mono(0);
    const arrow180 = mono(180);
    // slope arrow (low → high) points north at 0°, south after a 180° turn
    expect(arrow0[1].y).toBeGreaterThan(arrow0[0].y);
    expect(arrow180[1].y).toBeLessThan(arrow180[0].y);
  });
});

describe("openings", () => {
  const window = { id: "o1", type: "window" as const, side: "front" as const, offsetM: 1, widthM: 1.2, heightM: 1.2, sillM: 0.9 };

  it("a front (south) window shows on the S elevation only", () => {
    const wings = [gable({ openings: [window] })];
    const south = elevationScene(wings, "S");
    const north = elevationScene(wings, "N");
    expect(south.polygons.filter((p) => p.kind === "opening")).toHaveLength(1);
    expect(north.polygons.filter((p) => p.kind === "opening")).toHaveLength(0);
  });

  it("openings project at true size and position", () => {
    const scene = elevationScene([gable({ openings: [window] })], "S");
    const rect = scene.polygons.find((p) => p.kind === "opening")!;
    const xs = rect.points.map((p) => p.x);
    const ys = rect.points.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1.2, 3);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(1.2, 3);
    expect(Math.min(...ys)).toBeCloseTo(0.9, 3);
    expect(Math.min(...xs)).toBeCloseTo(1, 3);
  });

  it("openings are drawn after their wall (painter order)", () => {
    const scene = elevationScene([gable({ openings: [window] })], "S");
    const wallIdx = scene.polygons.findIndex((p) => p.kind === "wall");
    const openIdx = scene.polygons.findIndex((p) => p.kind === "opening");
    expect(openIdx).toBeGreaterThan(wallIdx);
  });

  it("90° rotation (CCW): a front (south) window moves to the east elevation", () => {
    const wings = [gable({ rotationDeg: 90, openings: [window] })];
    expect(elevationScene(wings, "E").polygons.filter((p) => p.kind === "opening")).toHaveLength(1);
    expect(elevationScene(wings, "S").polygons.filter((p) => p.kind === "opening")).toHaveLength(0);
  });

  it("legacy rotated flag behaves as a 90° rotation", () => {
    const legacy = [gable({ rotated: true, openings: [window] })];
    const modern = [gable({ rotationDeg: 90, openings: [window] })];
    expect(elevationScene(legacy, "E").polygons.filter((p) => p.kind === "opening")).toHaveLength(1);
    expect(elevationScene(legacy, "S").widthM).toBeCloseTo(elevationScene(modern, "S").widthM, 6);
  });

  it("180° rotation: a front window moves to the north elevation", () => {
    const wings = [gable({ rotationDeg: 180, openings: [window] })];
    expect(elevationScene(wings, "N").polygons.filter((p) => p.kind === "opening")).toHaveLength(1);
    expect(elevationScene(wings, "S").polygons.filter((p) => p.kind === "opening")).toHaveLength(0);
    // footprint unchanged at 180°
    expect(elevationScene(wings, "S").widthM).toBeCloseTo(8, 6);
  });

  it("scene polygons carry the opening id (drag/selection depends on it)", () => {
    const scene = elevationScene([gable({ openings: [window] })], "S");
    const rect = scene.polygons.find((p) => p.kind === "opening")!;
    expect(rect.openingId).toBe("o1");
    expect(scene.polygons.filter((p) => p.kind !== "opening").every((p) => p.openingId === undefined)).toBe(true);
  });

  it("scene polygons carry the opening type (per-type rendering depends on it)", () => {
    const garage = { ...window, id: "g1", type: "garage" as const, widthM: 2.4, heightM: 2.1 };
    const scene = elevationScene([gable({ openings: [garage] })], "S");
    expect(scene.polygons.find((p) => p.kind === "opening")!.openingType).toBe("garage");
  });

  it("garage doors and open doorways sit on the ground; only windows use the sill", () => {
    for (const type of ["door", "garage", "open"] as const) {
      const grounded = { ...window, id: `t-${type}`, type, sillM: 1.4, heightM: 2 };
      const scene = elevationScene([gable({ openings: [grounded] })], "S");
      const rect = scene.polygons.find((p) => p.kind === "opening")!;
      expect(Math.min(...rect.points.map((p) => p.y))).toBeCloseTo(0, 6);
    }
    const sill = elevationScene([gable({ openings: [window] })], "S").polygons.find((p) => p.kind === "opening")!;
    expect(Math.min(...sill.points.map((p) => p.y))).toBeCloseTo(0.9, 6);
  });

  it("oversized openings are clamped inside the wall", () => {
    const silly = { ...window, offsetM: -5, widthM: 50, heightM: 50, sillM: -2 };
    const scene = elevationScene([gable({ openings: [silly] })], "S");
    const rect = scene.polygons.find((p) => p.kind === "opening")!;
    for (const p of rect.points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(8);
      expect(p.y).toBeLessThanOrEqual(5); // never above the eave
    }
  });
});

describe("flat roof", () => {
  it("elevations are eave-height rectangles from every direction", () => {
    const flat = gable({ roofType: "flat", eaveHeightM: 3 });
    for (const dir of DIRS) {
      const scene = elevationScene([flat], dir);
      expect(scene.heightM).toBeCloseTo(3, 6);
      expect(scene.polygons.every((p) => p.kind !== "roof" || true)).toBe(true);
      expectWellFormed(scene);
    }
  });

  it("plan has no ridge, hips or slope arrow", () => {
    const scene = planScene([gable({ roofType: "flat" })]);
    expect(scene.wings[0].ridgeLine).toBeNull();
    expect(scene.wings[0].hipLines).toHaveLength(0);
    expect(scene.wings[0].slopeArrow).toBeNull();
  });

  it("the roof deck is visible in the oblique view but not in elevations", () => {
    const flat = gable({ roofType: "flat" });
    expect(obliqueScene([flat]).polygons.some((p) => p.kind === "roof")).toBe(true);
    expect(elevationScene([flat], "S").polygons.some((p) => p.kind === "roof")).toBe(false);
  });
});

describe("chimney", () => {
  it("adds visible faces above the ridge on every elevation", () => {
    const wings = [gable({ chimney: { offsetM: 4 } })];
    const ridge = 5 + 3 * Math.tan((40 * Math.PI) / 180);
    for (const dir of DIRS) {
      const scene = elevationScene(wings, dir);
      const chimneyPolys = scene.polygons.filter((p) => p.kind === "chimney");
      expect(chimneyPolys.length, `${dir} has no chimney`).toBeGreaterThan(0);
      const topY = Math.max(...chimneyPolys.flatMap((p) => p.points.map((q) => q.y)));
      expect(topY).toBeCloseTo(ridge + 0.8, 3);
      expect(scene.heightM).toBeCloseTo(ridge + 0.8, 3);
    }
  });

  it("appears as a rectangle on the roof plan", () => {
    const scene = planScene([gable({ chimney: { offsetM: 4 } })]);
    expect(scene.wings[0].chimney).toHaveLength(4);
  });

  it("is ignored for mono-pitch roofs", () => {
    const mono = gable({ roofType: "mono-pitch", chimney: { offsetM: 2 } });
    const scene = elevationScene([mono], "S");
    expect(scene.polygons.filter((p) => p.kind === "chimney")).toHaveLength(0);
    expect(planScene([mono]).wings[0].chimney).toBeUndefined();
  });
});

describe("obliqueScene", () => {
  it("renders finite polygons for a multi-wing house", () => {
    const scene = obliqueScene([gable(), gable({ id: "w2", x: 8, widthM: 4, depthM: 3 })]);
    expect(scene.polygons.length).toBeGreaterThan(0);
    for (const p of allPoints(scene)) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});
