import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import type { PlanningCase } from "../data/types";
import { PdfBundle } from "./PdfBundle";
import { elevationSetScale } from "./drawingScales";
import { geometryUnchanged, sameGeometry, matchProposedGeometry } from "../data/caseGeometry";

function sampleCase(overrides: Partial<PlanningCase> = {}): PlanningCase {
  return {
    id: "t1",
    address: "12 Example Road, Ramsgate CT11 1AA",
    createdAt: "2026-07-11T10:00:00.000Z",
    updatedAt: "2026-07-11T10:00:00.000Z",
    boundary: [
      { lng: 1.416, lat: 51.335 },
      { lng: 1.4165, lat: 51.335 },
      { lng: 1.4165, lat: 51.3353 },
      { lng: 1.416, lat: 51.3353 },
    ],
    mapCentre: { lng: 1.41625, lat: 51.33515 },
    wings: [
      { id: "w1", name: "Main house", x: 0, y: 0, widthM: 8, depthM: 6, roofType: "gable", pitchDegrees: 40, eaveHeightM: 5 },
      { id: "w2", name: "Rear wing", x: 8, y: 0, widthM: 4, depthM: 3, roofType: "hip", pitchDegrees: 30, eaveHeightM: 2.4 },
    ],
    materials: { existing: "Kent peg tile", proposed: "Grey slate" },
    ...overrides,
  };
}

function pageCount(pdf: Uint8Array): number {
  const text = new TextDecoder("latin1").decode(pdf);
  // Count page objects; "/Type /Page" also prefixes "/Type /Pages" so exclude those.
  const pages = text.match(/\/Type\s*\/Page[^s]/g) ?? [];
  return pages.length;
}

describe("geometryUnchanged", () => {
  it("ignores per-block material fields — a re-covering is not a geometry change", () => {
    const base = sampleCase();
    const proposedWings = base.wings!.map((w) => ({ ...w, material: "Grey slate", materialColor: "#64707d" }));
    expect(geometryUnchanged({ ...base, proposedWings })).toBe(true);
    expect(geometryUnchanged({ ...base, proposedWings: [...proposedWings, { ...proposedWings[0], id: "w9", x: 20 }] })).toBe(false);
  });

  it("ignores editing noise that leaves the built form identical", () => {
    // Each of these once flagged a pure re-covering as "Proposed geometry
    // differs from existing" on the schedule: raw-JSON comparison read
    // renames, materialised defaults and leftover empty arrays as changes.
    const base = sampleCase();
    const noisy = base.wings!.map((w) => ({
      ...w,
      name: `${w.name} (renamed)`,
      rotationDeg: 0 as const,
      openings: [],
      rearPitchDegrees: w.pitchDegrees,
    }));
    expect(geometryUnchanged({ ...base, proposedWings: [...noisy].reverse() })).toBe(true);
    // …while a real change of the same fields still registers
    expect(geometryUnchanged({ ...base, proposedWings: base.wings!.map((w) => ({ ...w, rotationDeg: 90 as const })) })).toBe(false);
  });
});

/** Elevations were fitted per sheet, so adding a wing widened only the proposed
 *  views and dropped them to 1:200 while existing stayed at 1:100 — two sheets
 *  a planning officer is meant to compare directly, drawn at different sizes. */
describe("elevationSetScale", () => {
  const wideWing = { id: "w3", name: "Long range", x: 40, y: 0, widthM: 12, depthM: 6, roofType: "gable" as const, pitchDegrees: 35, eaveHeightM: 4 };

  it("fits a compact house at 1:100", () => {
    expect(elevationSetScale(sampleCase())).toBe(100);
  });

  it("uses one scale for both sets, driven by the widest view in either", () => {
    const base = sampleCase();
    const spread = sampleCase({ proposedWings: [...base.wings!, wideWing] });
    // the proposed set alone forces 1:200 — the existing sheets must follow it
    expect(elevationSetScale(spread)).toBe(200);
    expect(elevationSetScale(sampleCase({ wings: [...base.wings!, wideWing] }))).toBe(200);
  });
});

