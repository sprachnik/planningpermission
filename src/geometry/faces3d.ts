import type { ChimneySpec, Opening, Rooflight, RoofParams, Wing } from "../data/types";
import { computeRoofPlan, gableRidgeY } from "./roof";

export type Vec3 = [number, number, number];

export interface Face3D {
  pts: Vec3[];
  kind: "wall" | "roof" | "opening" | "chimney";
  /** Set on kind "opening" faces so views can map polygons back to the Opening */
  openingId?: string;
  /** Set on kind "opening" faces — drives per-type rendering (fills, garage lines) */
  openingType?: Opening["type"] | "rooflight";
  /** Painter-sort point used instead of the face centroid. Openings anchor to
   *  their host wall's centroid (nudged proud) so they always sort with the
   *  wall — an opening's own centroid can land deeper than the wall's and get
   *  painted underneath it (lost) in views whose depth axis runs along the
   *  wall. Ties resolve by stable sort: openings are built after walls. */
  depthAnchor?: Vec3;
}

/** How far openings sit proud of their wall so the painter sort draws them
 *  after it (same plane would tie on centroid depth). */
const OPENING_PROUD_M = 0.01;

/** Chimney stack plan size (along ridge × across) and rise above the ridge. */
export const CHIMNEY_ALONG_M = 0.9;
export const CHIMNEY_ACROSS_M = 0.5;
export const CHIMNEY_ABOVE_RIDGE_M = 0.8;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Wall top height at distance `s` along a wall (measured from its left
 *  corner as seen from outside — the same axis as Opening.offsetM). Gable-end
 *  walls rise to the ridge; mono-pitch wall tops follow the roof line. */
function wallHeightAt(params: RoofParams, side: Opening["side"], s: number): number {
  const { widthM: W, depthM: D, roofType, eaveHeightM: e } = params;
  if (roofType === "gable" && (side === "left" || side === "right")) {
    const r = computeRoofPlan(params).ridgeHeightM;
    const ridgeY = gableRidgeY(params);
    const y = side === "left" ? D - s : s; // local y at distance s along the wall
    if (y <= ridgeY) return ridgeY < 1e-9 ? r : e + ((r - e) * y) / ridgeY;
    return D - ridgeY < 1e-9 ? r : e + ((r - e) * (D - y)) / (D - ridgeY);
  }
  if (roofType === "mono-pitch") {
    const r = computeRoofPlan(params).ridgeHeightM;
    const highEdge = params.highEdge ?? "width-end";
    const local = { front: { x: s, y: 0 }, back: { x: W - s, y: D }, left: { x: 0, y: D - s }, right: { x: W, y: s } }[side];
    switch (highEdge) {
      case "width-start":
        return e + ((W - local.x) / W) * (r - e);
      case "width-end":
        return e + (local.x / W) * (r - e);
      case "depth-start":
        return e + ((D - local.y) / D) * (r - e);
      case "depth-end":
        return e + (local.y / D) * (r - e);
    }
  }
  return e; // flat, hip, and gable front/back walls all stop at the eave
}

/** Highest an opening spanning [from, to] along a wall may reach without
 *  poking through the roof: wall tops are piecewise linear peaking at the
 *  ridge, so the binding constraint is at one of the span's ends. */
export function openingTopLimit(params: RoofParams, side: Opening["side"], fromM: number, toM: number): number {
  return Math.min(wallHeightAt(params, side, fromM), wallHeightAt(params, side, toM));
}

/**
 * Opening rectangles, coplanar with (and slightly proud of) their wall, wound
 * to match the wall's outward normal. Offsets are measured from the wall's
 * left corner as seen from outside; heights are clamped to the wall's real
 * top at that position (the eave, or higher up a gable-end/mono wall) so a
 * window can never poke through a roof plane.
 */
function buildOpeningFaces(params: RoofParams, openings: Opening[], wallCentroids: Record<Opening["side"], Vec3 | undefined>): Face3D[] {
  const { widthM: W, depthM: D } = params;
  const eps = OPENING_PROUD_M;
  const faces: Face3D[] = [];
  for (const o of openings) {
    const wallLen = o.side === "front" || o.side === "back" ? W : D;
    const w = clamp(o.widthM, 0.2, wallLen - 0.1);
    const from = clamp(o.offsetM, 0.05, wallLen - w - 0.05);
    const top = openingTopLimit(params, o.side, from, from + w);
    // windows sit on their sill; doors, garage doors and open doorways are grounded
    const z0 = clamp(o.type === "window" ? o.sillM : 0, 0, top - 0.3);
    const z1 = clamp(z0 + o.heightM, z0 + 0.2, top - 0.05);
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
    // anchor painter depth to the host wall, nudged proud along its normal
    const OUTWARD: Record<Opening["side"], Vec3> = { front: [0, -1, 0], back: [0, 1, 0], left: [-1, 0, 0], right: [1, 0, 0] };
    const wc = wallCentroids[o.side];
    const n = OUTWARD[o.side];
    const depthAnchor: Vec3 | undefined = wc && [wc[0] + n[0] * eps, wc[1] + n[1] * eps, wc[2] + n[2] * eps];
    faces.push({ pts, kind: "opening", openingId: o.id, openingType: o.type, depthAnchor });
  }
  return faces;
}

