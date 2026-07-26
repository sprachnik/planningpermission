import type { PlanningCase, Wing } from "../data/types";
import { planScene, elevationScene } from "../geometry/composite";
import type { Direction } from "../geometry/composite";
import { fitDrawingScale, CONTENT_HEIGHT_MM } from "./scale";
import { CAPTION_BAND_MM } from "./DrawingKit";

/** Order the elevation sheets are issued in. */
export const ELEVATION_DIRS: Direction[] = ["S", "E", "N", "W"];
/** How far the drawn ground line runs past the building on each side. */
export const GROUND_OVERHANG_M = 0.8;

export const FLOOR_FRAME_GAP_M = 3;
export const FLOOR_TITLE_H_M = 2;

/** The wing set a page should draw: proposed pages use proposedWings when the geometry diverged. */
export function wingsFor(planningCase: PlanningCase, proposed: boolean): Wing[] {
  return (proposed ? planningCase.proposedWings : undefined) ?? planningCase.wings!;
}

/** Storeys a block contributes to the floor plans: explicit setting, else a
 *  conservative guess from the eaves (two storeys needs ~4.4 m of wall). */
export function effectiveStoreys(w: Wing): number {
  return w.storeys ?? (w.eaveHeightM >= 4.4 ? 2 : 1);
}

/** Shared by the floor-plans page and its set-scale fit, so both agree on the extent. */
export function floorPlansLayout(planningCase: PlanningCase, proposed: boolean) {
  const wings = wingsFor(planningCase, proposed).filter((w) => !w.isContext);
  const scene = planScene(wings.length ? wings : wingsFor(planningCase, proposed));
  const levels = Math.max(1, ...wings.map(effectiveStoreys));
  return {
    wings,
    scene,
    levels,
    extent: {
      width: levels * scene.widthM + (levels - 1) * FLOOR_FRAME_GAP_M,
      height: scene.heightM + FLOOR_TITLE_H_M,
    },
  };
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

/** As with elevations: existing and proposed floor plans share one scale. */
export function floorPlanSetScale(planningCase: PlanningCase): number {
  let width = 0;
  let height = 0;
  for (const proposed of [false, true]) {
    const { extent } = floorPlansLayout(planningCase, proposed);
    width = Math.max(width, extent.width);
    height = Math.max(height, extent.height);
  }
  return fitDrawingScale({ width, height });
}
