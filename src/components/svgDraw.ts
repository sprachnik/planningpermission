import type { Point } from "../geometry/roof";

// Shared drawing palette for on-screen previews and the plan canvas
export const WALL_FILL = "#ede7d9";
export const ROOF_FILL = "#8d99a8";
export const ROOF_FILL_LIGHT = "#a8b2bf";

/** Flip real-world y (up-positive) into SVG y (down-positive) within a drawing of height H. */
export function flip(points: Point[], H: number): Point[] {
  return points.map((p) => ({ x: p.x, y: H - p.y }));
}

export function toPointsAttr(points: Point[]): string {
  return points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ");
}
