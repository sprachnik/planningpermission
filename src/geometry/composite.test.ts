import { describe, it, expect } from "vitest";
import type { Wing } from "../data/types";
import { planScene, elevationScene, obliqueScene, buildingHeights } from "./composite";
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

  it("gable-end windows can sit above the eave, up in the gable peak", () => {
    // left wall of a gable rises to the ridge (~7.52 m); a window with its
    // sill above the 5 m eave must survive the clamp and show on the W
    // elevation at true height (feedback: upper windows in gable end walls)
    const upper = { ...window, side: "left" as const, offsetM: 2.5, widthM: 1, sillM: 5.5, heightM: 1 };
    const scene = elevationScene([gable({ openings: [upper] })], "W");
    const rect = scene.polygons.find((p) => p.kind === "opening")!;
    const ys = rect.points.map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(5.5, 3);
    expect(Math.max(...ys)).toBeCloseTo(6.5, 3);
  });

  it("gable-end windows still clamp to the sloping wall top near the corners", () => {
    // near the wall's low corner the roof line, not the eave, is the limit
    const corner = { ...window, side: "left" as const, offsetM: 0.2, widthM: 1, sillM: 5.5, heightM: 3 };
    const scene = elevationScene([gable({ openings: [corner] })], "W");
    const rect = scene.polygons.find((p) => p.kind === "opening")!;
    const r = 5 + 3 * Math.tan((40 * Math.PI) / 180);
    for (const p of rect.points) {
      expect(p.y).toBeLessThanOrEqual(r);
    }
  });

  it("side-wall openings stay visible in the oblique view (painter anchors them to their wall)", () => {
    // regression: an opening in the back half of a side wall has a deeper
    // centroid than its wall's and used to be painted underneath it
    const backHalf = { ...window, side: "right" as const, offsetM: 4, sillM: 1 };
    const scene = obliqueScene([gable({ openings: [backHalf] })]);
    const openIdx = scene.polygons.findIndex((p) => p.kind === "opening");
    const wallIdx = scene.polygons.findIndex((p) => p.kind === "wall" && p.points.length === 5); // the visible gable-end pentagon
    expect(openIdx).toBeGreaterThan(wallIdx);
    expect(wallIdx).toBeGreaterThanOrEqual(0);
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

  it("an external gable-end stack rises from the ground past the ridge", () => {
    const wings = [gable({ chimney: { offsetM: 0, position: "end-left" } })];
    const ridge = 5 + 3 * Math.tan((40 * Math.PI) / 180);
    const west = elevationScene(wings, "W");
    const chimneyPolys = west.polygons.filter((p) => p.kind === "chimney");
    expect(chimneyPolys.length).toBeGreaterThan(0);
    const ys = chimneyPolys.flatMap((p) => p.points.map((q) => q.y));
    expect(Math.min(...ys)).toBeCloseTo(0, 3); // grounded, not perched on the ridge
    expect(Math.max(...ys)).toBeCloseTo(ridge + 0.8, 3);
    // plan footprint pokes out beyond the gable wall (negative x), centred on the ridge line
    const plan = planScene(wings);
    const rect = plan.wings[0].chimney!;
    const midY = (Math.min(...rect.map((p) => p.y)) + Math.max(...rect.map((p) => p.y))) / 2;
    expect(midY).toBeCloseTo(3, 3);
    expect(Math.min(...rect.map((p) => p.x))).toBeLessThan(0);
  });

  it("is ignored for mono-pitch roofs", () => {
    const mono = gable({ roofType: "mono-pitch", chimney: { offsetM: 2 } });
    const scene = elevationScene([mono], "S");
    expect(scene.polygons.filter((p) => p.kind === "chimney")).toHaveLength(0);
    expect(planScene([mono]).wings[0].chimney).toBeUndefined();
  });
});

describe("asymmetric gable (per-slope pitch)", () => {
  const asym = () => gable({ pitchDegrees: 40, rearPitchDegrees: 20 });
  const t40 = Math.tan((40 * Math.PI) / 180);
  const t20 = Math.tan((20 * Math.PI) / 180);
  const ridgeY = (6 * t20) / (t40 + t20);
  const ridgeH = 5 + ridgeY * t40;

  it("moves the ridge toward the steeper slope, both slopes meeting at one height", () => {
    const plan = planScene([asym()]);
    expect(plan.wings[0].ridgeLine![0].y).toBeCloseTo(ridgeY, 6);
    // cross-check: the shallow rear slope reaches the same ridge height
    expect(5 + (6 - ridgeY) * t20).toBeCloseTo(ridgeH, 6);
  });

  it("elevations top out at the asymmetric ridge height", () => {
    for (const dir of DIRS) {
      const scene = elevationScene([asym()], dir);
      expectWellFormed(scene);
      expect(scene.heightM).toBeCloseTo(ridgeH, 6);
    }
  });

  it("no rearPitchDegrees means the symmetric roof is unchanged", () => {
    const plain = planScene([gable()]);
    expect(plain.wings[0].ridgeLine![0].y).toBeCloseTo(3, 6);
  });

  it("chimney straddles the off-centre ridge", () => {
    const scene = planScene([{ ...asym(), chimney: { offsetM: 4 } }]);
    const ys = scene.wings[0].chimney!.map((p) => p.y);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(ridgeY, 6);
  });
});