describe("PdfBundle smoke render", () => {
  it("renders the full 14-page set for a complete case", async () => {
    const pdf: Uint8Array = await renderToBuffer(<PdfBundle planningCase={sampleCase()} />);
    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10_000);
    // location + block plan + 2 roof plans + 8 elevation sheets + schedule + statement
    expect(pageCount(pdf)).toBe(14);
  }, 30_000);

  it("omits the location and block plans when no boundary is drawn", async () => {
    const pdf = await renderToBuffer(<PdfBundle planningCase={sampleCase({ boundary: [] })} />);
    expect(pageCount(pdf)).toBe(12);
  }, 30_000);

  it("renders a north bearing (rotated arrow, wind-named titles) and all opening types", async () => {
    const base = sampleCase();
    const wings = base.wings!.map((w, i) =>
      i === 0
        ? {
            ...w,
            openings: [
              { id: "o1", type: "window" as const, side: "front" as const, offsetM: 1, widthM: 1.2, heightM: 1.2, sillM: 0.9 },
              { id: "o2", type: "garage" as const, side: "front" as const, offsetM: 3, widthM: 2.4, heightM: 2.1, sillM: 0 },
              { id: "o3", type: "open" as const, side: "back" as const, offsetM: 1, widthM: 1.2, heightM: 2.1, sillM: 0 },
            ],
          }
        : w,
    );
    const pdf = await renderToBuffer(<PdfBundle planningCase={sampleCase({ wings, northBearingDeg: 22.5 })} />);
    expect(pageCount(pdf)).toBe(14);
  }, 30_000);

  it("stays at 14 pages for diverged proposed geometry — floor plans are no longer part of the set", async () => {
    const base = sampleCase();
    const proposedWings = [...base.wings!, { id: "w3", name: "Extension", x: 0, y: 6, widthM: 5, depthM: 4, roofType: "mono-pitch" as const, pitchDegrees: 12, eaveHeightM: 2.6, highEdge: "depth-start" as const }];
    const pdf = await renderToBuffer(<PdfBundle planningCase={sampleCase({ proposedWings })} />);
    expect(pageCount(pdf)).toBe(14);
  }, 30_000);

  it("renders rooflights, context blocks, ground offsets, blue line and applicant metadata", async () => {
    const base = sampleCase();
    const wings = base.wings!.map((w, i) =>
      i === 0
        ? {
            ...w,
            rooflights: [{ id: "r1", plane: "front" as const, offsetM: 2, upSlopeM: 1, widthM: 0.78, lengthM: 1.4 }],
            groundOffsetM: 0.4,
            storeys: 2,
            roomLabels: ["Kitchen, Living room", "Bedroom 1, Bathroom"],
            wallMaterial: "Red stock brick",
          }
        : { ...w, isContext: true },
    );
    const pdf = await renderToBuffer(
      <PdfBundle
        planningCase={sampleCase({
          wings,
          applicant: "Mr & Mrs Smith",
          agent: "Jones Roofing Ltd",
          joineryMaterial: "White uPVC",
          rainwaterMaterial: "Black uPVC",
          blueLine: [
            { lng: 1.4166, lat: 51.335 },
            { lng: 1.417, lat: 51.335 },
            { lng: 1.417, lat: 51.3353 },
          ],
        })}
      />,
    );
    // legacy storeys/rooms fields no longer add floor plan pages
    expect(pageCount(pdf)).toBe(14);
  }, 30_000);
});

/** The composer arms a drag on pointerdown, because that is also how a block is
 *  selected — so one pixel of jitter while clicking a block to change its
 *  covering used to re-snap it to the grid. A 10 cm nudge is invisible at 1:100
 *  but not to `geometryKey`, so a pure re-covering printed "(altered)" labels,
 *  "alterations to Main house…" and "Proposed geometry differs from existing".
 *  The threshold in dragThreshold.ts stops it happening; this covers the repair
 *  for sets already carrying the nudge. */
describe("matchProposedGeometry", () => {
  const base = sampleCase();
  const nudged = () =>
    base.wings!.map((w, i) =>
      i === 0
        ? { ...w, x: w.x + 0.1, material: "Grey slate", materialColor: "#64707d", name: "Main house" }
        : { ...w, material: "Grey slate" },
    );

  it("restores the existing shapes while keeping the proposed coverings", () => {
    const proposed = nudged();
    expect(sameGeometry(base.wings!, proposed)).toBe(false);
    const repaired = matchProposedGeometry(base.wings!, proposed);
    expect(sameGeometry(base.wings!, repaired)).toBe(true);
    // the covering is the whole point of the case — it must survive the repair
    expect(repaired.map((w) => w.material)).toEqual(["Grey slate", "Grey slate"]);
    expect(repaired[0].materialColor).toBe("#64707d");
  });

  it("leaves a genuinely new proposed block alone", () => {
    const extension = { id: "w9", name: "Rear extension", x: 0, y: 6, widthM: 5, depthM: 4, roofType: "flat" as const, pitchDegrees: 0, eaveHeightM: 2.6 };
    const repaired = matchProposedGeometry(base.wings!, [...nudged(), extension]);
    expect(repaired.find((w) => w.id === "w9")).toEqual(extension);
  });
});
