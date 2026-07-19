import type { ChimneySpec, Opening, RoofParams, Wing } from "../data/types";
import { computeRoofPlan } from "./roof";

export type Vec3 = [number, number, number];

export interface Face3D {
  pts: Vec3[];
  kind: "wall" | "roof" | "opening" | "chimney";
  /** Set on kind "opening" faces so views can map polygons back to the Opening */
  openingId?: string;
  /** Set on kind "opening" faces — drives per-type rendering (fills, garage lines) */
  openingType?: Opening["type"];
}

/** How far openings sit proud of their wall so the painter sort draws them
 *  after it (same plane would tie on centroid depth). */
const OPENING_PROUD_M = 0.01;

/** Chimney stack plan size (along ridge × across) and rise above the ridge. */
export const CHIMNEY_ALONG_M = 0.9;
export const CHIMNEY_ACROSS_M = 0.5;
export const CHIMNEY_ABOVE_RIDGE_M = 0.8;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * Opening rectangles, coplanar with (and slightly proud of) their wall, wound
 * to match the wall's outward normal. Offsets are measured from the wall's
 * left corner as seen from outside; heights are clamped to the eave so a
 * window can never poke through a roof plane.
 */
function buildOpeningFaces(params: RoofParams, openings: Opening[]): Face3D[] {
  const { widthM: W, depthM: D, eaveHeightM: e } = params;
  const eps = OPENING_PROUD_M;
  const faces: Face3D[] = [];
  for (const o of openings) {
    const wallLen = o.side === "front" || o.side === "back" ? W : D;
    const w = clamp(o.widthM, 0.2, wallLen - 0.1);
    const from = clamp(o.offsetM, 0.05, wallLen - w - 0.05);
    // windows sit on their sill; doors, garage doors and open doorways are grounded
    const z0 = clamp(o.type === "window" ? o.sillM : 0, 0, e - 0.3);
    const z1 = clamp(z0 + o.heightM, z0 + 0.2, e - 0.05);
    let pts: Vec3[];
    switch (o.side) {
      case "front": // y=0, normal -y; outside left is x=0
        pts = [
          [from, -eps, z0],
          [from + w, -eps, z0],
          [from + w, -eps, z1],
          [from, -eps, z1],
        ];
        break;
      case "back": {
        // y=D, normal +y; outside left is x=W
        const xR = W - from;
        const xL = xR - w;
        pts = [
          [xR, D + eps, z0],
          [xL, D + eps, z0],
          [xL, D + eps, z1],
          [xR, D + eps, z1],
        ];
        break;
      }
      case "left": {
        // x=0, normal -x; outside left is y=D
        const yH = D - from;
        const yL = yH - w;
        pts = [
          [-eps, yH, z0],
          [-eps, yL, z0],
          [-eps, yL, z1],
          [-eps, yH, z1],
        ];
        break;
      }
      case "right": {
        // x=W, normal +x; outside left is y=0
        pts = [
          [W + eps, from, z0],
          [W + eps, from + w, z0],
          [W + eps, from + w, z1],
          [W + eps, from, z1],
        ];
        break;
      }
    }
    faces.push({ pts, kind: "opening", openingId: o.id, openingType: o.type });
  }
  return faces;
}

/**
 * A chimney stack as a closed box straddling the ridge (gable/hip only).
 * It starts below the ridge so the roof planes hide the buried part; the
 * painter sort takes care of the rest.
 */
