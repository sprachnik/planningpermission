import { describe, it, expect } from "vitest";
import { mmForRealMetres, fitDrawingScale, niceScaleBarLengthM, CONTENT_WIDTH_MM, CONTENT_HEIGHT_MM } from "./scale";

describe("scale maths (scale accuracy is structural)", () => {
  it("mmForRealMetres: 1m at 1:100 is 10mm on the page", () => {
    expect(mmForRealMetres(1, 100)).toBeCloseTo(10, 9);
    expect(mmForRealMetres(125, 1250)).toBeCloseTo(100, 9);
  });

  it("prefers 1:100 when the drawing fits the content area", () => {
    expect(fitDrawingScale({ width: 20, height: 10 })).toBe(100);
  });

  it("falls back to 1:200 when 1:100 would clip", () => {
    const tooWideFor100 = (CONTENT_WIDTH_MM / 1000) * 100 + 1; // just over the 1:100 limit
    expect(fitDrawingScale({ width: tooWideFor100, height: 5 })).toBe(200);
  });

  it("drawing extent at the chosen scale always fits the page content area", () => {
    for (const extent of [
      { width: 9, height: 7 },
      { width: 25, height: 12 },
      { width: 40, height: 18 },
    ]) {
      const s = fitDrawingScale(extent);
      expect(mmForRealMetres(extent.width, s)).toBeLessThanOrEqual(CONTENT_WIDTH_MM);
      expect(mmForRealMetres(extent.height, s)).toBeLessThanOrEqual(CONTENT_HEIGHT_MM);
    }
  });

  it("scale bar lengths are sensible for planning scales", () => {
    expect(niceScaleBarLengthM(100)).toBe(5);
    expect(niceScaleBarLengthM(200)).toBe(10);
    expect(niceScaleBarLengthM(1250)).toBe(100);
    expect(niceScaleBarLengthM(2500)).toBe(250);
  });
});
