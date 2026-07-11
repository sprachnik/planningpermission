import { useEffect, useMemo, useState } from "react";
import type { Wing, MaterialLabels, BoundaryPoint, RoofParams } from "../../data/types";
import { getNearestBuilding, isHeightConfident } from "../../os/client";
import { boundaryCentroid, toLocalMetres } from "../../geometry/latlng";
import { PlanCanvas } from "./PlanCanvas";
import { ObliquePreview, ElevationScenePreview, PlanScenePreview, RoofTypeThumbnail } from "../RoofPreviewSvg";
import { roofColorFor } from "../svgDraw";

interface Props {
  wings: Wing[];
  /** Proposed geometry; undefined = same as existing (like-for-like change) */
  proposedWings?: Wing[];
  materials: MaterialLabels;
  boundary: BoundaryPoint[];
  onChange: (updates: { wings?: Wing[]; proposedWings?: Wing[]; materials?: MaterialLabels }) => void;
}

type Variant = "existing" | "proposed";

const PRESETS: { label: string; params: RoofParams }[] = [
  { label: "Gable", params: { widthM: 8, depthM: 6, roofType: "gable", pitchDegrees: 40, eaveHeightM: 5 } },
  { label: "Hip", params: { widthM: 8, depthM: 6, roofType: "hip", pitchDegrees: 40, eaveHeightM: 5 } },
  { label: "Lean-to / mono", params: { widthM: 4, depthM: 3, roofType: "mono-pitch", pitchDegrees: 15, eaveHeightM: 2.4, highEdge: "depth-end" } },
];

