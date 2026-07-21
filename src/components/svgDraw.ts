import type { Point } from "../geometry/roof";
import type { Opening } from "../data/types";

// Shared drawing palette for on-screen previews, the plan canvas, and the PDF
export const WALL_FILL = "#ede7d9";
export const ROOF_FILL = "#8d99a8";
export const ROOF_FILL_LIGHT = "#a8b2bf";

// Default roof swatches matching the default materials (peg tile / grey slate)
export const DEFAULT_EXISTING_ROOF_COLOR = "#c1683c";
export const DEFAULT_PROPOSED_ROOF_COLOR = "#64707d";

export function roofColorFor(materials: { existingColor?: string; proposedColor?: string }, proposed: boolean): string {
  return proposed
    ? (materials.proposedColor ?? DEFAULT_PROPOSED_ROOF_COLOR)
    : (materials.existingColor ?? DEFAULT_EXISTING_ROOF_COLOR);
}

/** Mix a hex colour toward white (amount 0..1) — used to shade adjacent roof planes. */
export function lighten(hex: string, amount: number): string {
  const n = hex.replace("#", "");
  const channel = (i: number) => {
    const c = parseInt(n.slice(i, i + 2), 16);
    return Math.round(c + (255 - c) * amount)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

/** Flip real-world y (up-positive) into SVG y (down-positive) within a drawing of height H. */
export function flip(points: Point[], H: number): Point[] {
  return points.map((p) => ({ x: p.x, y: H - p.y }));
}

export function toPointsAttr(points: Point[]): string {
  return points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ");
}

// Context-only neighbour buildings render muted so the application property reads clearly
export const CONTEXT_WALL_FILL = "#f4f3f0";
export const CONTEXT_ROOF_FILL = "#d4d6d9";

/** Fill for a projected opening face. Doors/windows/garage doors read as white
 *  joinery; an open doorway (porch/carport aperture) reads as a dark void;
 *  a rooflight reads as glass on the slope. */
export function openingFill(type?: Opening["type"] | "rooflight"): string {
  if (type === "open") return "#8c8c8c";
  if (type === "rooflight") return "#dbe7f0";
  return "#ffffff";
}

/** Horizontal panel lines that make a garage door read as a sectional door.
 *  Opening faces are quads in the order bottom-left → bottom-right →
 *  top-right → top-left (preserved by the true rotations and the linear
 *  projections), so interpolating between the bottom and top edges yields
 *  correctly foreshortened lines in any view. Same space in, same space out. */
export function garagePanelLines(points: Point[]): [Point, Point][] {
  if (points.length !== 4) return [];
  const [bl, br, tr, tl] = points;
  const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  return [0.25, 0.5, 0.75].map((t) => [lerp(bl, tl, t), lerp(br, tr, t)]);
}
