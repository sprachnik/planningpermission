import { useEffect, useState } from "react";
import type { Wing, MaterialLabels, BoundaryPoint, RoofParams } from "../../data/types";
import { getNearestBuilding, isHeightConfident } from "../../os/client";
import { PlanCanvas } from "./PlanCanvas";
import { ObliquePreview, ElevationScenePreview, PlanScenePreview, RoofTypeThumbnail } from "../RoofPreviewSvg";

interface Props {
  wings: Wing[];
  materials: MaterialLabels;
  boundary: BoundaryPoint[];
  onChange: (updates: { wings?: Wing[]; materials?: MaterialLabels }) => void;
}

const PRESETS: { label: string; params: RoofParams }[] = [
  { label: "Gable", params: { widthM: 8, depthM: 6, roofType: "gable", pitchDegrees: 40, eaveHeightM: 5 } },
  { label: "Hip", params: { widthM: 8, depthM: 6, roofType: "hip", pitchDegrees: 40, eaveHeightM: 5 } },
  { label: "Lean-to / mono", params: { widthM: 4, depthM: 3, roofType: "mono-pitch", pitchDegrees: 15, eaveHeightM: 2.4, highEdge: "depth-end" } },
];

export function RoofComposerStep({ wings, materials, boundary, onChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(wings[0]?.id ?? null);
  const [gridSize, setGridSize] = useState(0.5);
  const [snap, setSnap] = useState(true);
  const [placing, setPlacing] = useState<Wing | null>(null);
  const [prefillStatus, setPrefillStatus] = useState<string | null>(null);

  const selected = wings.find((w) => w.id === selectedId) ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlacing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function updateWing(updated: Wing) {
    onChange({ wings: wings.map((w) => (w.id === updated.id ? updated : w)) });
  }

  function startPlacing(preset: { label: string; params: RoofParams }) {
    setPlacing({
      ...preset.params,
      id: crypto.randomUUID(),
      name: `${preset.label} ${wings.length + 1}`,
      x: 0,
      y: 0,
    });
  }

  function placeWing(x: number, y: number) {
    if (!placing) return;
    const placed = { ...placing, x, y };
    onChange({ wings: [...wings, placed] });
    setSelectedId(placed.id);
    setPlacing(null);
  }

  function deleteSelected() {
    if (!selected) return;
    onChange({ wings: wings.filter((w) => w.id !== selected.id) });
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
            wings={wings}
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
          {wings.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <ObliquePreview wings={wings} selectedWingId={selectedId} label="Pseudo-3D view" height={220} />
            </div>
          )}
        </div>
      </div>

      <fieldset className="grid" style={{ marginTop: 16 }}>
        <label>
          Existing material
          <input value={materials.existing} onChange={(e) => onChange({ materials: { ...materials, existing: e.target.value } })} />
        </label>
        <label>
          Proposed material
          <input value={materials.proposed} onChange={(e) => onChange({ materials: { ...materials, proposed: e.target.value } })} />
        </label>
      </fieldset>

      {wings.length > 0 && (
        <div className="previews" style={{ marginTop: 8 }}>
          <PlanScenePreview wings={wings} label="Roof plan (bird's-eye)" />
          <ElevationScenePreview wings={wings} dir="S" label="South elevation" />
          <ElevationScenePreview wings={wings} dir="N" label="North elevation" />
          <ElevationScenePreview wings={wings} dir="E" label="East elevation" />
          <ElevationScenePreview wings={wings} dir="W" label="West elevation" />
        </div>
      )}
    </div>
  );
}
