import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection } from "geojson";
import type { BoundaryPoint } from "../data/types";
import type { StyleSpecification } from "maplibre-gl";
import { osVectorStylePlain, osVectorStyleCapped, osTransformRequest, hasApiKey, hasPremiumTiles, BLANK_FALLBACK_STYLE } from "../os/client";
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
  onChange: (updates: { address?: string; boundary?: BoundaryPoint[]; mapCentre?: BoundaryPoint; locationPlanImage?: string; locationPlanScale?: 1250 | 2500 }) => void;
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
      (p, index): Feature => ({
        type: "Feature",
        properties: { index },
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
  const [basemapUnavailable, setBasemapUnavailable] = useState(false);

  boundaryRef.current = boundary;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current || !hasApiKey()) return;
    let cancelled = false;
    let map: maplibregl.Map | null = null;
    // The container's final size can settle after map construction (fonts/CSS/step
    // switches), leaving a blank canvas until the next interaction — track it.
    const resizeObserver = new ResizeObserver(() => map?.resize());

    (async () => {
      // Free OpenData keys 403 on Premium (deep-zoom) tiles. Detect the plan
      // up front; on free plans cap the tile sources so MapLibre overzooms
      // the free vector data — crisp lines, generalised detail — instead of
      // requesting Premium tiles and going blank.
      let style: StyleSpecification;
      try {
        if (await hasPremiumTiles()) {
          style = await osVectorStylePlain();
        } else {
          // Free plan: the footer shows a pill for this (App probes the same
          // cached hasPremiumTiles()); here we just cap the style.
          style = await osVectorStyleCapped();
        }
      } catch {
        // The OS style itself is unreachable (key not set on this deploy,
        // origin missing from the key's allowlist, offline). A blank style
        // keeps the map alive so boundary drawing still renders.
        style = BLANK_FALLBACK_STYLE;
        if (!cancelled) setBasemapUnavailable(true);
      }
      if (cancelled) return;

      const centre = mapCentre ?? DEFAULT_CENTRE;
      map = new maplibregl.Map({
        container,
        canvasContextAttributes: { preserveDrawingBuffer: true },
        style,
        transformRequest: osTransformRequest,
        attributionControl: { customAttribution: "Contains OS data © Crown copyright and database right" },
        center: [centre.lng, centre.lat],
        zoom: 18,
      });
      map.addControl(new maplibregl.NavigationControl(), "top-right");

      map.on("load", () => {
        if (!map) return;
        map.addSource("boundary", { type: "geojson", data: boundaryToGeoJson(boundaryRef.current) });
        map.addLayer({ id: "boundary-line", type: "line", source: "boundary", filter: ["==", "$type", "LineString"], paint: { "line-color": "#e02424", "line-width": 2 } });
        map.addLayer({ id: "boundary-points", type: "circle", source: "boundary", filter: ["==", "$type", "Point"], paint: { "circle-color": "#e02424", "circle-radius": 4 } });

        // If the case has no saved position yet but the address has a postcode, jump straight there.
        if (!mapCentre) {
          const pc = extractPostcode(address);
          if (pc) {
            lookupPostcode(pc).then((point) => {
              if (point) {
                map?.jumpTo({ center: [point.lng, point.lat], zoom: 19 });
                onChangeRef.current({ mapCentre: point });
              }
            });
          }
        }
      });

      map.on("click", (e) => {
        if (!drawingRef.current || !map) return;
        // Clicks on an existing point are for dragging it, not adding a new one.
        if (map.getLayer("boundary-points") && map.queryRenderedFeatures(e.point, { layers: ["boundary-points"] }).length > 0) return;
        const next = [...boundaryRef.current, { lng: e.lngLat.lng, lat: e.lngLat.lat }];
        boundaryRef.current = next;
        onChangeRef.current({ boundary: next });
      });

      // Drag an existing boundary point to move it. The source is updated
      // directly during the drag; the case is only saved on mouseup.
      map.on("mousedown", "boundary-points", (e) => {
        if (!map) return;
        const idx = e.features?.[0]?.properties?.index;
        if (typeof idx !== "number") return;
        e.preventDefault(); // stop the map panning under the drag
        const m = map;
        const src = m.getSource("boundary") as maplibregl.GeoJSONSource;
        const onMove = (ev: maplibregl.MapMouseEvent) => {
          boundaryRef.current = boundaryRef.current.map((p, i) => (i === idx ? { lng: ev.lngLat.lng, lat: ev.lngLat.lat } : p));
          src.setData(boundaryToGeoJson(boundaryRef.current));
        };
        m.on("mousemove", onMove);
        m.once("mouseup", () => {
          m.off("mousemove", onMove);
          onChangeRef.current({ boundary: boundaryRef.current });
        });
      });
      map.on("mouseenter", "boundary-points", () => {
        map?.getCanvas().style.setProperty("cursor", "move");
      });
      map.on("mouseleave", "boundary-points", () => {
        map?.getCanvas().style.setProperty("cursor", drawingRef.current ? "crosshair" : "");
      });

      map.getCanvas().style.setProperty("cursor", drawingRef.current ? "crosshair" : "");

      // Belt-and-braces: if Premium tiles are still requested and blocked
      // (e.g. the plan probe failed), explain instead of showing a blank map.
      map.on("error", (e) => {
        const msg = e.error?.message ?? "";
        if (/403|premium|failed to fetch/i.test(msg)) {
          setPremiumRequired(true);
        }
      });

      resizeObserver.observe(container);
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      map?.remove();
      map = null;
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

  // A precise crosshair while placing points beats the default grab hand.
  useEffect(() => {
    mapRef.current?.getCanvas().style.setProperty("cursor", drawing ? "crosshair" : "");
  }, [drawing]);

  function undoPoint() {
    if (boundaryRef.current.length === 0) return;
    const next = boundaryRef.current.slice(0, -1);
    boundaryRef.current = next;
    onChangeRef.current({ boundary: next });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && boundaryRef.current.length > 0) {
        e.preventDefault();
        undoPoint();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSearch() {
    const point = await lookupPostcode(postcode);
    if (!point) {
      setStatus("Postcode not found");
      return;
    }
    setStatus(null);
    mapRef.current?.flyTo({ center: [point.lng, point.lat], zoom: 19 });
    // The postcode seeds the case's address (list label, PDF filename, title
    // blocks) — but never overwrite a full address the user has typed.
    const isBarePostcode = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/.test(address.trim().toUpperCase());
    const updates: Parameters<typeof onChange>[0] = { mapCentre: point };
    if (!address.trim() || isBarePostcode) updates.address = postcode.trim().toUpperCase();
    onChange(updates);
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
      {basemapUnavailable && (
        <article aria-label="Basemap unavailable warning">
          <strong>OS basemap unavailable — the API rejected the request.</strong> Check that <code>VITE_OS_API_KEY</code> is set in this deployment's
          environment variables and that the key's allowed origins include <strong>{typeof window !== "undefined" ? window.location.origin : "this domain"}</strong>{" "}
          (OS Data Hub dashboard → Project → API keys). You can still draw the red-line boundary on the blank canvas below, but a submission-ready
          Location Plan needs the basemap captured behind it.
        </article>
      )}
      {premiumRequired && !basemapUnavailable && (
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
      <div className="toolbar-groups">
        <div className="toolbar-group">
          <span className="group-label">1 · Find the property</span>
          <div className="controls">
            <div className="search-combo">
              <input placeholder="Postcode, e.g. CT9 1AB" value={postcode} onChange={(e) => setPostcode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} disabled={keyMissing} />
              <button onClick={handleSearch} disabled={keyMissing} data-tooltip="Centres the map and saves the postcode as the case address">
                Search
              </button>
            </div>
          </div>
        </div>
        <div className="toolbar-group">
          <span className="group-label">2 · Red-line boundary</span>
          <div className="controls">
            <button
              className={drawing ? undefined : "secondary"}
              onClick={() => setDrawing((d) => !d)}
              aria-pressed={drawing}
              disabled={keyMissing}
              data-tooltip="Trace the whole plot — garden and drive included, not just the house"
            >
              {drawing ? "Stop drawing" : "Draw boundary"}
            </button>
            <button className="secondary outline" onClick={undoPoint} disabled={boundary.length === 0} data-tooltip="Remove the last point (Ctrl+Z)">
              Undo point
            </button>
            <button className="secondary outline" onClick={clearBoundary} disabled={boundary.length === 0} data-tooltip="Start the red line again">
              Clear
            </button>
          </div>
        </div>
        <div className="toolbar-group">
          <span className="group-label">3 · Capture for the PDF</span>
          <div className="controls">
            <button
              className="contrast"
              onClick={() => capture(1250)}
              disabled={capturing || keyMissing}
              aria-busy={capturing}
              data-tooltip="The standard scale for urban householder applications"
            >
              Capture 1:1250
            </button>
            <button
              className="contrast"
              onClick={() => capture(2500)}
              disabled={capturing || keyMissing}
              aria-busy={capturing}
              data-tooltip="Use for larger or rural plots"
            >
              Capture 1:2500
            </button>
          </div>
        </div>
      </div>
      {status && <p className="hint">{status}</p>}
      {drawing && (
        <p className="hint">
          Click the map to place points in order around the property — the red line closes itself. Drag a point to move it; Undo (or Ctrl+Z) removes
          the last one.
        </p>
      )}
      {!keyMissing && <div ref={containerRef} className="map-container" />}
      {locationPlanImage && (
        <p style={{ marginTop: "0.75rem" }}>
          <ins>✓ Location Plan captured at 1:{locationPlanScale}.</ins> <small className="muted">Re-capture any time the boundary or map position changes.</small>
        </p>
      )}
    </div>
  );
}