export function RoofComposerStep({ wings, proposedWings, materials, boundary, onChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(wings[0]?.id ?? null);
  const [gridSize, setGridSize] = useState(0.5);
  const [snap, setSnap] = useState(true);
  const [placing, setPlacing] = useState<Wing | null>(null);
  const [prefillStatus, setPrefillStatus] = useState<string | null>(null);
  const [variant, setVariant] = useState<Variant>("existing");
  const [showBoundary, setShowBoundary] = useState(true);

  // Which wing set is being edited. Proposed is seeded as a copy of existing
  // the first time it's opened, so a pure material change never diverges.
  const activeWings = variant === "proposed" ? (proposedWings ?? wings) : wings;
  const activeColor = roofColorFor(materials, variant === "proposed");

  function setActiveWings(next: Wing[]) {
    onChange(variant === "proposed" ? { proposedWings: next } : { wings: next });
  }

  function switchVariant(next: Variant) {
    if (next === "proposed" && !proposedWings) {
      onChange({ proposedWings: wings.map((w) => ({ ...w })) });
    }
    setVariant(next);
    setPlacing(null);
  }

  const selected = activeWings.find((w) => w.id === selectedId) ?? null;

  // Site boundary from the Location Plan step, as a local-metres underlay
  // (centroid at the grid origin) so blocks can be traced over the real plot.
  const boundaryOutline = useMemo(() => {
    if (boundary.length < 3) return undefined;
    const centroid = boundaryCentroid(boundary);
    return boundary.map((p) => toLocalMetres(p, centroid));
  }, [boundary]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlacing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function updateWing(updated: Wing) {
    setActiveWings(activeWings.map((w) => (w.id === updated.id ? updated : w)));
  }

  function startPlacing(preset: { label: string; params: RoofParams }) {
    setPlacing({
      ...preset.params,
      id: crypto.randomUUID(),
      name: `${preset.label} ${activeWings.length + 1}`,
      x: 0,
      y: 0,
    });
  }

  function placeWing(x: number, y: number) {
    if (!placing) return;
    const placed = { ...placing, x, y };
    setActiveWings([...activeWings, placed]);
    setSelectedId(placed.id);
    setPlacing(null);
  }

  function deleteSelected() {
    if (!selected) return;
    setActiveWings(activeWings.filter((w) => w.id !== selected.id));
    setSelectedId(null);
  }

  async function prefillHeights() {
    if (!selected) return;
    if (boundary.length === 0) {
      setPrefillStatus("Draw a boundary on the Location Plan step first");
      return;
    }
    setPrefillStatus("Looking up OS building data…");
    try {
      const lng = boundary.reduce((s, p) => s + p.lng, 0) / boundary.length;
      const lat = boundary.reduce((s, p) => s + p.lat, 0) / boundary.length;
      const building = await getNearestBuilding(lng, lat);
      if (!building || !isHeightConfident(building.height.confidence)) {
        setPrefillStatus("No confident OS height data — enter heights manually");
        return;
      }
      const eave = building.height.eaveHeightM ?? selected.eaveHeightM;
      const ridge = building.height.ridgeHeightM;
      const patch: Partial<Wing> = { eaveHeightM: Number(eave.toFixed(1)) };
      if (ridge !== null && ridge > eave && selected.depthM > 0) {
        patch.pitchDegrees = Math.round((Math.atan((ridge - eave) / (selected.depthM / 2)) * 180) / Math.PI);
      }
      updateWing({ ...selected, ...patch });
      setPrefillStatus(`Prefilled "${selected.name}" from OS data (${building.height.confidence})`);
    } catch (err) {
      setPrefillStatus(err instanceof Error ? err.message : "Lookup failed");
    }
  }

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <button className={variant === "existing" ? undefined : "secondary outline"} onClick={() => switchVariant("existing")} aria-pressed={variant === "existing"}>
          Existing
        </button>
        <button className={variant === "proposed" ? undefined : "secondary outline"} onClick={() => switchVariant("proposed")} aria-pressed={variant === "proposed"}>
          Proposed
        </button>
        {variant === "proposed" && (
          <button className="secondary outline" onClick={() => onChange({ proposedWings: wings.map((w) => ({ ...w })) })} title="Discard proposed geometry changes and copy the existing house again">
            Reset to existing
          </button>
        )}
        <small className="muted">
          Editing the <strong>{variant}</strong> house{variant === "proposed" ? " — change blocks here for extensions/dormers; leave as-is for a pure material change" : ""}
        </small>
      </div>
      <div className="composer">
        <aside>
          <h6 style={{ marginBottom: 8 }}>Add a block</h6>
          <div className="palette">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className={placing?.roofType === p.params.roofType ? undefined : "secondary outline"}
                onClick={() => startPlacing(p)}
                title={`Click, then click the canvas to place a ${p.label} block`}
              >
                <RoofTypeThumbnail params={p.params} />
                <span>{p.label}</span>
              </button>
            ))}
          </div>
          {placing && <small className="muted">Click on the canvas to place it (Esc/click here to cancel)</small>}

          <h6 style={{ margin: "16px 0 8px" }}>Grid</h6>
          <div className="grid-controls">
            <label>
              Cell size
              <select value={gridSize} onChange={(e) => setGridSize(Number(e.target.value))}>
                <option value={0.25}>0.25 m</option>
                <option value={0.5}>0.5 m</option>
                <option value={1}>1 m</option>
              </select>
            </label>
            <label>
              <input type="checkbox" role="switch" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap to grid
            </label>
            {boundaryOutline && (
              <label>
                <input type="checkbox" role="switch" checked={showBoundary} onChange={(e) => setShowBoundary(e.target.checked)} /> Show site boundary
              </label>
            )}
          </div>

          {selected && (
            <>
              <h6 style={{ margin: "16px 0 8px" }}>Selected: {selected.name}</h6>
              <label>
                Name
                <input value={selected.name} onChange={(e) => updateWing({ ...selected, name: e.target.value })} />
              </label>
              <label>
                Roof type
                <select value={selected.roofType} onChange={(e) => updateWing({ ...selected, roofType: e.target.value as RoofParams["roofType"] })}>
                  <option value="gable">Gable</option>
                  <option value="hip">Hip</option>
                  <option value="mono-pitch">Mono-pitch</option>
                </select>
              </label>
              <div className="two-col">
                <label>
                  Width (m)
                  <input type="number" step="0.1" value={selected.widthM} onChange={(e) => updateWing({ ...selected, widthM: Number(e.target.value) })} />
                </label>
                <label>
                  Depth (m)
                  <input type="number" step="0.1" value={selected.depthM} onChange={(e) => updateWing({ ...selected, depthM: Number(e.target.value) })} />
                </label>
                <label>
                  Pitch (°)
                  <input type="number" step="1" value={selected.pitchDegrees} onChange={(e) => updateWing({ ...selected, pitchDegrees: Number(e.target.value) })} />
                </label>
                <label>
                  Eaves (m)
                  <input type="number" step="0.1" value={selected.eaveHeightM} onChange={(e) => updateWing({ ...selected, eaveHeightM: Number(e.target.value) })} />
                </label>
              </div>
              {selected.roofType === "mono-pitch" && (
                <label>
                  High edge
                  <select value={selected.highEdge ?? "width-end"} onChange={(e) => updateWing({ ...selected, highEdge: e.target.value as RoofParams["highEdge"] })}>
                    <option value="width-start">West</option>
                    <option value="width-end">East</option>
                    <option value="depth-start">South</option>
                    <option value="depth-end">North</option>
                  </select>
                </label>
              )}
              <label>
                <input type="checkbox" role="switch" checked={!!selected.rotated} onChange={(e) => updateWing({ ...selected, rotated: e.target.checked })} /> Rotate 90°
                (ridge north–south)
              </label>
              <div className="toolbar">
                <button className="secondary" onClick={prefillHeights}>
                  Prefill from OS data
                </button>
                <button className="secondary outline" onClick={deleteSelected}>
                  Delete block
                </button>
              </div>
              {prefillStatus && <small className="muted">{prefillStatus}</small>}
            </>
          )}
        </aside>

        <div>
          <PlanCanvas
            wings={activeWings}
            boundaryOutline={showBoundary ? boundaryOutline : undefined}
            selectedId={selectedId}
            gridSize={gridSize}
            snap={snap}
            placing={placing}
            onSelect={(id) => {
              setSelectedId(id ?? selectedId);
              if (id === null && placing === null) setSelectedId(null);
            }}
            onUpdate={updateWing}
            onPlace={placeWing}
          />
          {activeWings.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <ObliquePreview wings={activeWings} selectedWingId={selectedId} label={`Pseudo-3D view (${variant})`} height={220} roofColor={activeColor} />
            </div>
          )}
        </div>
      </div>

      <fieldset className="grid" style={{ marginTop: 16 }}>
        <label>
          Existing material
          <div className="material-row">
            <input value={materials.existing} onChange={(e) => onChange({ materials: { ...materials, existing: e.target.value } })} />
            <input
              type="color"
              value={roofColorFor(materials, false)}
              onChange={(e) => onChange({ materials: { ...materials, existingColor: e.target.value } })}
              aria-label="Existing roof colour"
              title="Existing roof colour"
            />
          </div>
        </label>
        <label>
          Proposed material
          <div className="material-row">
            <input value={materials.proposed} onChange={(e) => onChange({ materials: { ...materials, proposed: e.target.value } })} />
            <input
              type="color"
              value={roofColorFor(materials, true)}
              onChange={(e) => onChange({ materials: { ...materials, proposedColor: e.target.value } })}
              aria-label="Proposed roof colour"
              title="Proposed roof colour"
            />
          </div>
        </label>
      </fieldset>

      {activeWings.length > 0 && (
        <div className="previews" style={{ marginTop: 8 }}>
          <PlanScenePreview wings={activeWings} label={`Roof plan (${variant})`} roofColor={activeColor} />
          <ElevationScenePreview wings={activeWings} dir="S" label={`South elevation (${variant})`} roofColor={activeColor} />
          <ElevationScenePreview wings={activeWings} dir="N" label={`North elevation (${variant})`} roofColor={activeColor} />
          <ElevationScenePreview wings={activeWings} dir="E" label={`East elevation (${variant})`} roofColor={activeColor} />
          <ElevationScenePreview wings={activeWings} dir="W" label={`West elevation (${variant})`} roofColor={activeColor} />
        </div>
      )}
    </div>
  );
}
