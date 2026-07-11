/**
 * IMPORTANT: MapLibre zoom follows the Mapbox 512px-tile convention — one
 * level offset from the classic OSM/Google 256px formula (156543/2^z).
 * Using the 256px constant here made "1:1250" captures actually 1:625.
 */
const WORLD_METRES_PER_PIXEL_512 = 78271.51696; // at equator, maplibre zoom 0

/** Ground resolution (metres per CSS pixel) of a MapLibre map at a given zoom and latitude. */
export function metresPerPixel(zoom: number, latDeg: number): number {
  return (WORLD_METRES_PER_PIXEL_512 * Math.cos((latDeg * Math.PI) / 180)) / 2 ** zoom;
}

/** The MapLibre zoom level whose ground resolution best matches a target print scale at a given render density. */
export function zoomForScale(scaleDenominator: number, latDeg: number, pxPerMm: number): number {
  const desiredMetresPerPixel = scaleDenominator / 1000 / pxPerMm;
  const raw = Math.log2((WORLD_METRES_PER_PIXEL_512 * Math.cos((latDeg * Math.PI) / 180)) / desiredMetresPerPixel);
  return Math.max(0, Math.min(22, raw));
}