function buildChimneyFaces(params: RoofParams, chimney: ChimneySpec): Face3D[] {
  if (params.roofType === "mono-pitch" || params.roofType === "flat") return [];
  const { widthM: W, depthM: D } = params;
  const r = computeRoofPlan(params).ridgeHeightM;
  const a = (chimney.alongM ?? CHIMNEY_ALONG_M) / 2;
  const b = (chimney.acrossM ?? CHIMNEY_ACROSS_M) / 2;
  const cx = clamp(chimney.offsetM, a + 0.1, W - a - 0.1);
  const cy = D / 2;
  const x0 = cx - a;
  const x1 = cx + a;
  const y0 = cy - b;
  const y1 = cy + b;
  const z0 = Math.max(r - 0.6, params.eaveHeightM);
  const z1 = r + CHIMNEY_ABOVE_RIDGE_M;
  const face = (pts: Vec3[]): Face3D => ({ pts, kind: "chimney" });
  return [
    face([
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, z1],
      [x0, y0, z1],
    ]), // south face, normal -y
    face([
      [x1, y1, z0],
      [x0, y1, z0],
      [x0, y1, z1],
      [x1, y1, z1],
    ]), // north face, normal +y
    face([
      [x0, y1, z0],
      [x0, y0, z0],
      [x0, y0, z1],
      [x0, y1, z1],
    ]), // west face, normal -x
    face([
      [x1, y0, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x1, y0, z1],
    ]), // east face, normal +x
    face([
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ]), // cap, normal +z
  ];
}

/**
 * Builds the complete solid (all walls + all roof planes) for one parametric
 * block, in local coordinates: width along x, depth along y, height z, SW
 * corner at origin. Faces are wound counter-clockwise seen from outside so
 * Newell normals point outwards.
 */
export function buildWingFaces(params: RoofParams): Face3D[] {
  const { widthM: W, depthM: D, roofType, eaveHeightM: e } = params;
  const r = computeRoofPlan(params).ridgeHeightM;
  const faces: Face3D[] = [];
  const wall = (...pts: Vec3[]): void => {
    faces.push({ pts, kind: "wall" });
  };
  const roof = (...pts: Vec3[]): void => {
    faces.push({ pts, kind: "roof" });
  };

  if (roofType === "flat") {
    wall([0, 0, 0], [W, 0, 0], [W, 0, e], [0, 0, e]); // front (y=0), normal -y
    wall([W, D, 0], [0, D, 0], [0, D, e], [W, D, e]); // back (y=D), normal +y
    wall([0, D, 0], [0, 0, 0], [0, 0, e], [0, D, e]); // left (x=0), normal -x
    wall([W, 0, 0], [W, D, 0], [W, D, e], [W, 0, e]); // right (x=W), normal +x
    roof([0, 0, e], [W, 0, e], [W, D, e], [0, D, e]); // deck, normal +z
    return faces;
  }

  if (roofType === "mono-pitch") {
    const highEdge = params.highEdge ?? "width-end";
    const zAt = (x: number, y: number): number => {
      switch (highEdge) {
        case "width-start":
          return e + ((W - x) / W) * (r - e);
        case "width-end":
          return e + (x / W) * (r - e);
        case "depth-start":
          return e + ((D - y) / D) * (r - e);
        case "depth-end":
          return e + (y / D) * (r - e);
      }
    };
    // walls: top edge follows the roof line (zAt is linear along each edge)
    wall([0, 0, 0], [W, 0, 0], [W, 0, zAt(W, 0)], [0, 0, zAt(0, 0)]); // front (y=0), normal -y
    wall([W, D, 0], [0, D, 0], [0, D, zAt(0, D)], [W, D, zAt(W, D)]); // back (y=D), normal +y
    wall([0, D, 0], [0, 0, 0], [0, 0, zAt(0, 0)], [0, D, zAt(0, D)]); // left (x=0), normal -x
    wall([W, 0, 0], [W, D, 0], [W, D, zAt(W, D)], [W, 0, zAt(W, 0)]); // right (x=W), normal +x
    roof([0, 0, zAt(0, 0)], [W, 0, zAt(W, 0)], [W, D, zAt(W, D)], [0, D, zAt(0, D)]);
    return faces;
  }

  if (roofType === "gable") {
    wall([0, 0, 0], [W, 0, 0], [W, 0, e], [0, 0, e]); // front
    wall([W, D, 0], [0, D, 0], [0, D, e], [W, D, e]); // back
    // gable end walls rise to the ridge
    wall([0, D, 0], [0, 0, 0], [0, 0, e], [0, D / 2, r], [0, D, e]); // left pentagon
    wall([W, 0, 0], [W, D, 0], [W, D, e], [W, D / 2, r], [W, 0, e]); // right pentagon
    roof([0, 0, e], [W, 0, e], [W, D / 2, r], [0, D / 2, r]); // front plane
    roof([W, D, e], [0, D, e], [0, D / 2, r], [W, D / 2, r]); // rear plane
    return faces;
  }

  // hip
  wall([0, 0, 0], [W, 0, 0], [W, 0, e], [0, 0, e]);
  wall([W, D, 0], [0, D, 0], [0, D, e], [W, D, e]);
  wall([0, D, 0], [0, 0, 0], [0, 0, e], [0, D, e]);
  wall([W, 0, 0], [W, D, 0], [W, D, e], [W, 0, e]);
  const inset = D / 2;
  if (W > D) {
    const r1: Vec3 = [inset, D / 2, r];
    const r2: Vec3 = [W - inset, D / 2, r];
    roof([0, 0, e], [W, 0, e], r2, r1); // front plane
    roof([W, D, e], [0, D, e], r1, r2); // rear plane
    roof([0, D, e], [0, 0, e], r1); // left hip
    roof([W, 0, e], [W, D, e], r2); // right hip
  } else {
    const apex: Vec3 = [W / 2, D / 2, r];
    roof([0, 0, e], [W, 0, e], apex);
    roof([W, 0, e], [W, D, e], apex);
    roof([W, D, e], [0, D, e], apex);
    roof([0, D, e], [0, 0, e], apex);
  }
  return faces;
}

