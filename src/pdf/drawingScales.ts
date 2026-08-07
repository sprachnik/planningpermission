import type { PlanningCase, Wing } from "../data/types";
import { elevationScene } from "../geometry/composite";
import type { Direction } from "../geometry/composite";
import { fitDrawingScale, CONTENT_HEIGHT_MM } from "./scale";
import { CAPTION_BAND_MM } from "./DrawingKit";

/** Order the elevation sheets are issued in. */
export const ELEVATION_DIRS: Direction[] = ["S", "E", "N", "W"];
/** How far the drawn ground line runs past the building on each side. */
export const GROUND_OVERHANG_M = 0.8;

/** The wing set a page should draw: proposed pages use proposedWings when the geometry diverged. */
export function wingsFor(planningCase: PlanningCase, proposed: boolean): Wing[] {
  return (proposed ? planningCase.proposedWings : undefined) ?? planningCase.wings!;
}

/** One scale for every elevation sheet in the set, existing and proposed alike.
 *  An officer reads the two side by side to judge what changes; sheets at
 *  different scales make that comparison misleading, so the whole set fits to
 *  the largest view rather than each sheet fitting itself. */
export function elevationSetScale(planningCase: PlanningCase): number {
  let width = 0;
  let height = 0;
  for (const proposed of [false, true]) {
    const wings = wingsFor(planningCase, proposed);
    if (!wings.length) continue;
    for (const dir of ELEVATION_DIRS) {
      const scene = elevationScene(wings, dir);
      // the ground line runs past the building, so it sets the true width
      width = Math.max(width, scene.widthM + GROUND_OVERHANG_M * 2);
      height = Math.max(height, scene.heightM);
    }
  }
  return fitDrawingScale({ width, height }, 100, CONTENT_HEIGHT_MM - CAPTION_BAND_MM);
}
