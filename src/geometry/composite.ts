/**
 * Projects the composed multi-wing house model into every 2D view the app
 * needs (plan, four orthographic elevations, pseudo-3D oblique).
 *
 * Coordinate conventions used throughout:
 * - Plan grid: x = east, y = north, z = up; all in metres.
 * - Every projection first backface-culls (`normal · toViewer > 0`), then
 *   painter-sorts faces far-to-near by centroid depth, so nearer wings
 *   correctly occlude wings behind them without any clipping maths.
 * - Scene output is normalised to start at (0,0) with y up-positive;
 *   renderers flip y for SVG/PDF.
 */
import type { Wing } from "../data/types";
import type { Point, RoofPlanGeometry } from "./roof";
import { computeRoofPlan } from "./roof";
import { placeWingFaces, faceNormal, faceCentroid, wingPlanSize } from "./faces3d";
import type { Face3D, Vec3 } from "./faces3d";

export type Direction = "N" | "E" | "S" | "W";

export interface ScenePolygon {
  points: Point[];
  kind: "wall" | "roof";
  wingId: string;
}

export interface Scene2D {
  polygons: ScenePolygon[];
  widthM: number;
  heightM: number;
}

export interface PlacedPlan {
  wingId: string;
  outline: Point[];
  ridgeLine: [Point, Point] | null;
  hipLines: [Point, Point][];
  slopeArrow: [Point, Point] | null;
}

export interface PlanScene {
  wings: PlacedPlan[];
  minX: number;
  minY: number;
  widthM: number;
  heightM: number;
}

function transformPlanPoint(p: Point, wing: Wing): Point {
  return wing.rotated ? { x: p.y + wing.x, y: p.x + wing.y } : { x: p.x + wing.x, y: p.y + wing.y };
}

function transformPlanGeometry(plan: RoofPlanGeometry, wing: Wing): PlacedPlan {
  const t = (p: Point) => transformPlanPoint(p, wing);
  return {
    wingId: wing.id,
    outline: plan.outline.map(t),
    ridgeLine: plan.ridgeLine ? [t(plan.ridgeLine[0]), t(plan.ridgeLine[1])] : null,
    hipLines: plan.hipLines.map(([a, b]) => [t(a), t(b)] as [Point, Point]),
    slopeArrow: plan.slopeArrow ? [t(plan.slopeArrow[0]), t(plan.slopeArrow[1])] : null,
  };
}

export function planScene(wings: Wing[]): PlanScene {
  const placed = wings.map((w) => transformPlanGeometry(computeRoofPlan(w), w));
  const allPts = placed.flatMap((p) => p.outline);
  const minX = Math.min(...allPts.map((p) => p.x));
  const minY = Math.min(...allPts.map((p) => p.y));
  const maxX = Math.max(...allPts.map((p) => p.x));
  const maxY = Math.max(...allPts.map((p) => p.y));
  // shift so the scene starts at (0,0)
  const shift = (p: Point): Point => ({ x: p.x - minX, y: p.y - minY });
  return {
    wings: placed.map((p) => ({
      wingId: p.wingId,
      outline: p.outline.map(shift),
      ridgeLine: p.ridgeLine ? [shift(p.ridgeLine[0]), shift(p.ridgeLine[1])] : null,
      hipLines: p.hipLines.map(([a, b]) => [shift(a), shift(b)] as [Point, Point]),
      slopeArrow: p.slopeArrow ? [shift(p.slopeArrow[0]), shift(p.slopeArrow[1])] : null,
    })),
    minX,
    minY,
    widthM: maxX - minX,
    heightM: maxY - minY,
  };
}

interface TaggedFace extends Face3D {
  wingId: string;
}

function allFaces(wings: Wing[]): TaggedFace[] {
  return wings.flatMap((w) => placeWingFaces(w).map((f) => ({ ...f, wingId: w.id })));
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function buildScene(faces: TaggedFace[], toViewer: Vec3, project: (p: Vec3) => Point, depth: (c: Vec3) => number): Scene2D {
  const visible = faces.filter((f) => dot(faceNormal(f.pts), toViewer) > 1e-9);
  // painter: far faces first
  visible.sort((a, b) => depth(faceCentroid(b.pts)) - depth(faceCentroid(a.pts)));
  const polygons = visible.map((f) => ({ kind: f.kind, wingId: f.wingId, points: f.pts.map(project) }));
  const allPts = polygons.flatMap((p) => p.points);
  if (allPts.length === 0) return { polygons: [], widthM: 0, heightM: 0 };
  const minX = Math.min(...allPts.map((p) => p.x));
  const minY = Math.min(...allPts.map((p) => p.y));
  const maxX = Math.max(...allPts.map((p) => p.x));
  const maxY = Math.max(...allPts.map((p) => p.y));
  for (const poly of polygons) {
    poly.points = poly.points.map((p) => ({ x: p.x - minX, y: p.y - minY }));
  }
  return { polygons, widthM: maxX - minX, heightM: maxY - minY };
}

/**
 * Orthographic elevation looking at the named side of the house
 * (an "S" elevation is what you see standing to the south looking north).
 * Output is in real metres, y up-positive from ground.
 *
 * The horizontal-axis signs encode which way each view mirrors: facing
 * north (S view) east is on your right (+x); facing south (N view) east is
 * on your left (-x); facing west (E view) north is on your right (+y);
 * facing east (W view) north is on your left (-y). Depth functions return
 * "larger = farther" so the shared far-first painter sort works unchanged.
 */
export function elevationScene(wings: Wing[], dir: Direction): Scene2D {
  const faces = allFaces(wings);
  switch (dir) {
    case "S":
      return buildScene(faces, [0, -1, 0], ([x, , z]) => ({ x, y: z }), (c) => c[1]);
    case "N":
      return buildScene(faces, [0, 1, 0], ([x, , z]) => ({ x: -x, y: z }), (c) => -c[1]);
    case "E":
      return buildScene(faces, [1, 0, 0], ([, y, z]) => ({ x: y, y: z }), (c) => -c[0]);
    case "W":
      return buildScene(faces, [-1, 0, 0], ([, y, z]) => ({ x: -y, y: z }), (c) => c[0]);
  }
}

// Cabinet-style oblique: depth recedes up-right at reduced scale
const KX = 0.45;
const KY = 0.26;

/** Pseudo-3D view of the whole composition, for placement feedback. */
export function obliqueScene(wings: Wing[]): Scene2D {
  const faces = allFaces(wings);
  return buildScene(
    faces,
    [KX, -1, KY],
    ([x, y, z]) => ({ x: x + KX * y, y: z + KY * y }),
    (c) => c[1],
  );
}

/** Overall plan-grid bounding box of the wings (unshifted plan coordinates). */
export function wingsBounds(wings: Wing[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (wings.length === 0) return { minX: 0, minY: 0, maxX: 10, maxY: 8 };
  const boxes = wings.map((w) => {
    const { w: pw, d: pd } = wingPlanSize(w);
    return { minX: w.x, minY: w.y, maxX: w.x + pw, maxY: w.y + pd };
  });
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}