/** Newell's method — robust polygon normal for planar-ish faces. */
export function faceNormal(pts: Vec3[]): Vec3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1, z1] = pts[i];
    const [x2, y2, z2] = pts[(i + 1) % pts.length];
    nx += (y1 - y2) * (z1 + z2);
    ny += (z1 - z2) * (x1 + x2);
    nz += (x1 - x2) * (y1 + y2);
  }
  return [nx, ny, nz];
}

export function faceCentroid(pts: Vec3[]): Vec3 {
  const n = pts.length;
  return [
    pts.reduce((s, p) => s + p[0], 0) / n,
    pts.reduce((s, p) => s + p[1], 0) / n,
    pts.reduce((s, p) => s + p[2], 0) / n,
  ];
}

export type QuarterTurn = 0 | 90 | 180 | 270;

/** A wing's plan rotation, honouring the deprecated `rotated` flag (= 90°). */
export function wingRotation(wing: Pick<Wing, "rotated" | "rotationDeg">): QuarterTurn {
  return wing.rotationDeg ?? (wing.rotated ? 90 : 0);
}

/** Rotate a local plan point by quarter turns (CCW), normalised so the
 *  footprint's SW corner stays at the local origin. True rotations preserve
 *  winding, so Newell normals stay outward with no point-order tricks. */
export function rotateLocalPoint(x: number, y: number, rot: QuarterTurn, W: number, D: number): { x: number; y: number } {
  switch (rot) {
    case 0:
      return { x, y };
    case 90:
      return { x: D - y, y: x };
    case 180:
      return { x: W - x, y: D - y };
    case 270:
      return { x: y, y: W - x };
  }
}

/** Places a wing's local faces onto the shared plan grid: quarter-turn
 *  rotation about the footprint, then translate. */
export function placeWingFaces(wing: Wing): Face3D[] {
  const faces = [
    ...buildWingFaces(wing),
    ...buildOpeningFaces(wing, wing.openings ?? []),
    ...(wing.chimney ? buildChimneyFaces(wing, wing.chimney) : []),
  ];
  const rot = wingRotation(wing);
  return faces.map((f) => ({
    ...f,
    pts: f.pts.map(([x, y, z]): Vec3 => {
      const p = rotateLocalPoint(x, y, rot, wing.widthM, wing.depthM);
      return [p.x + wing.x, p.y + wing.y, z];
    }),
  }));
}

/** Plan-grid footprint size of a wing (accounts for rotation). */
export function wingPlanSize(wing: Wing): { w: number; d: number } {
  const rot = wingRotation(wing);
  return rot === 90 || rot === 270 ? { w: wing.depthM, d: wing.widthM } : { w: wing.widthM, d: wing.depthM };
}
