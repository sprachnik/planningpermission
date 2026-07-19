import type { PlanningCase, Wing } from "./types";

/** True when the proposed house is geometrically identical to the existing one
 *  (pure material change) — drives the "no external alterations" annotations
 *  in the PDF. Blocks own their coverings, so material fields must be ignored
 *  here or a re-covered block would read as a geometry change. */
export function geometryUnchanged(planningCase: PlanningCase): boolean {
  if (!planningCase.proposedWings) return true;
  const strip = (wings: Wing[]) =>
    JSON.stringify(wings.map(({ material: _m, materialColor: _c, materialUnchanged: _u, ...geometry }) => geometry));
  return strip(planningCase.proposedWings) === strip(planningCase.wings ?? []);
}
