import type { Point } from "./roof";
import type { BoundaryPoint } from "../data/types";

const EARTH_RADIUS_M = 6378137;

/** Equirectangular projection to local metres relative to an origin — accurate enough at house scale. */
export function toLocalMetres(point: BoundaryPoint, origin: BoundaryPoint): Point {
  const originLatRad = (origin.lat * Math.PI) / 180;
  const x = ((point.lng - origin.lng) * Math.PI * EARTH_RADIUS_M * Math.cos(originLatRad)) / 180;
  const y = ((point.lat - origin.lat) * Math.PI * EARTH_RADIUS_M) / 180;
  return { x, y };
}

export function boundaryCentroid(points: BoundaryPoint[]): BoundaryPoint {
  const lng = points.reduce((sum, p) => sum + p.lng, 0) / points.length;
  const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  return { lng, lat };
}

export function boundaryBoundingBoxM(points: BoundaryPoint[]): { widthM: number; heightM: number } {
  if (points.length < 2) return { widthM: 0, heightM: 0 };
  const origin = boundaryCentroid(points);
  const local = points.map((p) => toLocalMetres(p, origin));
  const xs = local.map((p) => p.x);
  const ys = local.map((p) => p.y);
  return {
    widthM: Math.max(...xs) - Math.min(...xs),
    heightM: Math.max(...ys) - Math.min(...ys),
  };
}