/** Parametric description of one roof slope a rooflight can lie in:
 *  `at(along, up)` maps (distance along the level/ridge axis, distance up the
 *  slope from the eave) to a local 3D point. */
interface SlopePlane {
  at: (alongM: number, upM: number) => Vec3;
  /** Total slope length eave → ridge (m) */
  slopeLenM: number;
  /** Extent of the level axis (m) */
  alongLenM: number;
  /** Outward (unnormalised) plane normal */
  normal: Vec3;
}

/** The named slope of a roof, when rooflights are supported on it.
 *  Gable: front/back planes; mono-pitch: its single plane (either name).
 *  Hip planes are trapezoids — unsupported until in-plane clamping exists. */
export function slopePlane(params: RoofParams, plane: Rooflight["plane"]): SlopePlane | null {
  const { widthM: W, depthM: D, roofType, eaveHeightM: e } = params;
  if (roofType === "gable") {
    const r = computeRoofPlan(params).ridgeHeightM;
    const ry = gableRidgeY(params);
    if (plane === "front") {
      const L = Math.hypot(ry, r - e);
      if (L < 1e-6) return null;
      return {
        at: (a, s) => [a, (s * ry) / L, e + (s * (r - e)) / L],
        slopeLenM: L,
        alongLenM: W,
        normal: [0, -(r - e), ry],
      };
    }
    const L = Math.hypot(D - ry, r - e);
    if (L < 1e-6) return null;
    return {
      at: (a, s) => [a, D - (s * (D - ry)) / L, e + (s * (r - e)) / L],
      slopeLenM: L,
      alongLenM: W,
      normal: [0, r - e, D - ry],
    };
  }
  if (roofType === "mono-pitch") {
    const r = computeRoofPlan(params).ridgeHeightM;
    const highEdge = params.highEdge ?? "width-end";
    const run = highEdge.startsWith("width") ? W : D;
    const L = Math.hypot(run, r - e);
    if (L < 1e-6) return null;
    const rise = (s: number) => e + (s * (r - e)) / L;
    switch (highEdge) {
      case "width-end":
        return { at: (a, s) => [(s * run) / L, a, rise(s)], slopeLenM: L, alongLenM: D, normal: [-(r - e), 0, run] };
      case "width-start":
        return { at: (a, s) => [W - (s * run) / L, a, rise(s)], slopeLenM: L, alongLenM: D, normal: [r - e, 0, run] };
      case "depth-end":
        return { at: (a, s) => [a, (s * run) / L, rise(s)], slopeLenM: L, alongLenM: W, normal: [0, -(r - e), run] };
      case "depth-start":
        return { at: (a, s) => [a, D - (s * run) / L, rise(s)], slopeLenM: L, alongLenM: W, normal: [0, r - e, run] };
    }
  }
  return null; // flat and hip roofs carry no rooflights (yet)
}

/** A rooflight's rectangle in the wing's local frame (clamped inside its
 *  slope), or null when the roof type can't carry one. Winding matches the
 *  plane's outward normal. */
