import type { Point } from "../geometry/roof";

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
