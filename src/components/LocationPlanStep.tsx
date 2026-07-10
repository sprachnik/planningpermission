import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection } from "geojson";
import type { BoundaryPoint } from "../data/types";
import { osVectorStyleUrl, osTransformRequest, hasApiKey } from "../os/client";
import { lookupPostcode } from "../os/postcode";
import { zoomForScale } from "../os/basemap";
import { CONTENT_WIDTH_MM, CONTENT_HEIGHT_MM, BASEMAP_PX_PER_MM } from "../pdf/scale";

const DEFAULT_CENTRE: BoundaryPoint = { lng: -1.3, lat: 51.5 }; // roughly central England

interface Props {
  address: string;
  boundary: BoundaryPoint[];
  mapCentre?: BoundaryPoint;
  locationPlanImage?: string;
  locationPlanScale?: 1250 | 2500;
  onChange: (updates: { boundary?: BoundaryPoint[]; mapCentre?: BoundaryPoint; locationPlanImage?: string; locationPlanScale?: 1250 | 2500 }) => void;
}

/** Pull a UK postcode out of a free-text address, if present. */
function extractPostcode(address: string): string | null {
  const match = address.toUpperCase().match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/);
  return match ? match[0] : null;
}

const EMPTY_GEOJSON: FeatureCollection = { type: "FeatureCollection", features: [] };

function boundaryToGeoJson(boundary: BoundaryPoint[]): FeatureCollection {
  if (boundary.length === 0) return EMPTY_GEOJSON;
  const coords = boundary.map((p) => [p.lng, p.lat]);
  const features: Feature[] = [
    {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: boundary.length >= 2 ? [...coords, coords[0]] : coords },
    },
    ...boundary.map(
      (p): Feature => ({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      }),
    ),
  ];
  return { type: "FeatureCollection", features };
}

