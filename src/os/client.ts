/**
 * Single choke point for all OS Data Hub calls. Keeps the API key and any
 * future licence-gated features (e.g. OS Building Features roof prefill)
 * isolated in one place.
 *
 * Requires VITE_OS_API_KEY, a Data Hub key restricted to this app's domain
 * in the OS Data Hub dashboard (Project > API keys > restrict by domain).
 */

const OS_MAPS_LAYER = "Light_3857";

export function hasApiKey(): boolean {
  return !!import.meta.env.VITE_OS_API_KEY;
}

function apiKey(): string {
  const key = import.meta.env.VITE_OS_API_KEY;
  if (!key) {
    throw new Error("VITE_OS_API_KEY is not set — add it to your Netlify env vars / .env.local");
  }
  return key;
}

/** ZXY raster tile URL template for use as a MapLibre raster source. */
export function osMapsTileUrlTemplate(): string {
  return `https://api.os.uk/maps/raster/v1/zxy/${OS_MAPS_LAYER}/{z}/{x}/{y}.png?key=${apiKey()}`;
}

/** OS Vector Tile API style — much sharper than raster tiles, especially on HiDPI screens. */
export function osVectorStyleUrl(): string {
  return `https://api.os.uk/maps/vector/v1/vts/resources/styles?key=${apiKey()}&srs=3857`;
}

/** Appends the API key to sprite/glyph/tile requests the vector style makes back to api.os.uk. */
export function osTransformRequest(url: string): { url: string } {
  if (url.startsWith("https://api.os.uk") && !/[?&]key=/.test(url)) {
    url += (url.includes("?") ? "&" : "?") + "key=" + apiKey();
  }
  return { url };
}

export interface BuildingHeightAttributes {
  eaveHeightM: number | null;
  ridgeHeightM: number | null;
  /** High/Moderate/Low/Incomplete/Not Assessed — only trust High/Moderate */
  confidence: string | null;
}

export interface BuildingFeature {
  polygon: [number, number][]; // [lng, lat] pairs
  height: BuildingHeightAttributes;
}

/**
 * Fetches the building polygon + height attributes nearest a point from the
 * OS NGD Features API. Verify the exact collection id (bld-fts-buildingpart-1
 * as of this writing) and property names against current OS NGD docs before
 * relying on this in production — the schema has changed before.
 */
export async function getNearestBuilding(lng: number, lat: number): Promise<BuildingFeature | null> {
  const delta = 0.0005; // ~50m bbox
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(",");
  const url =
    `https://api.os.uk/features/ngd/ofa/v1/collections/bld-fts-buildingpart-1/items` +
    `?bbox=${bbox}&bbox-crs=http://www.opengis.net/def/crs/OGC/1.3/CRS84&limit=5&key=${apiKey()}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OS NGD Features API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const feature = data?.features?.[0];
  if (!feature) return null;

  const coords: [number, number][] = feature.geometry?.coordinates?.[0] ?? [];
  const props = feature.properties ?? {};

  return {
    polygon: coords,
    height: {
      eaveHeightM: props.height_relativeroofbase_m ?? null,
      ridgeHeightM: props.height_relativemax_m ?? null,
      confidence: props.height_confidencelevel ?? null,
    },
  };
}

export function isHeightConfident(confidence: string | null): boolean {
  return confidence === "High" || confidence === "Moderate";
}
