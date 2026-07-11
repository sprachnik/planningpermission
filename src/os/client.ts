/**
 * Single choke point for all OS Data Hub calls. Keeps the API key and any
 * future licence-gated features (e.g. OS Building Features roof prefill)
 * isolated in one place.
 *
 * Requires VITE_OS_API_KEY, a Data Hub key restricted to this app's domain
 * in the OS Data Hub dashboard (Project > API keys > restrict by domain).
 */

import type { StyleSpecification } from "maplibre-gl";

const OS_MAPS_LAYER = "Light_3857";

/**
 * Last tile zoom included in the free OpenData plan; deeper tiles are
 * "Premium Data" and 403 (observed empirically: z15 loads, z16 is refused).
 */
export const FREE_PLAN_MAX_TILE_ZOOM = 15;

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

let premiumProbe: Promise<boolean> | null = null;

/**
 * Whether the key's OS Data Hub project can fetch Premium (z17+) tiles,
 * detected by requesting a single z17 vector tile. Cached per session, so
 * Premium projects pay one extra tile transaction per page load.
 */
export function hasPremiumTiles(): Promise<boolean> {
  premiumProbe ??= (async () => {
    // A z17 tile over central England (~lng -1.3, lat 51.5) — the first Premium-only zoom.
    const z = FREE_PLAN_MAX_TILE_ZOOM + 1;
    const x = Math.floor(((-1.3 + 180) / 360) * 2 ** z);
    const latRad = (51.5 * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** z);
    try {
      const res = await fetch(`https://api.os.uk/maps/vector/v1/vts/tile/${z}/${y}/${x}.pbf?srs=3857&key=${apiKey()}`);
      return res.ok;
    } catch {
      return false;
    }
  })();
  return premiumProbe;
}

/**
 * Minimal style used when the OS style itself can't be fetched (key missing
 * from the deployment env, origin not on the key's allowlist, offline…).
 * The map still initialises and fires "load", so red-line boundary drawing
 * keeps working on a blank canvas instead of silently recording invisible
 * clicks.
 */
export const BLANK_FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  name: "blank-fallback",
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#edefeb" } }],
};

/** The OS vector style as published (Premium plans), fetched so a failure is detectable. */
export async function osVectorStylePlain(): Promise<StyleSpecification> {
  const res = await fetch(osVectorStyleUrl());
  if (!res.ok) {
    throw new Error(`OS vector style request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as StyleSpecification;
}

/**
 * The OS vector style reworked for the free plan, so MapLibre overzooms the
 * free vector data at deeper display zooms (crisp lines, generalised detail)
 * instead of requesting Premium tiles that 403:
 *
 * - Sources are capped at FREE_PLAN_MAX_TILE_ZOOM so deeper tiles are never
 *   requested. (Inline source properties take precedence over the TileJSON
 *   the source's `url` points at, so setting maxzoom here is sufficient.)
 * - The style bands its layers by zoom (e.g. roads at "min 15 / max 16" are
 *   replaced by detail layers at "min 16") and the detail layers reference
 *   source-layers that only exist in Premium tiles — left alone, nothing at
 *   all draws beyond the cap. So layers visible at the cap zoom lose their
 *   maxzoom (they keep drawing, magnified), and layers that only start
 *   beyond it are dropped.
 */
export async function osVectorStyleCapped(): Promise<StyleSpecification> {
  const style = await osVectorStylePlain();
  for (const source of Object.values(style.sources)) {
    if (source.type === "vector" || source.type === "raster") {
      source.maxzoom = Math.min(source.maxzoom ?? 22, FREE_PLAN_MAX_TILE_ZOOM);
    }
  }
  style.layers = style.layers.filter((layer) => (layer.minzoom ?? 0) <= FREE_PLAN_MAX_TILE_ZOOM);
  for (const layer of style.layers) {
    if ((layer.maxzoom ?? 24) > FREE_PLAN_MAX_TILE_ZOOM) {
      delete layer.maxzoom;
    }
  }
  return style;
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
