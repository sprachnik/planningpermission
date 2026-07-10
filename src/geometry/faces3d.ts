import type { RoofParams, Wing } from "../data/types";
import { computeRoofPlan } from "./roof";

export type Vec3 = [number, number, number];

export interface Face3D {
  pts: Vec3[];
  kind: "wall" | "roof";
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

/**
 * Places a wing's local faces onto the shared plan grid: optional 90° axis
 * swap (transpose), then translate. The transpose mirrors winding, so point
 * order is reversed for rotated wings to keep Newell normals outward.
 */
export function placeWingFaces(wing: Wing): Face3D[] {
  return buildWingFaces(wing).map((f) => {
    const pts = f.pts.map(([x, y, z]): Vec3 => (wing.rotated ? [y + wing.x, x + wing.y, z] : [x + wing.x, y + wing.y, z]));
    if (wing.rotated) pts.reverse();
    return { kind: f.kind, pts };
  });
}

/** Plan-grid footprint size of a wing (accounts for rotation). */
export function wingPlanSize(wing: Wing): { w: number; d: number } {
  return wing.rotated ? { w: wing.depthM, d: wing.widthM } : { w: wing.widthM, d: wing.depthM };
}