export function rooflightRect(params: RoofParams, rl: Rooflight): Vec3[] | null {
  const plane = slopePlane(params, rl.plane);
  if (!plane) return null;
  const w = clamp(rl.widthM, 0.3, plane.alongLenM - 0.2);
  const len = clamp(rl.lengthM, 0.3, plane.slopeLenM - 0.3);
  const a0 = clamp(rl.offsetM, 0.1, plane.alongLenM - w - 0.1);
  const s0 = clamp(rl.upSlopeM, 0.15, plane.slopeLenM - len - 0.15);
  const pts: Vec3[] = [plane.at(a0, s0), plane.at(a0 + w, s0), plane.at(a0 + w, s0 + len), plane.at(a0, s0 + len)];
  // orient the winding to the outward normal (parametrisations differ per slope)
  if (dot3(faceNormal(pts), plane.normal) < 0) pts.reverse();
  return pts;
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Rooflight faces, slightly proud of their slope and depth-anchored to it
 *  (same painter reasoning as wall openings). */
function buildRooflightFaces(params: RoofParams, rooflights: Rooflight[]): Face3D[] {
  const faces: Face3D[] = [];
  for (const rl of rooflights) {
    const plane = slopePlane(params, rl.plane);
    const rect = rooflightRect(params, rl);
    if (!plane || !rect) continue;
    const n = plane.normal;
    const nl = Math.hypot(n[0], n[1], n[2]);
    const off: Vec3 = [(n[0] / nl) * OPENING_PROUD_M, (n[1] / nl) * OPENING_PROUD_M, (n[2] / nl) * OPENING_PROUD_M];
    const proud = rect.map(([x, y, z]): Vec3 => [x + off[0], y + off[1], z + off[2]]);
    const mid = plane.at(plane.alongLenM / 2, plane.slopeLenM / 2);
    faces.push({
      pts: proud,
      kind: "opening",
      openingId: rl.id,
      openingType: "rooflight",
      depthAnchor: [mid[0] + off[0], mid[1] + off[1], mid[2] + off[2]],
    });
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
  const plan = computeRoofPlan(params);
  const r = plan.ridgeHeightM;
  const a = (chimney.alongM ?? CHIMNEY_ALONG_M) / 2;
  const b = (chimney.acrossM ?? CHIMNEY_ACROSS_M) / 2;
  const position = chimney.position ?? "ridge";
  let x0: number;
  let x1: number;
  let y0: number;
  let y1: number;
  let z0: number;
  const z1 = r + CHIMNEY_ABOVE_RIDGE_M;
  if (position !== "ridge" && params.roofType === "gable") {
    // External stack rising up a gable-end wall from the ground, straddling
    // the ridge line so the flue clears the apex.
    const out = b * 2;
    [x0, x1] = position === "end-left" ? [-out, 0] : [W, W + out];
    const cy = plan.ridgeLine ? plan.ridgeLine[0].y : D / 2;
    y0 = cy - a;
    y1 = cy + a;
    z0 = 0;
  } else {
    const cx = clamp(chimney.offsetM, a + 0.1, W - a - 0.1);
    // straddle the true ridge — off-centre when the gable pitches differ
    const cy = plan.ridgeLine ? plan.ridgeLine[0].y : D / 2;
    x0 = cx - a;
    x1 = cx + a;
    y0 = cy - b;
    y1 = cy + b;
    z0 = Math.max(r - 0.6, params.eaveHeightM);
  }
  const face = (pts: Vec3[]): Face3D => ({ pts, kind: "chimney" });
  const faces = [
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
  // an end stack's face against the gable wall would z-fight it — drop it
  if (position === "end-left" && params.roofType === "gable") faces.splice(3, 1);
  else if (position === "end-right" && params.roofType === "gable") faces.splice(2, 1);
  return faces;
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
    // ridge sits at D/2 for symmetric roofs, off-centre when the pitches differ
    const ry = gableRidgeY(params);
    wall([0, 0, 0], [W, 0, 0], [W, 0, e], [0, 0, e]); // front
    wall([W, D, 0], [0, D, 0], [0, D, e], [W, D, e]); // back
    // gable end walls rise to the ridge
    wall([0, D, 0], [0, 0, 0], [0, 0, e], [0, ry, r], [0, D, e]); // left pentagon
    wall([W, 0, 0], [W, D, 0], [W, D, e], [W, ry, r], [W, 0, e]); // right pentagon
    roof([0, 0, e], [W, 0, e], [W, ry, r], [0, ry, r]); // front plane
    roof([W, D, e], [0, D, e], [0, ry, r], [W, ry, r]); // rear plane
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
  const solid = buildWingFaces(wing);
  // buildWingFaces pushes walls in a fixed order for every roof type
  const walls = solid.filter((f) => f.kind === "wall");
  const wallCentroids: Record<Opening["side"], Vec3 | undefined> = {
    front: walls[0] && faceCentroid(walls[0].pts),
    back: walls[1] && faceCentroid(walls[1].pts),
    left: walls[2] && faceCentroid(walls[2].pts),
    right: walls[3] && faceCentroid(walls[3].pts),
  };
  const faces = [
    ...solid,
    ...buildOpeningFaces(wing, wing.openings ?? [], wallCentroids),
    ...buildRooflightFaces(wing, wing.rooflights ?? []),
    ...(wing.chimney ? buildChimneyFaces(wing, wing.chimney) : []),
  ];
  const rot = wingRotation(wing);
  const ground = wing.groundOffsetM ?? 0;
  const place = ([x, y, z]: Vec3): Vec3 => {
    const p = rotateLocalPoint(x, y, rot, wing.widthM, wing.depthM);
    return [p.x + wing.x, p.y + wing.y, z + ground];
  };
  return faces.map((f) => ({
    ...f,
    pts: f.pts.map(place),
    depthAnchor: f.depthAnchor && place(f.depthAnchor),
  }));
}

/** Plan-grid footprint size of a wing (accounts for rotation). */
export function wingPlanSize(wing: Wing): { w: number; d: number } {
  const rot = wingRotation(wing);
  return rot === 90 || rot === 270 ? { w: wing.depthM, d: wing.widthM } : { w: wing.widthM, d: wing.depthM };
}
