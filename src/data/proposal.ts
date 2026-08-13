import type { CaseType, PlanningCase, Wing } from "./types";
import { geometryUnchanged, wingChanges } from "./caseGeometry";

/** The project types offered when a case is created, in the order shown.
 *  `phrase` is the noun phrase the Planning Statement builds its opening
 *  sentence around ("consent for …").
 *
 *  `requires` names the evidence the model must show before that phrase may be
 *  used. A stated type is a statement of intent, not proof: picking "re-roof"
 *  and then leaving both coverings identical must not produce a document
 *  claiming consent for a re-covering. Where the evidence is missing the
 *  statement falls back to the existing↔proposed diff and `typeMismatch` is
 *  raised so the UI can ask the user to sort it out. */
export const CASE_TYPES: { value: CaseType; label: string; hint: string; phrase: string; requires?: "covering" | "geometry" }[] = [
  {
    value: "re-roof",
    label: "Roof covering replacement",
    hint: "Re-roof / re-covering — geometry stays as existing",
    phrase: "the replacement of the roof covering",
    requires: "covering",
  },
  {
    value: "extension",
    label: "Extension",
    hint: "Single or two-storey extension, porch, conservatory",
    phrase: "an extension to the dwelling",
    requires: "geometry",
  },
  {
    value: "loft-dormer",
    label: "Loft conversion / dormer",
    hint: "Roof alterations forming habitable loft space",
    phrase: "a loft conversion with dormer windows",
    requires: "geometry",
  },
  {
    value: "outbuilding",
    label: "Outbuilding / garage",
    hint: "Detached building within the curtilage",
    phrase: "a detached outbuilding within the curtilage",
    requires: "geometry",
  },
  {
    value: "other",
    // Deliberately unconstrained: "external alterations" covers render, solar,
    // joinery swaps and anything else that leaves the block model untouched.
    label: "Other external alterations",
    hint: "Windows, cladding, render, rooflights, anything else",
    phrase: "external alterations to the dwelling",
  },
];

export function caseTypeLabel(caseType: CaseType | undefined): string | undefined {
  return CASE_TYPES.find((t) => t.value === caseType)?.label;
}

const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();

/** "a", "a and b", "a, b and c" — lists read as prose, not as data. */
function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const dedupe = (items: string[]) => [...new Set(items)];

/** A wing's covering label as the documents print it: the block's own
 *  material, falling back to the case-level label for its variant. */
function wingCoveringLabel(planningCase: PlanningCase, w: Wing, proposed: boolean): string {
  return w.material?.trim() || (proposed ? planningCase.materials.proposed : planningCase.materials.existing);
}

/** Ids of proposed blocks whose roof covering differs from their existing
 *  counterpart. With no diverged geometry, a case-level label change means the
 *  whole house is re-covered, so every (non-context) block qualifies. */
export function recoveredWingIds(planningCase: PlanningCase): Set<string> {
  const proposed = planningCase.proposedWings;
  if (!proposed) {
    if (norm(planningCase.materials.existing) === norm(planningCase.materials.proposed)) return new Set();
    return new Set((planningCase.wings ?? []).filter((w) => !w.isContext).map((w) => w.id));
  }
  const existingById = new Map((planningCase.wings ?? []).map((w) => [w.id, w]));
  const ids = new Set<string>();
  for (const w of proposed) {
    if (w.isContext || w.materialUnchanged) continue;
    const prior = existingById.get(w.id);
    // A brand-new block is reported as new geometry, not as a re-covering.
    if (prior && norm(wingCoveringLabel(planningCase, w, true)) !== norm(wingCoveringLabel(planningCase, prior, false))) {
      ids.add(w.id);
    }
  }
  return ids;
}

/** True when the roof covering actually differs between existing and proposed.
 *  Blocks own their coverings, so this compares each proposed block against its
 *  existing counterpart; with no diverged geometry it falls back to the
 *  case-level labels. Never assume a covering change from geometry alone —
 *  a window swap or a render change leaves geometry identical too. */
export function coveringChanged(planningCase: PlanningCase): boolean {
  if (!planningCase.proposedWings) {
    return norm(planningCase.materials.existing) !== norm(planningCase.materials.proposed);
  }
  return recoveredWingIds(planningCase).size > 0;
}

/** The covering labels a variant's documents should quote, derived from the
 *  blocks (deduped, printed as entered) — the case-level `materials` fields are
 *  hidden seeds once blocks carry their own coverings, and quoting them put a
 *  covering the user had long since changed into the Planning Statement. */
