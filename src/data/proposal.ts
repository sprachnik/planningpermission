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


/** True when the roof covering actually differs between existing and proposed.
 *  Blocks own their coverings, so this compares each proposed block against its
 *  existing counterpart; with no diverged geometry it falls back to the
 *  case-level labels. Never assume a covering change from geometry alone —
 *  a window swap or a render change leaves geometry identical too. */
export function coveringChanged(planningCase: PlanningCase): boolean {
  const proposed = planningCase.proposedWings;
  if (!proposed) return norm(planningCase.materials.existing) !== norm(planningCase.materials.proposed);
  const existingById = new Map((planningCase.wings ?? []).map((w) => [w.id, w]));
  const covering = (w: Wing, isProposed: boolean) =>
    norm(w.material || (isProposed ? planningCase.materials.proposed : planningCase.materials.existing));
  return proposed.some((w) => {
    if (w.isContext || w.materialUnchanged) return false;
    const prior = existingById.get(w.id);
    // A brand-new block is reported as new geometry, not as a re-covering.
    return prior ? covering(w, true) !== covering(prior, false) : false;
  });
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
  /** Closing note under the Schedule of Materials */
  scheduleNote: string;
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
  const changed = proposedWings.filter((w) => changes.newIds.has(w.id) || changes.alteredIds.has(w.id));
  const existingCovering = planningCase.materials.existing || "the existing covering";
  const proposedCovering = planningCase.materials.proposed || "the proposed covering";

  // The concrete works, drawn from the model rather than assumed from the type.
  const works: string[] = [];
  if (changed.length) {
    works.push(
      `alterations to ${changed.map((w) => `${w.name} (${changes.newIds.has(w.id) ? "new" : "altered"})`).join("; ")}`,
    );
  }
  // Printed exactly as entered, matching the Schedule of Materials. These
  // labels carry proper nouns and acronyms ("Kent peg tile", "Welsh slate",
  // "EPDM"), and lower-casing them put "kent peg tile" in a document going to a
  // council. No case rule distinguishes those from "Concrete tile" reliably, so
  // don't try — a capitalised material name mid-sentence reads fine.
  const coveringWork = `replacement of the roof covering from ${existingCovering} to ${proposedCovering}`;
  if (coveringChanges) works.push(coveringWork);

  // A stated type only names the application when the model backs it up.
  const type = CASE_TYPES.find((t) => t.value === planningCase.caseType);
  const supported =
    !type ? false : type.requires === "covering" ? coveringChanges : type.requires === "geometry" ? geometryChanged : true;
  const typeMismatch = !!type && !supported;
  const phrase = supported ? type!.phrase : undefined;

  let statement: string;
  if (phrase) {
    // A re-roof's phrase *is* the covering change, so listing that change again
    // as a component of itself read "consent for the replacement of the roof
    // covering, comprising replacement of the roof covering from X to Y".
    // Fold the detail into the headline and let anything else follow it.
    const namesCovering = type!.requires === "covering" && coveringChanges;
    const headline = namesCovering ? `the ${coveringWork}` : phrase;
    const rest = namesCovering ? works.filter((w) => w !== coveringWork) : works;
    const joined = rest.join(" and ");
    statement = `The application seeks consent for ${headline}${
      rest.length ? `${namesCovering ? ", together with " : ", comprising "}${joined}` : ""
    }.`;
  } else if (works.length) {
    statement = `The application seeks consent for ${works.join(" and ")}.`;
  } else {
    statement = "The application seeks consent for the works shown on the proposed drawings.";
  }
  if (!geometryChanged) {
    statement +=
      " No alterations are proposed to the building's footprint, height, openings or any other external element.";
  } else {
    statement +=
      " The extent of the works is shown on the existing and proposed drawings; unaltered elements of the house are retained as existing.";
  }

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

  const scheduleNote = geometryChanged
    ? "Proposed geometry differs from existing — refer to the proposed roof plan, floor plans and elevations for the altered elements."
    : coveringChanges
      ? "The proposal is limited to the replacement of the roof covering. No alterations are proposed to the building's footprint, height, openings or any other external element."
      : "No alterations are proposed to the building's footprint, height, openings or roof covering; the works are as scheduled above.";

  return { geometryChanged, coveringChanges, typeMismatch, statement, elevationNote, roofPlanNote, scheduleNote };
}
