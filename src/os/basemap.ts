/** Web Mercator ground resolution (metres/pixel) at a given zoom and latitude, matching OS/Google/MapLibre tile math. */
export function metresPerPixel(zoom: number, latDeg: number): number {
  return (156543.03392 * Math.cos((latDeg * Math.PI) / 180)) / 2 ** zoom;
}

/** The MapLibre zoom level whose ground resolution best matches a target print scale at a given render density. */
export function zoomForScale(scaleDenominator: number, latDeg: number, pxPerMm: number): number {
  const desiredMetresPerPixel = scaleDenominator / 1000 / pxPerMm;
  const raw = Math.log2((156543.03392 * Math.cos((latDeg * Math.PI) / 180)) / desiredMetresPerPixel);
  return Math.max(0, Math.min(22, raw));
}
