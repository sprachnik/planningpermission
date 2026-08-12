import { describe, it, expect } from "vitest";
import { describeProposal, coveringChanged, caseTypeLabel } from "./proposal";
import type { PlanningCase, Wing } from "./types";

const wing = (over: Partial<Wing> = {}): Wing => ({
  id: "w1",
  name: "Main house",
  x: 0,
  y: 0,
  widthM: 8,
  depthM: 6,
  roofType: "gable",
  pitchDegrees: 40,
  eaveHeightM: 5,
  ...over,
});

const caseWith = (over: Partial<PlanningCase> = {}): PlanningCase => ({
  id: "c1",
  address: "12 Example Road",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  boundary: [],
  wings: [wing()],
  materials: { existing: "Concrete interlocking tile", proposed: "Concrete interlocking tile" },
  ...over,
});

describe("coveringChanged", () => {
  it("is false when existing and proposed labels match", () => {
    expect(coveringChanged(caseWith())).toBe(false);
  });

  it("is true when the case-level labels differ and geometry has not diverged", () => {
    expect(coveringChanged(caseWith({ materials: { existing: "Kent peg tile", proposed: "Welsh slate" } }))).toBe(true);
  });

  it("compares per-block coverings once proposed geometry exists", () => {
    const base = caseWith({ wings: [wing({ material: "Kent peg tile" })] });
    expect(coveringChanged({ ...base, proposedWings: [wing({ material: "Kent peg tile" })] })).toBe(false);
    expect(coveringChanged({ ...base, proposedWings: [wing({ material: "Welsh slate" })] })).toBe(true);
  });

  it("respects the per-block 'covering unchanged' flag", () => {
    const base = caseWith({
      wings: [wing({ material: "Kent peg tile" })],
      materials: { existing: "Kent peg tile", proposed: "Welsh slate" },
    });
    expect(coveringChanged({ ...base, proposedWings: [wing({ materialUnchanged: true })] })).toBe(false);
  });

  it("does not read a brand-new block as a re-covering", () => {
    const base = caseWith({ materials: { existing: "Kent peg tile", proposed: "Kent peg tile" } });
    const extension = wing({ id: "w2", name: "Rear extension", x: 8, material: "Welsh slate" });
    expect(coveringChanged({ ...base, proposedWings: [wing(), extension] })).toBe(false);
  });
});

