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
    expect(summary.statement).toContain("the replacement of the roof covering");
    expect(summary.statement).toContain("kent peg tile");
    expect(summary.statement).toContain("welsh slate");
    expect(summary.statement).toContain("No alterations are proposed to the building's footprint");
    expect(summary.roofPlanNote).toBe("Roof geometry unchanged — replacement of roof covering only");
  });

  it("describes an extension by its project type and its new blocks", () => {
    const base = caseWith({ caseType: "extension" });
    const summary = describeProposal({
      ...base,
      proposedWings: [wing(), wing({ id: "w2", name: "Rear extension", x: 8 })],
    });
    expect(summary.geometryChanged).toBe(true);
    expect(summary.statement).toContain("an extension to the dwelling");
    expect(summary.statement).toContain("Rear extension (new)");
    expect(summary.roofPlanNote).toBeNull();
    expect(summary.scheduleNote).toContain("floor plans");
  });

  it("falls back to the existing/proposed diff when no type is stated", () => {
    const summary = describeProposal(
      caseWith({ materials: { existing: "Kent peg tile", proposed: "Welsh slate" } }),
    );
    expect(summary.statement).toContain("replacement of the roof covering from kent peg tile to welsh slate");
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
    expect(summary.statement).toContain("Main house (altered)");
    expect(summary.statement).toContain("replacement of the roof covering");
  });
});

describe("caseTypeLabel", () => {
  it("resolves known types and ignores unset ones", () => {
    expect(caseTypeLabel("outbuilding")).toBe("Outbuilding / garage");
    expect(caseTypeLabel(undefined)).toBeUndefined();
  });
});
