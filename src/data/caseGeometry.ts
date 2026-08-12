import type { PlanningCase, Wing } from "./types";
import { wingRotation } from "../geometry/faces3d";

/** Canonical serialisation of the fields that shape a wing's built form —
 *  and nothing else. Comparing raw wing JSON read editing noise as geometry
 *  change: a rename, a reordered block list, `rotationDeg: 0` written where it
 *  was previously unset, an `openings: []` left behind by deleting the last
 *  window, or a chimney whose default "ridge" position became explicit. Any of
 *  those put a spurious "Proposed geometry differs from existing" on the
 *  schedule of a pure re-covering. So: identity/display fields (name, ids,
 *  zOrder, storeys, roomLabels, materials) are excluded, defaults are
 *  materialised, irrelevant fields are dropped per roof type, and unordered
 *  lists are sorted. */
function geometryKey(w: Wing): string {
  const openings = (w.openings ?? [])
    .map((o) => JSON.stringify([o.type, o.side, o.offsetM, o.widthM, o.heightM, o.sillM]))
    .sort();
  const rooflights = (w.rooflights ?? [])
    .map((r) => JSON.stringify([r.plane, r.offsetM, r.upSlopeM, r.widthM, r.lengthM]))
    .sort();
  const chimney = w.chimney
    ? [w.chimney.position ?? "ridge", w.chimney.offsetM, w.chimney.alongM ?? 0.9, w.chimney.acrossM ?? 0.5]
    : null;
  // A rear pitch equal to the front pitch *is* the symmetric roof.
  const rearPitch =
    w.roofType === "gable" && w.rearPitchDegrees != null && w.rearPitchDegrees !== w.pitchDegrees
      ? w.rearPitchDegrees
      : null;
  return JSON.stringify([
    w.x,
    w.y,
    w.widthM,
    w.depthM,
    w.roofType,
    w.roofType === "flat" ? 0 : w.pitchDegrees,
    rearPitch,
    w.eaveHeightM,
    w.roofType === "mono-pitch" ? (w.highEdge ?? "width-end") : null,
    wingRotation(w),
    w.groundOffsetM ?? 0,
    w.isContext ?? false,
    openings,
    rooflights,
    chimney,
  ]);
}

/** True when the proposed house is geometrically identical to the existing one
 *  (pure material change) — drives the "no external alterations" annotations
 *  in the PDF. Compares canonical geometry only (see `geometryKey`), keyed and
 *  sorted by id so reordering the block list is not a change. */
export function geometryUnchanged(planningCase: PlanningCase): boolean {
  if (!planningCase.proposedWings) return true;
  return sameGeometry(planningCase.wings ?? [], planningCase.proposedWings);
}

/** True when two wing sets describe the same built form. */
export function sameGeometry(existing: Wing[], proposed: Wing[]): boolean {
  const key = (wings: Wing[]) => JSON.stringify(wings.map((w) => [w.id, geometryKey(w)]).sort());
  return key(existing) === key(proposed);
}

/** Copies the existing blocks' shape and placement onto the proposed ones,
 *  keeping everything the proposed house owns in its own right — its coverings,
 *  names and layer order. Blocks that exist only on the proposed house (a real
 *  extension) are left alone.
 *
 *  This is the repair for a case whose proposed geometry drifted by accident.
 *  Until the drag threshold landed, clicking a block to change its covering
 *  could re-snap it to the grid, and a set built entirely before that fix can
 *  still be carrying a 10 cm nudge that reads as "alterations to Main house" in
 *  the Planning Statement. "Reset to existing" would fix the geometry by
 *  throwing away every proposed covering too — on a re-roof, the whole job. */
export function matchProposedGeometry(existing: Wing[], proposed: Wing[]): Wing[] {
  const existingById = new Map(existing.map((w) => [w.id, w]));
  return proposed.map((p) => {
    const e = existingById.get(p.id);
    if (!e) return p;
    return {
      ...e,
      name: p.name,
      zOrder: p.zOrder,
      material: p.material,
      materialColor: p.materialColor,
      materialUnchanged: p.materialUnchanged,
      wallMaterial: p.wallMaterial,
    };
  });
}

/** Wing-level change classification for the proposed drawings: blocks that
 *  are new or geometrically altered get called out on the proposed pages. */
export function wingChanges(planningCase: PlanningCase): { newIds: Set<string>; alteredIds: Set<string> } {
  const newIds = new Set<string>();
  const alteredIds = new Set<string>();
  if (!planningCase.proposedWings) return { newIds, alteredIds };
  const existing = new Map((planningCase.wings ?? []).map((w) => [w.id, geometryKey(w)]));
  for (const w of planningCase.proposedWings) {
    if (w.isContext) continue;
    const prior = existing.get(w.id);
    if (prior === undefined) newIds.add(w.id);
    else if (prior !== geometryKey(w)) alteredIds.add(w.id);
  }
  return { newIds, alteredIds };
}