describe("describeProposal", () => {
  it("does not claim a roof re-covering when only the windows change", () => {
    // Geometry identical and covering identical: the old code asserted a
    // re-covering here purely because geometryUnchanged() was true.
    const summary = describeProposal(caseWith({ caseType: "other" }));
    expect(summary.coveringChanges).toBe(false);
    expect(summary.statement).not.toMatch(/roof covering/i);
    expect(summary.statement).toContain("external alterations to the dwelling");
    expect(summary.scheduleNote).not.toMatch(/replacement of the roof covering/i);
    expect(summary.elevationNote).not.toMatch(/roof covering/i);
  });

  it("names a re-roof and its coverings when the type says so", () => {
    const summary = describeProposal(
      caseWith({ caseType: "re-roof", materials: { existing: "Kent peg tile", proposed: "Welsh slate" } }),
    );
    expect(summary.statement).toContain("replace the existing roof covering across the dwelling");
    // printed as entered, matching the schedule — never lower-cased
    expect(summary.statement).toContain("Kent peg tile");
    expect(summary.statement).toContain("Welsh slate");
    expect(summary.statement).toContain("No change is proposed to the building's footprint");
    expect(summary.roofPlanNote).toBe("Roof geometry unchanged — replacement of roof covering only");
  });

  it("quotes the blocks' own coverings, never the stale case-level seed", () => {
    // The case-level labels are hidden seeds once blocks carry coverings —
    // this user changed every block to Charcoal Grey but the statement kept
    // quoting the seed's "Blue-grey composite textured slate".
    const summary = describeProposal(
      caseWith({
        caseType: "re-roof",
        materials: { existing: "Kent peg tile", proposed: "Blue-grey composite textured slate" },
        wings: [wing({ material: "Kent peg tile" }), wing({ id: "w2", name: "Flat roof", x: 8, roofType: "flat", material: "EPDM" })],
        proposedWings: [
          wing({ material: "Charcoal Grey composite slate" }),
          wing({ id: "w2", name: "Flat roof", x: 8, roofType: "flat", material: "EPDM", materialUnchanged: true }),
        ],
      }),
    );
    expect(summary.geometryChanged).toBe(false);
    expect(summary.statement).toContain("Charcoal Grey composite slate");
    expect(summary.statement).not.toContain("Blue-grey");
    // no "(altered)" brackets — the works read as prose
    expect(summary.statement).not.toMatch(/\((altered|new)\)/);
    expect(summary.statement).toContain("The works affect Main house; the roof covering of Flat roof is retained as existing.");
  });

  it("describes an extension by its project type and its new blocks", () => {
    const base = caseWith({ caseType: "extension" });
    const summary = describeProposal({
      ...base,
      proposedWings: [wing(), wing({ id: "w2", name: "Rear extension", x: 8 })],
    });
    expect(summary.geometryChanged).toBe(true);
    expect(summary.statement).toContain("an extension to the dwelling");
    expect(summary.statement).toContain("the addition of Rear extension");
    expect(summary.roofPlanNote).toBeNull();
    // The schedule says nothing about geometry — see the note below.
    expect(summary.scheduleNote).toBeNull();
  });

  it("falls back to the existing/proposed diff when no type is stated", () => {
    const summary = describeProposal(
      caseWith({ materials: { existing: "Kent peg tile", proposed: "Welsh slate" } }),
    );
    expect(summary.statement).toContain("replacement of the roof covering from Kent peg tile to Welsh slate");
  });

  it("stays honest when nothing at all differs", () => {
    const summary = describeProposal(caseWith());
    expect(summary.statement).toContain("the works shown on the proposed drawings");
    expect(summary.elevationNote).toBe("No alterations proposed to the building's footprint, height or openings");
  });

  it("combines a type with works it does not itself imply", () => {
    const base = caseWith({ caseType: "loft-dormer", materials: { existing: "Kent peg tile", proposed: "Welsh slate" } });
    const summary = describeProposal({
      ...base,
      wings: [wing({ material: "Kent peg tile" })],
      proposedWings: [wing({ material: "Welsh slate", eaveHeightM: 5.6 })],
    });
    expect(summary.statement).toContain("a loft conversion with dormer windows");
    expect(summary.statement).toContain("alterations to Main house");
    expect(summary.statement).toContain("replacement of the roof covering");
  });
});

/** The gap that produced a real bad document: the project type was trusted on
 *  its own, so a case typed "re-roof" whose coverings were identical still
 *  asked for consent to replace the roof covering — on the same page that said
 *  the covering was unchanged. */
describe("describeProposal — stated type contradicted by the model", () => {
  it("does not claim a re-covering for a re-roof case whose coverings are identical", () => {
    const result = describeProposal(
      caseWith({
        caseType: "re-roof",
        wings: [wing({ material: "Kent peg tile" })],
        proposedWings: [wing({ material: "Kent peg tile", widthM: 10 })],
      }),
    );
    expect(result.coveringChanges).toBe(false);
    expect(result.typeMismatch).toBe(true);
    expect(result.statement).not.toMatch(/(replacement of|replace) the (existing )?roof covering/i);
    // …and still describes what genuinely changed
    expect(result.statement).toMatch(/alterations to Main house/);
  });

  it("keeps the re-roof wording when the covering really does change", () => {
    const result = describeProposal(
      caseWith({ caseType: "re-roof", materials: { existing: "Kent peg tile", proposed: "Welsh slate" } }),
    );
    expect(result.typeMismatch).toBe(false);
    expect(result.statement).toMatch(/replace the existing roof covering/i);
  });

  it("does not claim an extension when no geometry diverged", () => {
    const result = describeProposal(
      caseWith({ caseType: "extension", materials: { existing: "Kent peg tile", proposed: "Welsh slate" } }),
    );
    expect(result.typeMismatch).toBe(true);
    expect(result.statement).not.toMatch(/an extension to the dwelling/i);
    expect(result.statement).toMatch(/replacement of the roof covering/i);
  });

  it("lets 'other' stand without geometry or covering evidence", () => {
    const result = describeProposal(caseWith({ caseType: "other" }));
    expect(result.typeMismatch).toBe(false);
    expect(result.statement).toMatch(/external alterations to the dwelling/i);
  });
});