export function coveringSummary(planningCase: PlanningCase, proposed: boolean): string {
  const fallback = (proposed ? planningCase.materials.proposed : planningCase.materials.existing) || "not specified";
  // Per-wing overrides describe the wing set they belong to, so they only
  // apply to the proposed variant once proposedWings exists.
  if (proposed && !planningCase.proposedWings) return fallback;
  const wings = ((proposed ? planningCase.proposedWings : undefined) ?? planningCase.wings ?? []).filter((w) => !w.isContext);
  if (!wings.length) return fallback;
  const existingById = new Map((planningCase.wings ?? []).map((w) => [w.id, w]));
  const labels = dedupe(
    wings.map((w) => {
      if (proposed && w.materialUnchanged) {
        const prior = existingById.get(w.id);
        return (prior && wingCoveringLabel(planningCase, prior, false)) || fallback;
      }
      return wingCoveringLabel(planningCase, w, proposed) || fallback;
    }),
  );
  return labels.join("; ") || fallback;
}

export interface ProposalSummary {
  geometryChanged: boolean;
  coveringChanges: boolean;
  /** The stated project type is contradicted by the model — e.g. "re-roof"
   *  with both coverings identical, or "extension" with no geometry change.
   *  The documents word themselves from the diff instead; surface this in the
   *  UI so the user can correct the type or finish the modelling. */
  typeMismatch: boolean;
  /** Sentences for the Planning Statement's "The proposal" section */
  statement: string;
  /** Annotation for the proposed elevations */
  elevationNote: string;
  /** Annotation for the proposed roof plan, when geometry is unchanged */
  roofPlanNote: string | null;
  /** Closing note under the Schedule of Materials; null when there is nothing
   *  the schedule should be asserting on its own account. */
  scheduleNote: string | null;
}

/** Describes the proposal in words, from the stated project type plus what
 *  actually differs between the existing and proposed models. The two are
 *  belt-and-braces: the type gives the application its name, the diff keeps
 *  the detail honest even when the type is unset or the user changed their
 *  mind after picking it. */