export function LocationPlanStep({ address, boundary, mapCentre, locationPlanImage, locationPlanScale, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const boundaryRef = useRef<BoundaryPoint[]>(boundary);
  const [postcode, setPostcode] = useState(() => extractPostcode(address) ?? "");
  const [drawing, setDrawing] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [premiumRequired, setPremiumRequired] = useState(false);

  boundaryRef.current = boundary;

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !hasApiKey()) return;
    const centre = mapCentre ?? DEFAULT_CENTRE;
    const map = new maplibregl.Map({
      container: containerRef.current,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      style: osVectorStyleUrl(),
      transformRequest: osTransformRequest,
      attributionControl: { customAttribution: "Contains OS data © Crown copyright and database right" },
      center: [centre.lng, centre.lat],
      zoom: 18,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource("boundary", { type: "geojson", data: boundaryToGeoJson(boundaryRef.current) });
      map.addLayer({ id: "boundary-line", type: "line", source: "boundary", filter: ["==", "$type", "LineString"], paint: { "line-color": "#e02424", "line-width": 2 } });
      map.addLayer({ id: "boundary-points", type: "circle", source: "boundary", filter: ["==", "$type", "Point"], paint: { "circle-color": "#e02424", "circle-radius": 4 } });

      // If the case has no saved position yet but the address has a postcode, jump straight there.
      if (!mapCentre) {
        const pc = extractPostcode(address);
        if (pc) {
          lookupPostcode(pc).then((point) => {
            if (point) {
              map.jumpTo({ center: [point.lng, point.lat], zoom: 19 });
              onChangeRef.current({ mapCentre: point });
            }
          });
        }
      }
    });

    map.on("click", (e) => {
      if (!drawingRef.current) return;
      const next = [...boundaryRef.current, { lng: e.lngLat.lng, lat: e.lngLat.lat }];
      boundaryRef.current = next;
      onChangeRef.current({ boundary: next });
    });

    // Free OpenData keys 403 on detailed-zoom tiles ("Premium Data"); the
    // browser surfaces that as a blocked fetch (status 0) — either way the
    // style loaded but tiles won't, so explain instead of showing a blank map.
    map.on("error", (e) => {
      const msg = e.error?.message ?? "";
      if (/403|premium|failed to fetch/i.test(msg)) {
        setPremiumRequired(true);
      }
    });

    // The container's final size can settle after map construction (fonts/CSS/step
    // switches), leaving a blank canvas until the next interaction — track it.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    mapRef.current = map;
    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep latest drawing/onChange in refs so the map click handler (bound once) sees current values
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("boundary") as maplibregl.GeoJSONSource | undefined;
    src?.setData(boundaryToGeoJson(boundary));
  }, [boundary]);

  async function handleSearch() {
    const point = await lookupPostcode(postcode);
    if (!point) {
      setStatus("Postcode not found");
      return;
    }
    setStatus(null);
    mapRef.current?.flyTo({ center: [point.lng, point.lat], zoom: 19 });
    onChange({ mapCentre: point });
  }

  function clearBoundary() {
    boundaryRef.current = [];
    onChange({ boundary: [] });
  }

  async function capture(scale: 1250 | 2500) {
    const map = mapRef.current;
    if (!map) return;
    setCapturing(true);
    setStatus("Capturing basemap…");
    try {
      const centre = map.getCenter();
      const targetZoom = zoomForScale(scale, centre.lat, BASEMAP_PX_PER_MM);
      const pxWidth = Math.round(CONTENT_WIDTH_MM * BASEMAP_PX_PER_MM);
      const pxHeight = Math.round(CONTENT_HEIGHT_MM * BASEMAP_PX_PER_MM);

      const container = map.getContainer();
      const prevWidth = container.style.width;
      const prevHeight = container.style.height;
      container.style.width = `${pxWidth}px`;
      container.style.height = `${pxHeight}px`;
      map.resize();
      map.jumpTo({ center: centre, zoom: targetZoom, bearing: 0 });

      await new Promise<void>((resolve) => map.once("idle", () => resolve()));

      const dataUrl = map.getCanvas().toDataURL("image/png");

      container.style.width = prevWidth;
      container.style.height = prevHeight;
      map.resize();

      onChange({ locationPlanImage: dataUrl, locationPlanScale: scale, mapCentre: { lng: centre.lng, lat: centre.lat } });
      setStatus(`Captured at 1:${scale}`);
    } finally {
      setCapturing(false);
    }
  }

  const keyMissing = !hasApiKey();

  return (
    <div>
      {keyMissing && (
        <article aria-label="Missing API key warning">
          <strong>OS basemap unavailable.</strong> VITE_OS_API_KEY is not set — add it to <code>.env.local</code> (or Netlify env vars) and reload; see{" "}
          <code>.env.example</code>.
        </article>
      )}
      {premiumRequired && (
        <article aria-label="Premium plan required warning">
          <strong>Your OS Data Hub project is on the free plan.</strong> Detailed mapping at 1:1250 planning scales is "Premium Data" and the API is
          returning 403 for it, which is why the map looks blurry or blank at this zoom. Fix: in the{" "}
          <a href="https://osdatahub.os.uk" target="_blank" rel="noreferrer">
            OS Data Hub dashboard
          </a>
          , upgrade the project to the <strong>Premium plan</strong> (the first £1,000/month of usage is free — personal use won't get near it) and make
          sure <em>OS Vector Tile API</em> is added to the project.
        </article>
      )}
      <div className="toolbar">
        <input placeholder="Postcode, e.g. CT9 1AB" value={postcode} onChange={(e) => setPostcode(e.target.value)} disabled={keyMissing} />
        <button onClick={handleSearch} disabled={keyMissing}>
          Search
        </button>
        <button className={drawing ? undefined : "secondary"} onClick={() => setDrawing((d) => !d)} aria-pressed={drawing} disabled={keyMissing}>
          {drawing ? "Stop drawing boundary" : "Draw boundary"}
        </button>
        <button className="secondary outline" onClick={clearBoundary} disabled={boundary.length === 0}>
          Clear boundary
        </button>
        <button className="contrast" onClick={() => capture(1250)} disabled={capturing || keyMissing} aria-busy={capturing}>
          Capture 1:1250
        </button>
        <button className="contrast" onClick={() => capture(2500)} disabled={capturing || keyMissing} aria-busy={capturing}>
          Capture 1:2500
        </button>
        {status && <small className="muted">{status}</small>}
      </div>
      {!keyMissing && <div ref={containerRef} className="map-container" />}
      {locationPlanImage && (
        <p>
          <ins>✓ Location Plan captured at 1:{locationPlanScale}.</ins> <small className="muted">Re-capture any time the boundary or map position changes.</small>
        </p>
      )}
      <small className="muted">
        Click "Draw boundary" then click the map to place a red line tightly around the property. Click points in order around the boundary; the line
        closes automatically.
      </small>
    </div>
  );
}
