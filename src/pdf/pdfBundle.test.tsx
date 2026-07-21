import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import type { PlanningCase } from "../data/types";
import { PdfBundle } from "./PdfBundle";
import { geometryUnchanged } from "../data/caseGeometry";

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
});

describe("PdfBundle smoke render", () => {
  it("renders the full 10-page set for a complete case", async () => {
    const pdf: Uint8Array = await renderToBuffer(<PdfBundle planningCase={sampleCase()} />);
    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10_000);
    // location + block plan + 2 roof plans + 4 elevation sheets + schedule + statement
    expect(pageCount(pdf)).toBe(10);
  }, 30_000);

  it("omits the location and block plans when no boundary is drawn", async () => {
    const pdf = await renderToBuffer(<PdfBundle planningCase={sampleCase({ boundary: [] })} />);
    expect(pageCount(pdf)).toBe(8);
  }, 30_000);

  it("renders a north bearing (rotated arrow, wind-suffixed titles) and all opening types", async () => {
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
    expect(pageCount(pdf)).toBe(10);
  }, 30_000);

  it("adds floor plans for diverged proposed geometry (extension)", async () => {
    const base = sampleCase();
    const proposedWings = [...base.wings!, { id: "w3", name: "Extension", x: 0, y: 6, widthM: 5, depthM: 4, roofType: "mono-pitch" as const, pitchDegrees: 12, eaveHeightM: 2.6, highEdge: "depth-start" as const }];
    const pdf = await renderToBuffer(<PdfBundle planningCase={sampleCase({ proposedWings })} />);
    // the extension case pulls in existing + proposed floor plans
    expect(pageCount(pdf)).toBe(12);
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
    // storeys/rooms set → floor plans included
    expect(pageCount(pdf)).toBe(12);
  }, 30_000);
});
