import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import type { PlanningCase } from "../data/types";
import { PdfBundle } from "./PdfBundle";

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

describe("PdfBundle smoke render", () => {
  it("renders the full 8-page set for a complete case", async () => {
    const pdf: Uint8Array = await renderToBuffer(<PdfBundle planningCase={sampleCase()} />);
    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10_000);
    // location + 2 roof plans + 4 elevation sheets + schedule
    expect(pageCount(pdf)).toBe(8);
  }, 30_000);

  it("omits the location plan when no boundary is drawn", async () => {
    const pdf = await renderToBuffer(<PdfBundle planningCase={sampleCase({ boundary: [] })} />);
    expect(pageCount(pdf)).toBe(7);
  }, 30_000);

  it("renders diverged proposed geometry (extension) without error", async () => {
    const base = sampleCase();
    const proposedWings = [...base.wings!, { id: "w3", name: "Extension", x: 0, y: 6, widthM: 5, depthM: 4, roofType: "mono-pitch" as const, pitchDegrees: 12, eaveHeightM: 2.6, highEdge: "depth-start" as const }];
    const pdf = await renderToBuffer(<PdfBundle planningCase={sampleCase({ proposedWings })} />);
    expect(pageCount(pdf)).toBe(8);
  }, 30_000);
});
