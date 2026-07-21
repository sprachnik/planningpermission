export const MM_PER_PT = 25.4 / 72;
export const PT_PER_MM = 72 / 25.4;

// A4 landscape page layout, shared between the PDF drawing kit and the
// Location Plan map-capture step so a captured basemap image lines up
// pixel-for-pixel with the content area it's placed into.
export const PAGE_WIDTH_MM = 297;
export const PAGE_HEIGHT_MM = 210;
export const MARGIN_MM = 12;
export const TITLE_BLOCK_HEIGHT_MM = 28;
export const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2;
export const CONTENT_HEIGHT_MM = PAGE_HEIGHT_MM - MARGIN_MM * 2 - TITLE_BLOCK_HEIGHT_MM;
/** Render density used when rasterising the captured basemap image. */
export const BASEMAP_PX_PER_MM = 4;

export function mmForRealMetres(metres: number, scaleDenominator: number): number {
  return (metres * 1000) / scaleDenominator;
}

/**
 * The preferred drawing scale, falling back to smaller when the content
 * wouldn't fit the page — planning portals accept either, and an honest
 * smaller scale beats a clipped drawing. 1:100 falls back to 1:200
 * (elevations/plans); 1:200 falls back to 1:500 (block plans). The scale bar
 * reads the same denominator so the page stays self-describing.
 */
export function fitDrawingScale(extentM: { width: number; height: number }, preferred = 100): number {
  const candidates = preferred === 100 ? [100, 200] : preferred === 200 ? [200, 500] : [preferred];
  for (const s of candidates) {
    if (mmForRealMetres(extentM.width, s) <= CONTENT_WIDTH_MM && mmForRealMetres(extentM.height, s) <= CONTENT_HEIGHT_MM) {
      return s;
    }
  }
  return candidates[candidates.length - 1];
}

/** A round real-world length (metres) that reads sensibly as a scale bar at this scale. */
export function niceScaleBarLengthM(scaleDenominator: number): number {
  if (scaleDenominator <= 50) return 2;
  if (scaleDenominator <= 100) return 5;
  if (scaleDenominator <= 200) return 10;
  if (scaleDenominator <= 500) return 25;
  if (scaleDenominator <= 1250) return 100;
  return 250;
}
