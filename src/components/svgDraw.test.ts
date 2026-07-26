import { describe, it, expect } from "vitest";
import { colorForMaterial, variantRoofColor, DEFAULT_EXISTING_ROOF_COLOR, DEFAULT_PROPOSED_ROOF_COLOR } from "./svgDraw";

describe("colorForMaterial", () => {
  it("matches the specific rule, not the generic one", () => {
    // all three end in "tile" — the generic /tile/ rule must lose to each
    const peg = colorForMaterial("Kent peg tile");
    const concrete = colorForMaterial("Concrete interlocking tile");
    const pan = colorForMaterial("Clay pantile");
    expect(new Set([peg, concrete, pan]).size).toBe(3);
  });

  it("is case-insensitive and ignores surrounding text", () => {
    expect(colorForMaterial("  WELSH SLATE  ")).toBe(colorForMaterial("Grey slate"));
  });

  it("returns undefined for blank or bespoke labels", () => {
    expect(colorForMaterial("")).toBeUndefined();
    expect(colorForMaterial("   ")).toBeUndefined();
    expect(colorForMaterial(undefined)).toBeUndefined();
    expect(colorForMaterial("Reclaimed something bespoke")).toBeUndefined();
  });
});

/** The reported defect: a re-covering whose existing and proposed elevations
 *  rendered identically, because the swatch came from the variant rather than
 *  from the material actually named on each side. */
describe("variantRoofColor", () => {
  const materials = { existing: "Kent peg tile", proposed: "Grey slate" };

  it("distinguishes the two sides of a real re-covering", () => {
    expect(variantRoofColor(materials, false, true)).not.toBe(variantRoofColor(materials, true, true));
  });

  it("follows the material name over the variant default", () => {
    expect(variantRoofColor(materials, false, true)).toBe(colorForMaterial("Kent peg tile"));
    expect(variantRoofColor(materials, true, true)).toBe(colorForMaterial("Grey slate"));
  });

  it("draws an unchanged covering the same on both sides", () => {
    const same = { existing: "Kent peg tile", proposed: "Kent peg tile" };
    expect(variantRoofColor(same, false, false)).toBe(variantRoofColor(same, true, false));
  });

  it("keeps an unrecognised covering on the variant defaults", () => {
    const bespoke = { existing: "Something bespoke", proposed: "Another bespoke" };
    expect(variantRoofColor(bespoke, false, true)).toBe(DEFAULT_EXISTING_ROOF_COLOR);
    expect(variantRoofColor(bespoke, true, true)).toBe(DEFAULT_PROPOSED_ROOF_COLOR);
  });

  it("respects explicit case-level swatches when the label is unrecognised", () => {
    const bespoke = { existing: "Bespoke A", proposed: "Bespoke B", existingColor: "#111111", proposedColor: "#222222" };
    expect(variantRoofColor(bespoke, false, true)).toBe("#111111");
    expect(variantRoofColor(bespoke, true, true)).toBe("#222222");
  });
});