describe("zOrder layering", () => {
  it("a raised block paints over blocks that would normally cover it", () => {
    const near = gable({ id: "near", y: 0 });
    const far = gable({ id: "far", y: 10 });
    // default: far block first (painter), near block on top
    const plain = elevationScene([near, far], "S");
    expect(plain.polygons[plain.polygons.length - 1].wingId).toBe("near");
    // raising the far block forces it on top regardless of depth
    const layered = elevationScene([near, { ...far, zOrder: 1 }], "S");
    expect(layered.polygons[layered.polygons.length - 1].wingId).toBe("far");
    expect(layered.polygons[0].wingId).toBe("near");
  });

  it("plan view honours the layer order for overlapping outlines", () => {
    const scene = planScene([gable({ id: "a", zOrder: 1 }), gable({ id: "b", x: 2, y: 2 })]);
    expect(scene.wings.map((w) => w.wingId)).toEqual(["b", "a"]);
  });
});

describe("buildingHeights", () => {
  it("reports the tallest ridge and highest eaves across blocks, ignoring chimneys", () => {
    const main = gable({ chimney: { offsetM: 4 } }); // ridge ≈ 7.52, eaves 5
    const ext = gable({ id: "w2", roofType: "flat", eaveHeightM: 3 });
    const h = buildingHeights([main, ext]);
    expect(h.maxRidgeM).toBeCloseTo(5 + 3 * Math.tan((40 * Math.PI) / 180), 6);
    expect(h.maxEaveM).toBeCloseTo(5, 6);
    expect(buildingHeights([])).toEqual({ maxRidgeM: 0, maxEaveM: 0 });
  });

  it("includes ground offsets and excludes context-only neighbour blocks", () => {
    const uphill = gable({ groundOffsetM: 0.5 });
    const neighbour = gable({ id: "n1", eaveHeightM: 20, isContext: true });
    const h = buildingHeights([uphill, neighbour]);
    expect(h.maxRidgeM).toBeCloseTo(5.5 + 3 * Math.tan((40 * Math.PI) / 180), 6);
    expect(h.maxEaveM).toBeCloseTo(5.5, 6);
  });
});

describe("rooflights", () => {
  const rl = { id: "r1", plane: "front" as const, offsetM: 2, upSlopeM: 1, widthM: 0.78, lengthM: 1.4 };

  it("shows on the elevation facing its slope, not the opposite one", () => {
    const wings = [gable({ rooflights: [rl] })];
    const south = elevationScene(wings, "S").polygons.filter((p) => p.openingType === "rooflight");
    const north = elevationScene(wings, "N").polygons.filter((p) => p.openingType === "rooflight");
    expect(south).toHaveLength(1);
    expect(north).toHaveLength(0);
    // it sits above the eave (on the roof slope) and is drawn after roof planes
    const ys = south[0].points.map((p) => p.y);
    expect(Math.min(...ys)).toBeGreaterThan(5);
  });

  it("appears on the roof plan as a rectangle within the slope", () => {
    const scene = planScene([gable({ rooflights: [rl] })]);
    expect(scene.wings[0].rooflights).toHaveLength(1);
    const ys = scene.wings[0].rooflights[0].map((p) => p.y);
    expect(Math.min(...ys)).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBeLessThan(3); // front slope only (ridge at y=3)
  });

  it("is ignored on roof types that can't carry one", () => {
    const scene = planScene([gable({ roofType: "hip", rooflights: [rl] })]);
    expect(scene.wings[0].rooflights).toHaveLength(0);
  });
});

describe("context blocks and ground offsets", () => {
  it("context blocks project with the context flag for muted rendering", () => {
    const wings = [gable(), gable({ id: "n1", x: 8, isContext: true })];
    const scene = elevationScene(wings, "S");
    expect(scene.polygons.some((p) => p.context)).toBe(true);
    expect(scene.polygons.filter((p) => p.wingId === "w1").every((p) => !p.context)).toBe(true);
  });

  it("a ground offset lifts the whole block", () => {
    const scene = elevationScene([gable({ groundOffsetM: 1 })], "S");
    const wallYs = scene.polygons.filter((p) => p.kind === "wall").flatMap((p) => p.points.map((q) => q.y));
    expect(Math.min(...wallYs)).toBeCloseTo(0, 6); // scene normalised to its own base…
    expect(scene.heightM).toBeCloseTo(5 + 3 * Math.tan((40 * Math.PI) / 180), 6); // …height unchanged relative to its base
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
