import type { PlanningCase, Wing } from "./types";

/** True when the proposed house is geometrically identical to the existing one
 *  (pure material change) — drives the "no external alterations" annotations
 *  in the PDF. Blocks own their coverings, so material fields must be ignored
 *  here or a re-covered block would read as a geometry change; zOrder is a
 *  display-only paint order and is ignored for the same reason. */
export function geometryUnchanged(planningCase: PlanningCase): boolean {
  if (!planningCase.proposedWings) return true;
  const strip = (wings: Wing[]) =>
    JSON.stringify(
      wings.map(
        ({ material: _m, materialColor: _c, materialUnchanged: _u, zOrder: _z, wallMaterial: _w, storeys: _s, roomLabels: _r, ...geometry }) => geometry,
      ),
    );
  return strip(planningCase.proposedWings) === strip(planningCase.wings ?? []);
}

/** Wing-level change classification for the proposed drawings: blocks that
 *  are new or geometrically altered get called out on the proposed pages. */
export function wingChanges(planningCase: PlanningCase): { newIds: Set<string>; alteredIds: Set<string> } {
  const newIds = new Set<string>();
  const alteredIds = new Set<string>();
  if (!planningCase.proposedWings) return { newIds, alteredIds };
  const geom = ({ material: _m, materialColor: _c, materialUnchanged: _u, zOrder: _z, wallMaterial: _w, storeys: _s, roomLabels: _r, ...geometry }: Wing) =>
    JSON.stringify(geometry);
  const existing = new Map((planningCase.wings ?? []).map((w) => [w.id, geom(w)]));
  for (const w of planningCase.proposedWings) {
    if (w.isContext) continue;
    const prior = existing.get(w.id);
    if (prior === undefined) newIds.add(w.id);
    else if (prior !== geom(w)) alteredIds.add(w.id);
  }
  return { newIds, alteredIds };
}
