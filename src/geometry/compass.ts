import type { Direction } from "./composite";

/** 16-wind compass rose, clockwise from north. */
const WINDS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"] as const;

export type Wind16 = (typeof WINDS)[number];

const norm360 = (deg: number) => ((deg % 360) + 360) % 360;

/** Nearest 16-wind name for a bearing (° clockwise from north). */
export function wind16(bearingDeg: number): Wind16 {
  return WINDS[Math.round(norm360(bearingDeg) / 22.5) % 16];
}

/** Bearing each grid elevation faces, given the bearing grid-up (+y) faces.
 *  The "S" elevation shows faces looking grid-south, so it faces B+180. */
const DIR_OFFSET: Record<Direction, number> = { N: 0, E: 90, S: 180, W: 270 };

export function elevationBearing(dir: Direction, northBearingDeg: number): number {
  return norm360(northBearingDeg + DIR_OFFSET[dir]);
}

/** True-compass wind the given grid elevation faces, e.g. S with B=22.5 → "SSW". */
export function elevationWind(dir: Direction, northBearingDeg: number): Wind16 {
  return wind16(elevationBearing(dir, northBearingDeg));
}

/** " (SSW)" suffix for grid-direction labels — empty when grid north is true
 *  north (the wind would just repeat the grid name). */
export function windSuffix(dir: Direction, northBearingDeg: number): string {
  return norm360(northBearingDeg) === 0 ? "" : ` (${elevationWind(dir, northBearingDeg)})`;
}