/** Reviewing a real generated set (Aug 2026): a block that was being stripped
 *  and re-tiled, but not reshaped, was badged ALTERED on the proposed roof plan
 *  and then left out of the statement's opening sentence and the elevation
 *  footnote — both of which listed geometry changes only. Sheets in one set
 *  disagreeing about the extent of the works is a validation problem. */
describe("describeProposal — blocks affected by the works", () => {
  const mixedCase = () =>
    caseWith({
      materials: { existing: "Kent peg tile", proposed: "Charcoal Grey composite slate" },
      wings: [
        wing({ material: "Kent peg tile" }),
        wing({ id: "w2", name: "Front lower roof", x: 8, material: "Kent peg tile" }),
        wing({ id: "w3", name: "Flat roof", x: 16, roofType: "flat", material: "Black roof felt" }),
      ],
      proposedWings: [
        // reshaped and re-covered
        wing({ material: "Charcoal Grey composite slate", eaveHeightM: 5.4 }),
        // re-covered only — the block that went missing
        wing({ id: "w2", name: "Front lower roof", x: 8, material: "Charcoal Grey composite slate" }),
        // untouched
        wing({ id: "w3", name: "Flat roof", x: 16, roofType: "flat", material: "Black roof felt" }),
      ],
    });

  it("names a re-covered block alongside the reshaped ones", () => {
    const summary = describeProposal(mixedCase());
    expect(summary.geometryChanged).toBe(true);
    expect(summary.statement).toContain("alterations to Main house and Front lower roof");
    expect(summary.statement).toContain("replacement of the roof covering");
    // the block whose covering is genuinely retained stays out of it
    expect(summary.statement).not.toContain("Flat roof");
  });

  it("does not restate the re-covering as a separate alteration under a re-roof headline", () => {
    // caseType re-roof leads with the covering change; listing "alterations to
    // Front lower roof" beside it would describe the headline twice.
    const summary = describeProposal({ ...mixedCase(), caseType: "re-roof" });
    expect(summary.statement).toMatch(/replace the existing roof covering/i);
    expect(summary.statement).toContain("The proposal also comprises alterations to Main house.");
    expect(summary.statement).not.toContain("alterations to Main house and Front lower roof");
  });

  it("leaves a pure re-covering described as exactly that", () => {
    // No geometry change: "alterations to Main house" here would imply works
    // beyond the re-roof the covering clause already describes.
    const summary = describeProposal(caseWith({ materials: { existing: "Kent peg tile", proposed: "Welsh slate" } }));
    expect(summary.statement).not.toMatch(/alterations to/);
    expect(summary.statement).toContain("replacement of the roof covering");
  });
});

/** The Schedule of Materials used to close with "Proposed geometry differs from
 *  existing — refer to the proposed roof plan and elevations for the altered
 *  elements." Owner decision (Aug 2026): a materials schedule does not make
 *  claims about geometry. */
describe("describeProposal — the schedule's closing note", () => {
  it("asserts nothing about geometry when the geometry has changed", () => {
    const summary = describeProposal(
      caseWith({ caseType: "extension", proposedWings: [wing(), wing({ id: "w2", name: "Rear extension", x: 8 })] }),
    );
    expect(summary.geometryChanged).toBe(true);
    expect(summary.scheduleNote).toBeNull();
  });

  it("keeps the notes that limit the application", () => {
    const recovering = describeProposal(caseWith({ materials: { existing: "Kent peg tile", proposed: "Welsh slate" } }));
    expect(recovering.scheduleNote).toContain("limited to the replacement of the roof covering");
    expect(describeProposal(caseWith()).scheduleNote).toContain("No alterations are proposed");
  });
});

describe("caseTypeLabel", () => {
  it("resolves known types and ignores unset ones", () => {
    expect(caseTypeLabel("outbuilding")).toBe("Outbuilding / garage");
    expect(caseTypeLabel(undefined)).toBeUndefined();
  });
});
