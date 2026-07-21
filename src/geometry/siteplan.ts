/**
 * Block/site plan geometry: puts the red-line boundary into the composer's
 * plan-grid frame and measures the clearances from the modelled house to the
 * boundary — the written dimensions a validating officer looks for on a
 * block plan.
 */
import type { BoundaryPoint, Wing } from "../data/types";
import type { Point } from "./roof";
import { boundaryCentroid, toLocalMetres } from "./latlng";
import { wingsBounds } from "./composite";

/** The boundary polygon in the plan-grid frame: local metres about its
 *  centroid, turned by the composer's underlay rotation so it lines up with
 *  the axis-aligned blocks (same mapping the composer uses on screen). */
export function boundaryInPlanFrame(boundary: BoundaryPoint[], rotationDeg = 0): Point[] {
  if (boundary.length < 3) return [];
  const centroid = boundaryCentroid(boundary);
  const local = boundary.map((p) => toLocalMetres(p, centroid));
  if (!rotationDeg) return local;
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return local.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }));
}

export interface BoundaryClearance {
  dir: "N" | "E" | "S" | "W";
  /** Dimension line from the building face to the boundary */
  from: Point;
  to: Point;
  distM: number;
}

/** Ray → segment intersection distance (t along the ray), or null. */
function raySegment(origin: Point, dirV: Point, a: Point, b: Point): number | null {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const denom = dirV.x * ey - dirV.y * ex;
  if (Math.abs(denom) < 1e-12) return null; // parallel
  const dx = a.x - origin.x;
  const dy = a.y - origin.y;
  const t = (dx * ey - dy * ex) / denom; // along the ray
  const u = (dx * dirV.y - dy * dirV.x) / denom; // along the segment
  return t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? t : null;
}

/** Distance from the composite building footprint to the boundary in each
 *  cardinal direction (rays cast from the footprint edge midpoints). Only
 *  directions whose ray meets the boundary are returned — a building drawn
 *  partly outside the red line simply loses that dimension. Context-only
 *  neighbour blocks are ignored. */
export function boundaryClearances(boundaryPts: Point[], wings: Wing[]): BoundaryClearance[] {
  const own = wings.filter((w) => !w.isContext);
  if (own.length === 0 || boundaryPts.length < 3) return [];
  const b = wingsBounds(own);
  const midX = (b.minX + b.maxX) / 2;
  const midY = (b.minY + b.maxY) / 2;
  const rays: { dir: BoundaryClearance["dir"]; origin: Point; v: Point }[] = [
    { dir: "N", origin: { x: midX, y: b.maxY }, v: { x: 0, y: 1 } },
    { dir: "S", origin: { x: midX, y: b.minY }, v: { x: 0, y: -1 } },
    { dir: "E", origin: { x: b.maxX, y: midY }, v: { x: 1, y: 0 } },
    { dir: "W", origin: { x: b.minX, y: midY }, v: { x: -1, y: 0 } },
  ];
  const out: BoundaryClearance[] = [];
  for (const ray of rays) {
    let nearest: number | null = null;
    for (let i = 0; i < boundaryPts.length; i++) {
      const t = raySegment(ray.origin, ray.v, boundaryPts[i], boundaryPts[(i + 1) % boundaryPts.length]);
      if (t !== null && (nearest === null || t < nearest)) nearest = t;
    }
    if (nearest !== null && nearest > 0.05) {
      out.push({
        dir: ray.dir,
        from: ray.origin,
        to: { x: ray.origin.x + ray.v.x * nearest, y: ray.origin.y + ray.v.y * nearest },
        distM: nearest,
      });
    }
  }
  return out;
}