export function describeProposal(planningCase: PlanningCase): ProposalSummary {
  const geometryChanged = !geometryUnchanged(planningCase);
  const coveringChanges = coveringChanged(planningCase);
  const changes = wingChanges(planningCase);
  const proposedWings = (planningCase.proposedWings ?? planningCase.wings ?? []).filter((w) => !w.isContext);
  const recovered = recoveredWingIds(planningCase);
  const newNames = proposedWings.filter((w) => changes.newIds.has(w.id)).map((w) => w.name);
  const alteredNames = proposedWings.filter((w) => changes.alteredIds.has(w.id)).map((w) => w.name);
  const recoveredWings = proposedWings.filter((w) => recovered.has(w.id));
  const keptWings = proposedWings.filter((w) => !recovered.has(w.id) && !changes.newIds.has(w.id));
  const keptNames = keptWings.map((w) => w.name);

  // Coverings quoted exactly as the blocks state them, matching the Schedule of
  // Materials. These labels carry proper nouns and acronyms ("Kent peg tile",
  // "Welsh slate", "EPDM"), and lower-casing them put "kent peg tile" in a
  // document going to a council. No case rule distinguishes those from
  // "Concrete tile" reliably, so don't try — a capitalised material name
  // mid-sentence reads fine.
  const existingById = new Map((planningCase.wings ?? []).map((w) => [w.id, w]));
  const existingCovering = recoveredWings.length
    ? joinAnd(dedupe(recoveredWings.map((w) => wingCoveringLabel(planningCase, existingById.get(w.id) ?? w, false))))
    : planningCase.materials.existing || "the existing covering";
  const proposedCovering = recoveredWings.length
    ? joinAnd(dedupe(recoveredWings.map((w) => wingCoveringLabel(planningCase, w, true))))
    : planningCase.materials.proposed || "the proposed covering";

  // The concrete works, drawn from the model rather than assumed from the type.
  // Named plainly — "alterations to Main house and Gable 3", never a
  // semicolon-and-brackets list, which read as machine output.
  //
  // The covering clause carries its own scope, so the works beside it are
  // geometry only. "consent for alterations to Main house, Gable 3, Gable 5 …
  // and the replacement of the roof covering" read as two separate jobs on one
  // roof (owner review, Aug 2026) — and on a re-covering it named the very
  // blocks the covering clause was already about. Naming the re-covered blocks
  // *inside* that clause keeps them in the opening sentence (where they must
  // be: the roof plan badges them ALTERED) without inventing a second work item.
  const coveringScope =
    recoveredWings.length && keptNames.length
      ? ` to ${joinAnd(recoveredWings.map((w) => w.name))}`
      : " across the dwelling";
  const coveringWork = `the replacement of the roof covering${coveringScope}, from ${existingCovering} to ${proposedCovering}`;
  const works: string[] = [];
  if (alteredNames.length) works.push(`alterations to ${joinAnd(alteredNames)}`);
  if (newNames.length) works.push(`the addition of ${joinAnd(newNames)}`);
  if (coveringChanges) works.push(coveringWork);

  // A stated type only names the application when the model backs it up.
  const type = CASE_TYPES.find((t) => t.value === planningCase.caseType);
  const supported =
    !type ? false : type.requires === "covering" ? coveringChanges : type.requires === "geometry" ? geometryChanged : true;
  const typeMismatch = !!type && !supported;
  const phrase = supported ? type!.phrase : undefined;

  const sentences: string[] = [];
  const namesCovering = !!phrase && type!.requires === "covering" && coveringChanges;
  if (namesCovering) {
    // A re-roof's phrase *is* the covering change, so fold the detail into the
    // headline rather than restating it as a component of itself.
    sentences.push(`The application seeks consent for ${coveringWork}.`);
    const rest = works.filter((w) => w !== coveringWork);
    if (rest.length) sentences.push(`The proposal also comprises ${joinAnd(rest)}.`);
  } else if (phrase) {
    sentences.push(`The application seeks consent for ${phrase}${works.length ? `, comprising ${joinAnd(works)}` : ""}.`);
  } else if (works.length) {
    sentences.push(`The application seeks consent for ${joinAnd(works)}.`);
  } else {
    sentences.push("The application seeks consent for the works shown on the proposed drawings.");
  }
  if (!geometryChanged && coveringChanges) {
    // Two plain sentences, not one long negative list. The scope is closed
    // first — the reader has just been told what the works are, so "no other
    // alterations" is the sentence that answers their next question — then the
    // retained elements are named, roofs first: on a partial re-roof, "which
    // roofs are you *not* touching?" is what a validator checks the drawings
    // for.
    sentences.push("No other alterations are proposed; the building's footprint, height and roof form are unchanged.");
    sentences.push(
      keptNames.length
        ? `The ${joinAnd(keptNames)} covering${keptNames.length > 1 ? "s" : ""}, walls, windows, doors and rainwater goods are retained as existing.`
        : "The walls, windows, doors and rainwater goods are retained as existing.",
    );
  } else if (!geometryChanged) {
    // Works the block model can't show (window swaps, render) may still be
    // proposed, so claim only what the model actually establishes.
    sentences.push(
      "No change is proposed to the building's footprint, height or roof form; the extent of the works is shown on the existing and proposed drawings.",
    );
  } else {
    sentences.push(
      "The extent of the works is shown on the existing and proposed drawings; unaltered elements of the house are retained as existing.",
    );
    // Under a mixed scheme the covering clause names only the roofs being
    // replaced, so the ones keeping their covering still need saying.
    if (coveringChanges && keptNames.length) {
      sentences.push(`The roof covering of ${joinAnd(keptNames)} is retained as existing.`);
    }
  }
  const statement = sentences.join(" ");

  const elevationNote = geometryChanged
    ? "See existing drawings for the house as it stands"
    : coveringChanges
      ? "No external alterations proposed other than the change of roof covering"
      : "No alterations proposed to the building's footprint, height or openings";

  const roofPlanNote = geometryChanged
    ? null
    : coveringChanges
      ? "Roof geometry unchanged — replacement of roof covering only"
      : "Roof geometry unchanged";

  // Nothing on a materials schedule should be making claims about geometry.
  // "Proposed geometry differs from existing — refer to the proposed roof plan
  // and elevations for the altered elements." was printed here under a table of
  // materials, restating what the drawings themselves carry, and read as wrong
  // on a real submission. Removed by owner decision (Aug 2026). The two
  // remaining notes stay: they *limit* the application ("no alterations are
  // proposed to…"), which is a statement a schedule is the right place for.
  const scheduleNote = geometryChanged
    ? null
    : coveringChanges
      ? "The proposal is limited to the replacement of the roof covering. No alterations are proposed to the building's footprint, height, openings or any other external element."
      : "No alterations are proposed to the building's footprint, height, openings or roof covering; the works are as scheduled above.";

  return { geometryChanged, coveringChanges, typeMismatch, statement, elevationNote, roofPlanNote, scheduleNote };
}
