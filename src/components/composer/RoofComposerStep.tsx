import { useEffect, useMemo, useState } from "react";
import type { Wing, MaterialLabels, BoundaryPoint, RoofParams, Opening, Rooflight } from "../../data/types";
import { getNearestBuilding, isHeightConfident } from "../../os/client";
import { boundaryCentroid, toLocalMetres } from "../../geometry/latlng";
import { PlanCanvas } from "./PlanCanvas";
import { SceneEditor, type EditorView } from "./ObliqueEditor";
import { ElevationScenePreview, ObliquePreview, PlanScenePreview, RoofTypeThumbnail } from "../RoofPreviewSvg";
import { colorForMaterial, variantRoofColor } from "../svgDraw";
import { wingRotation, type QuarterTurn } from "../../geometry/faces3d";
import { elevationName, windSuffix } from "../../geometry/compass";
import { computeRoofPlan, gableRidgeY } from "../../geometry/roof";
import type { Direction } from "../../geometry/composite";
import { sameGeometry, matchProposedGeometry } from "../../data/caseGeometry";

interface Props {
  wings: Wing[];
  /** Proposed geometry; undefined = same as existing (like-for-like change) */
  proposedWings?: Wing[];
  materials: MaterialLabels;
  boundary: BoundaryPoint[];
  /** Composer-only rotation of the boundary underlay (never the boundary itself) */
  boundaryRotationDeg?: number;
  /** True bearing plan-up faces; undefined = derived from boundaryRotationDeg */
  northBearingDeg?: number;
  onChange: (updates: {
    wings?: Wing[];
    proposedWings?: Wing[];
    materials?: MaterialLabels;
    composerBoundaryRotationDeg?: number;
    northBearingDeg?: number;
  }) => void;
}

type Variant = "existing" | "proposed";


const OPENING_NAMES: Record<Opening["type"], string> = {
  window: "Window",
  door: "Door",
  garage: "Garage door",
  open: "Open doorway",
};

/** New-opening defaults: garage doors are wide; doorways are door-height. */
const OPENING_PRESETS: Record<Opening["type"], Pick<Opening, "widthM" | "heightM" | "sillM">> = {
  window: { widthM: 1.2, heightM: 1.2, sillM: 0.9 },
  door: { widthM: 0.9, heightM: 2, sillM: 0 },
  garage: { widthM: 2.4, heightM: 2.1, sillM: 0 },
  open: { widthM: 1.2, heightM: 2.1, sillM: 0 },
};

const PRESETS: { label: string; params: RoofParams }[] = [
  { label: "Gable", params: { widthM: 8, depthM: 6, roofType: "gable", pitchDegrees: 40, eaveHeightM: 5 } },
  { label: "Hip", params: { widthM: 8, depthM: 6, roofType: "hip", pitchDegrees: 40, eaveHeightM: 5 } },
  { label: "Lean-to / mono", params: { widthM: 4, depthM: 3, roofType: "mono-pitch", pitchDegrees: 15, eaveHeightM: 2.4, highEdge: "depth-end" } },
  { label: "Flat", params: { widthM: 4, depthM: 3, roofType: "flat", pitchDegrees: 0, eaveHeightM: 3 } },
];

export function RoofComposerStep({ wings, proposedWings, materials, boundary, boundaryRotationDeg = 0, northBearingDeg, onChange }: Props) {
  // Nothing selected on entry: the sidebar opens with just "Add a block".
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  // Panel expansion follows selection: picking/placing a block opens its
  // panel and folds the palette; deselecting reverses that.
  const [addOpen, setAddOpen] = useState(true);
  const [blockOpen, setBlockOpen] = useState(false);
  const [openingsOpen, setOpeningsOpen] = useState(false);
  const [confirmDeleteBlock, setConfirmDeleteBlock] = useState(false);
  const [gridSize, setGridSize] = useState(0.5);
  const [snap, setSnap] = useState(true);
  const [placing, setPlacing] = useState<Wing | null>(null);
  const [prefillStatus, setPrefillStatus] = useState<string | null>(null);
  const [variant, setVariant] = useState<Variant>("existing");
  const [showBoundary, setShowBoundary] = useState(true);
  const [showCompass, setShowCompass] = useState(true);
  // True bearing plan-up faces: explicit setting, else the boundary underlay
  // rotation (rotating the north-up plot CCW by R to fit the grid means
  // plan-up faces bearing R), else plan north = true north.
  const bearing = northBearingDeg ?? boundaryRotationDeg;
  // Matches the PDF sheet titles: the true compass direction, not the grid
  // name with the wind in brackets.
  const dirLabel = (dir: Direction) => elevationName(dir, bearing);
  /** Which projection fills the main editing viewport */
  const [mainView, setMainView] = useState<EditorView>("3d");

  // Which wing set is being edited. Proposed is seeded as a copy of existing
  // the first time it's opened, so a pure material change never diverges.
  const activeWings = variant === "proposed" ? (proposedWings ?? wings) : wings;
  // Matches the PDF: the swatch follows the material *name* where we know it,
  // so the preview never shows a colour the drawings would contradict.
  const coveringDiffers = (materials.existing ?? "").trim().toLowerCase() !== (materials.proposed ?? "").trim().toLowerCase();
  const activeColor = variantRoofColor(materials, variant === "proposed", coveringDiffers);
  const caseMaterial = (variant === "proposed" ? materials.proposed : materials.existing) || "material not set";
  // Label for the previews: the case default, or "mixed coverings" once any
  // block overrides it (or keeps its existing covering on the proposed house).
  const wingMaterialLabels = new Set(
    activeWings.filter((w) => !w.isContext).map((w) => {
      if (variant === "proposed" && w.materialUnchanged) {
        const existing = wings.find((e) => e.id === w.id);
        return existing?.material?.trim() || materials.existing || "existing covering";
      }
      return w.material?.trim() || caseMaterial;
    }),
  );
  const activeMaterial = wingMaterialLabels.size > 1 ? "mixed coverings" : (wingMaterialLabels.values().next().value ?? caseMaterial);
  // Per-block roof colour overrides for the previews. Proposed blocks marked
  // "covering unchanged" show their existing colour instead.
  const wingColors = Object.fromEntries(
    activeWings.flatMap((w): [string, string][] => {
      if (variant === "proposed" && w.materialUnchanged) {
        const existing = wings.find((e) => e.id === w.id);
        const kept = existing?.material?.trim() || materials.existing;
        return [[w.id, existing?.materialColor ?? colorForMaterial(kept) ?? variantRoofColor(materials, false, coveringDiffers)]];
      }
      return w.materialColor ? [[w.id, w.materialColor]] : [];
    }),
  );

  function setActiveWings(next: Wing[]) {
    onChange(variant === "proposed" ? { proposedWings: next } : { wings: next });
  }

  // Blocks are independent: each carries its own covering, set only in its
  // block panel. The proposed house starts as a faithful copy (coverings
  // included) — change each block's covering to what is actually proposed.
  function switchVariant(next: Variant) {
    if (next === "proposed" && !proposedWings) {
      onChange({ proposedWings: wings.map((w) => ({ ...w })) });
    }
    setVariant(next);
    setPlacing(null);
    setSelectedOpeningId(null);
  }

  const selected = activeWings.find((w) => w.id === selectedId) ?? null;

  // Site boundary from the Location Plan step, as a local-metres underlay
  // (centroid at the grid origin) so blocks can be traced over the real plot.
  const boundaryOutline = useMemo(() => {
    if (boundary.length < 3) return undefined;
    const centroid = boundaryCentroid(boundary);
    const local = boundary.map((p) => toLocalMetres(p, centroid));
    if (!boundaryRotationDeg) return local;
    // rotate the underlay about its centroid (display aid; the saved boundary
    // and the Location Plan are untouched)
    const rad = (boundaryRotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return local.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }));
  }, [boundary, boundaryRotationDeg]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlacing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (selectedId) {
      setAddOpen(false);
      setBlockOpen(true);
    } else {
      setAddOpen(true);
    }
  }, [selectedId]);

  useEffect(() => {
    if (selectedOpeningId) setOpeningsOpen(true);
  }, [selectedOpeningId]);

  // Delete removes the selected opening outright, or asks before removing a
  // block. Rebound every render so the closures stay fresh; skipped while
  // typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "r" || e.key === "R") {
        // rotate the selected block a quarter turn (0 → 90 → 180 → 270)
        if (selected) updateWing({ ...selected, rotationDeg: ((wingRotation(selected) + 90) % 360) as QuarterTurn, rotated: undefined });
        return;
      }
      if (e.key !== "Delete") return;
      if (selectedOpeningId) {
        removeOpening(selectedOpeningId);
        setSelectedOpeningId(null);
      } else if (selectedId) {
        setConfirmDeleteBlock(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function updateWing(updated: Wing) {
    setActiveWings(activeWings.map((w) => (w.id === updated.id ? updated : w)));
  }

  function startPlacing(preset: { label: string; params: RoofParams }) {
    // clicking the active palette button again cancels placing
    if (placing?.roofType === preset.params.roofType) {
      setPlacing(null);
      return;
    }
    setPlacing({
      ...preset.params,
      id: crypto.randomUUID(),
      name: `${preset.label} ${activeWings.length + 1}`,
      x: 0,
      y: 0,
      // new blocks own their covering from the start — inherit from the first
      // block (an extension usually matches the house), else the case seed
      material: activeWings[0]?.material ?? ((variant === "proposed" ? materials.proposed : materials.existing).trim() || undefined),
      materialColor: activeWings[0]?.materialColor ?? activeColor,
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
    setSelectedOpeningId(null);
    setConfirmDeleteBlock(false);
  }

  // Wall names in compass terms, per the wing's quarter-turn rotation (CCW).
  const SIDE_LABELS: Record<QuarterTurn, Record<Opening["side"], string>> = {
    0: { front: "South", back: "North", left: "West", right: "East" },
    90: { front: "East", back: "West", left: "South", right: "North" },
    180: { front: "North", back: "South", left: "East", right: "West" },
    270: { front: "West", back: "East", left: "North", right: "South" },
  };
  const sideLabels = SIDE_LABELS[selected ? wingRotation(selected) : 0];
  /** Wall name plus the true compass point it faces, e.g. "South (SSW)". */
  const wallLabel = (side: Opening["side"]) => `${sideLabels[side]}${windSuffix(sideLabels[side][0] as Direction, bearing)}`;

  /** The selected wing's wall that faces a given compass direction (and is
   *  therefore the one visible in that elevation view). */
  function sideFacing(dir: Direction): Opening["side"] {
    const rot = selected ? wingRotation(selected) : 0;
    const entries = Object.entries(SIDE_LABELS[rot]) as [Opening["side"], string][];
    return entries.find(([, name]) => name[0] === dir)?.[0] ?? "front";
  }

  function addOpening(type: Opening["type"]) {
    if (!selected) return;
    const opening: Opening = {
      id: crypto.randomUUID(),
      type,
      // drop the opening onto the wall being looked at: the wall facing the
      // elevation under edit, or the front (south) wall in the 3D view
      side: sideFacing(mainView === "3d" ? "S" : mainView),
      offsetM: 1,
      ...OPENING_PRESETS[type],
    };
    updateWing({ ...selected, openings: [...(selected.openings ?? []), opening] });
    setSelectedOpeningId(opening.id); // select + expand the new opening
  }

  /** Overall height of the selected block, to the ridge (or high edge). */
  const selectedRidgeM = selected && selected.roofType !== "flat" ? computeRoofPlan(selected).ridgeHeightM : null;

  /** Sets a block's overall height by back-solving the pitch from the eaves.
   *  Asymmetric gables keep the ridge's plan position (both pitches rescale). */
  function setRidgeHeight(targetM: number) {
    if (!selected || !Number.isFinite(targetM) || targetM <= 0) return;
    const rise = Math.max(0.05, targetM - selected.eaveHeightM);
    const deg = (run: number) => Math.round((Math.atan(rise / run) * 180) / Math.PI * 10) / 10;
    if (selected.roofType === "gable") {
      const ry = gableRidgeY(selected);
      if (ry < 1e-6 || selected.depthM - ry < 1e-6) return;
      updateWing({
        ...selected,
        pitchDegrees: deg(ry),
        ...(selected.rearPitchDegrees !== undefined ? { rearPitchDegrees: deg(selected.depthM - ry) } : {}),
      });
    } else if (selected.roofType === "hip") {
      if (selected.depthM < 1e-6) return;
      updateWing({ ...selected, pitchDegrees: deg(selected.depthM / 2) });
    } else if (selected.roofType === "mono-pitch") {
      const run = (selected.highEdge ?? "width-end").startsWith("width") ? selected.widthM : selected.depthM;
      if (run < 1e-6) return;
      updateWing({ ...selected, pitchDegrees: deg(run) });
    }
  }

  function updateOpening(id: string, patch: Partial<Opening>) {
    if (!selected) return;
    updateWing({ ...selected, openings: (selected.openings ?? []).map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  }

  function removeOpening(id: string) {
    if (!selected) return;
    updateWing({ ...selected, openings: (selected.openings ?? []).filter((o) => o.id !== id) });
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
        <div className="segmented">
          <button
            className={variant === "existing" ? "seg active" : "seg"}
            onClick={() => switchVariant("existing")}
            aria-pressed={variant === "existing"}
            data-tooltip="The house as it stands today"
          >
            Existing
          </button>
          <button
            className={variant === "proposed" ? "seg active" : "seg"}
            onClick={() => switchVariant("proposed")}
            aria-pressed={variant === "proposed"}
            data-tooltip="After the works — starts as a copy of the existing house"
          >
            Proposed
          </button>
        </div>
        {variant === "proposed" && (
          <button
            className="secondary outline"
            onClick={() => onChange({ proposedWings: wings.map((w) => ({ ...w })) })}
            data-tooltip="Discard proposed changes and copy the existing house again, coverings included"
          >
            Reset to existing
          </button>
        )}
        {/* Only offered when the shapes actually differ — on a re-covering that
            is usually an accidental nudge, and resetting outright would throw
            away every proposed covering with it. */}
        {variant === "proposed" && proposedWings && !sameGeometry(wings, proposedWings) && (
          <button
            className="secondary outline"
            onClick={() => onChange({ proposedWings: matchProposedGeometry(wings, proposedWings) })}
            data-tooltip="Puts the proposed blocks back to the existing shapes and positions, keeping the proposed coverings — use if the shapes drifted by accident"
          >
            Match shape to existing
          </button>
        )}
        <small className="muted">
          Editing the <strong>{variant}</strong> building{variant === "proposed" ? " — add or reshape blocks for extensions, dormers and outbuildings; leave as-is if only materials change" : ""}
        </small>
      </div>
      {confirmDeleteBlock && selected && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteBlock(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Confirm block deletion" onClick={(e) => e.stopPropagation()}>
            <h3>Delete this block?</h3>
            <p>
              <strong>{selected.name}</strong> and its openings will be removed from the {variant} house.
            </p>
            <div className="modal-actions">
              <button className="secondary outline" onClick={() => setConfirmDeleteBlock(false)} autoFocus>
                Cancel
              </button>
              <button className="danger" onClick={deleteSelected}>
                Delete block
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="composer">
        {/* Sidebar is its own sticky, independently-scrolling column so a long
            openings list never pushes the drawings down the page. */}
        <aside>
          <details open={addOpen} onToggle={(e) => setAddOpen((e.currentTarget as HTMLDetailsElement).open)} className="panel">
            <summary>Add a block</summary>
            <div className="palette">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className={placing?.roofType === p.params.roofType ? undefined : "secondary outline"}
                onClick={() => startPlacing(p)}
                title={`Click, then click the canvas to place a ${p.label} block (click again to cancel)`}
              >
                <RoofTypeThumbnail params={p.params} />
                <span>{p.label}</span>
              </button>
            ))}
          </div>
            {placing && <small className="muted">Click on the canvas to place it (Esc/click here to cancel)</small>}
          </details>

          <details className="panel">
            <summary>Grid &amp; view</summary>
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
            <label>
              Plan north bearing (°)
              <input
                type="number"
                step="1"
                value={bearing}
                onChange={(e) => onChange({ northBearingDeg: Number(e.target.value) })}
                title="True compass bearing the plan's up direction faces — e.g. 22 for a plot turned NNE. Follows the boundary underlay rotation until you set it. Renames the elevations and turns the compass and PDF north arrow."
              />
            </label>
            <label>
              <input type="checkbox" role="switch" checked={showCompass} onChange={(e) => setShowCompass(e.target.checked)} title="Semi-transparent compass on the plan showing true north" /> Show
              compass
            </label>
            {boundaryOutline && (
              <>
                <label>
                  <input type="checkbox" role="switch" checked={showBoundary} onChange={(e) => setShowBoundary(e.target.checked)} /> Show site boundary
                </label>
                <label>
                  Rotate boundary underlay (°)
                  <input
                    type="number"
                    step="1"
                    value={boundaryRotationDeg}
                    onChange={(e) => onChange({ composerBoundaryRotationDeg: Number(e.target.value) })}
                    title="Turns the traced plot to line up with the blocks — the real boundary and Location Plan are unchanged"
                  />
                </label>
              </>
            )}
            </div>
          </details>

          {selected && (
            <>
              <details open={blockOpen} onToggle={(e) => setBlockOpen((e.currentTarget as HTMLDetailsElement).open)} className="panel">
                <summary>Block — {selected.name}</summary>
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
                  <option value="flat">Flat</option>
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
                {selected.roofType !== "flat" && (
                  <label>
                    {selected.roofType === "gable" ? `Pitch (°) — ${sideLabels.front} slope` : "Pitch (°)"}
                    <input type="number" step="1" value={selected.pitchDegrees} onChange={(e) => updateWing({ ...selected, pitchDegrees: Number(e.target.value) })} />
                  </label>
                )}
                {selected.roofType === "gable" && (
                  <label>
                    Pitch (°) — {sideLabels.back} slope
                    <input
                      type="number"
                      step="1"
                      value={selected.rearPitchDegrees ?? ""}
                      placeholder={String(selected.pitchDegrees)}
                      onChange={(e) => updateWing({ ...selected, rearPitchDegrees: e.target.value === "" ? undefined : Number(e.target.value) })}
                      title="Leave blank for a symmetric roof — set when one slope is steeper than the other (the ridge moves off-centre so both slopes still meet)"
                    />
                  </label>
                )}
                <label>
                  Eaves (m)
                  <input type="number" step="0.1" value={selected.eaveHeightM} onChange={(e) => updateWing({ ...selected, eaveHeightM: Number(e.target.value) })} />
                </label>
                {selectedRidgeM !== null && (
                  <label>
                    Ridge height (m)
                    <input
                      type="number"
                      step="0.1"
                      value={Number(selectedRidgeM.toFixed(2))}
                      onChange={(e) => setRidgeHeight(Number(e.target.value))}
                      title="Overall building height to the ridge (the high edge for a lean-to). Set it directly if you know it — the pitch is recalculated from the eaves. An asymmetric gable keeps its ridge position; both pitches rescale."
                    />
                  </label>
                )}
                <label>
                  X — from west (m)
                  <input
                    type="number"
                    step="0.1"
                    value={selected.x}
                    onChange={(e) => updateWing({ ...selected, x: Number(e.target.value) })}
                    title="Plan position of the block's south-west corner — set exactly instead of dragging"
                  />
                </label>
                <label>
                  Y — from south (m)
                  <input
                    type="number"
                    step="0.1"
                    value={selected.y}
                    onChange={(e) => updateWing({ ...selected, y: Number(e.target.value) })}
                    title="Plan position of the block's south-west corner — set exactly instead of dragging"
                  />
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
                Rotation
                <select
                  value={wingRotation(selected)}
                  onChange={(e) => updateWing({ ...selected, rotationDeg: Number(e.target.value) as QuarterTurn, rotated: undefined })}
                  title="Quarter turns anticlockwise — also the ⟳ button on the plan or the R key"
                >
                  <option value={0}>0° — ridge east–west</option>
                  <option value={90}>90° — ridge north–south</option>
                  <option value={180}>180° — flipped</option>
                  <option value={270}>270° — ridge north–south, flipped</option>
                </select>
              </label>
              <label>
                Drawing layer
                <div className="toolbar">
                  <button
                    className="secondary outline"
                    onClick={() => updateWing({ ...selected, zOrder: (selected.zOrder ?? 0) - 1 })}
                    title="Paint this block underneath overlapping blocks"
                  >
                    ▼ Send back
                  </button>
                  <button
                    className="secondary outline"
                    onClick={() => updateWing({ ...selected, zOrder: (selected.zOrder ?? 0) + 1 })}
                    title="Paint this block on top of overlapping blocks"
                  >
                    ▲ Bring forward
                  </button>
                  <small className="muted">layer {selected.zOrder ?? 0}</small>
                </div>
                <small className="muted">
                  When blocks overlap in a view (a balcony hiding a chimney, say), raise or lower a block to choose which draws on top. Layer 0 is the
                  normal depth order.
                </small>
              </label>
              <label>
                Ground level (m)
                <input
                  type="number"
                  step="0.1"
                  value={selected.groundOffsetM ?? 0}
                  onChange={(e) => updateWing({ ...selected, groundOffsetM: Number(e.target.value) || undefined })}
                  title="This block's ground level relative to the site datum — for stepped or sloping sites. Elevations draw a baseline per block and quoted heights include it."
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  role="switch"
                  checked={!!selected.isContext}
                  onChange={(e) => updateWing({ ...selected, isContext: e.target.checked || undefined })}
                  title="A neighbouring building (semi/terrace) drawn grey for context — excluded from materials, heights and the schedule"
                />{" "}
                Neighbouring building (context only)
              </label>
              {!selected.isContext && (
                <>
              {variant === "proposed" && (
                <label>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={!!selected.materialUnchanged}
                    onChange={(e) => updateWing({ ...selected, materialUnchanged: e.target.checked || undefined })}
                    title="This block keeps its existing covering — drawings and the schedule mark it unchanged"
                  />{" "}
                  Covering unchanged on this block
                </label>
              )}
              {!(variant === "proposed" && selected.materialUnchanged) && (
              <label>
                Roof material (this block, {variant} house)
                <div className="material-row">
                  <input
                    value={selected.material ?? ""}
                    placeholder={caseMaterial}
                    onChange={(e) => updateWing({ ...selected, material: e.target.value || undefined })}
                    title="Leave blank to use the case material — set it when this block's covering differs (e.g. a felt flat roof)"
                  />
                  <input
                    type="color"
                    value={selected.materialColor ?? activeColor}
                    onChange={(e) => updateWing({ ...selected, materialColor: e.target.value })}
                    aria-label="Block roof colour"
                    title="Block roof colour"
                  />
                </div>
              </label>
              )}
              <label>
                Wall material (this block)
                <input
                  value={selected.wallMaterial ?? ""}
                  placeholder="e.g. Red stock brick"
                  onChange={(e) => updateWing({ ...selected, wallMaterial: e.target.value || undefined })}
                  title="Printed in the Schedule of Materials — councils validate materials in words"
                />
              </label>
                </>
              )}
              <div className="toolbar" style={{ marginTop: 8 }}>
                <button className="secondary" onClick={prefillHeights} title="Sets eaves and pitch from OS height data for the building inside your red line">
                  Prefill from OS data
                </button>
                <button className="secondary outline" onClick={() => setConfirmDeleteBlock(true)} title="Removes the selected block">
                  Delete block
                </button>
              </div>
              {prefillStatus && <small className="muted">{prefillStatus}</small>}
              </details>

              <details open={openingsOpen} onToggle={(e) => setOpeningsOpen((e.currentTarget as HTMLDetailsElement).open)} className="panel">
                <summary>
                  Openings — {selected.name}
                  {(selected.openings?.length ?? 0) > 0 ? ` (${selected.openings!.length})` : ""}
                </summary>
              <div className="toolbar">
                <button className="secondary outline" onClick={() => addOpening("window")} title="Windows appear on the elevations at true size">
                  + Window
                </button>
                <button className="secondary outline" onClick={() => addOpening("door")}>
                  + Door
                </button>
                <button className="secondary outline" onClick={() => addOpening("garage")} title="Wide sectional door, drawn with panel lines">
                  + Garage door
                </button>
                <button className="secondary outline" onClick={() => addOpening("open")} title="A doorway with no door — open porch or carport aperture, drawn as a dark opening">
                  + Open doorway
                </button>
              </div>
              <small className="muted">
                New openings land on the wall facing the elevation view you're editing (south-facing in the 3D view) — switch view or wall afterwards to
                move them.
              </small>
              {(selected.openings ?? []).map((o) => (
                <details
                  key={o.id}
                  className={o.id === selectedOpeningId ? "panel opening-row selected" : "panel opening-row"}
                  open={o.id === selectedOpeningId}
                  onToggle={(e) => {
                    const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                    if (isOpen) setSelectedOpeningId(o.id);
                    else if (selectedOpeningId === o.id) setSelectedOpeningId(null);
                  }}
                >
                  <summary>
                    {OPENING_NAMES[o.type]} · {wallLabel(o.side)} wall
                  </summary>
                  <div className="opening-head">
                    <select value={o.side} onChange={(e) => updateOpening(o.id, { side: e.target.value as Opening["side"] })} aria-label="Wall">
                      {(["front", "back", "left", "right"] as const).map((side) => (
                        <option key={side} value={side}>
                          {wallLabel(side)} wall
                        </option>
                      ))}
                    </select>
                    <button className="secondary outline" onClick={() => removeOpening(o.id)} aria-label="Remove opening">
                      ×
                    </button>
                  </div>
                  <div className="two-col">
                    <label>
                      From left (m)
                      <input type="number" step="0.1" value={o.offsetM} onChange={(e) => updateOpening(o.id, { offsetM: Number(e.target.value) })} />
                    </label>
                    <label>
                      Width (m)
                      <input type="number" step="0.1" value={o.widthM} onChange={(e) => updateOpening(o.id, { widthM: Number(e.target.value) })} />
                    </label>
                    <label>
                      Height (m)
                      <input type="number" step="0.1" value={o.heightM} onChange={(e) => updateOpening(o.id, { heightM: Number(e.target.value) })} />
                    </label>
                    {o.type === "window" && (
                      <label>
                        Sill (m)
                        <input type="number" step="0.1" value={o.sillM} onChange={(e) => updateOpening(o.id, { sillM: Number(e.target.value) })} />
                      </label>
                    )}
                  </div>
                </details>
              ))}
              </details>

              {selected.roofType !== "mono-pitch" && selected.roofType !== "flat" && (
                <details className="panel">
                  <summary>Chimney</summary>
                  <label>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={!!selected.chimney}
                      onChange={(e) => updateWing({ ...selected, chimney: e.target.checked ? { offsetM: selected.widthM / 2 } : undefined })}
                    />{" "}
                    Chimney stack on ridge
                  </label>
                  {selected.chimney && (
                    <>
                      {selected.roofType === "gable" && (
                        <label>
                          Position
                          <select
                            value={selected.chimney.position ?? "ridge"}
                            onChange={(e) =>
                              updateWing({ ...selected, chimney: { ...selected.chimney!, position: e.target.value as NonNullable<Wing["chimney"]>["position"] } })
                            }
                            title="On the ridge, or an external stack rising up a gable-end wall from the ground"
                          >
                            <option value="ridge">On the ridge</option>
                            <option value="end-left">{sideLabels.left} gable end (external)</option>
                            <option value="end-right">{sideLabels.right} gable end (external)</option>
                          </select>
                        </label>
                      )}
                      {(selected.chimney.position ?? "ridge") === "ridge" && (
                      <label>
                        Position along ridge (m)
                        <input
                          type="number"
                          step="0.1"
                          value={selected.chimney.offsetM}
                          onChange={(e) => updateWing({ ...selected, chimney: { ...selected.chimney!, offsetM: Number(e.target.value) } })}
                        />
                      </label>
                      )}
                      <div className="two-col">
                        <label>
                          Along ridge (m)
                          <input
                            type="number"
                            step="0.1"
                            value={selected.chimney.alongM ?? 0.9}
                            onChange={(e) => updateWing({ ...selected, chimney: { ...selected.chimney!, alongM: Number(e.target.value) } })}
                          />
                        </label>
                        <label>
                          Across (m)
                          <input
                            type="number"
                            step="0.1"
                            value={selected.chimney.acrossM ?? 0.5}
                            onChange={(e) => updateWing({ ...selected, chimney: { ...selected.chimney!, acrossM: Number(e.target.value) } })}
                          />
                        </label>
                      </div>
                      <small className="muted">Or drag the chimney on the top-down plan; the blue corner resizes it.</small>
                    </>
                  )}
                </details>
              )}

              {(selected.roofType === "gable" || selected.roofType === "mono-pitch") && (
                <details className="panel">
                  <summary>
                    Rooflights
                    {(selected.rooflights?.length ?? 0) > 0 ? ` (${selected.rooflights!.length})` : ""}
                  </summary>
                  <div className="toolbar">
                    <button
                      className="secondary outline"
                      onClick={() => {
                        const rl: Rooflight = {
                          id: crypto.randomUUID(),
                          plane: "front",
                          offsetM: Math.max(0.5, selected.widthM / 2 - 0.4),
                          upSlopeM: 1,
                          widthM: 0.78,
                          lengthM: 1.4,
                        };
                        updateWing({ ...selected, rooflights: [...(selected.rooflights ?? []), rl] });
                      }}
                      title="A rooflight lying in the roof slope — shown on the roof plan and elevations"
                    >
                      + Rooflight
                    </button>
                  </div>
                  {(selected.rooflights ?? []).map((rl) => {
                    const patchRl = (patch: Partial<Rooflight>) =>
                      updateWing({ ...selected, rooflights: (selected.rooflights ?? []).map((r) => (r.id === rl.id ? { ...r, ...patch } : r)) });
                    return (
                      <details key={rl.id} className="panel opening-row" open>
                        <summary>Rooflight · {selected.roofType === "gable" ? `${rl.plane === "front" ? sideLabels.front : sideLabels.back} slope` : "roof slope"}</summary>
                        <div className="opening-head">
                          {selected.roofType === "gable" ? (
                            <select value={rl.plane} onChange={(e) => patchRl({ plane: e.target.value as Rooflight["plane"] })} aria-label="Roof slope">
                              <option value="front">{sideLabels.front} slope</option>
                              <option value="back">{sideLabels.back} slope</option>
                            </select>
                          ) : (
                            <span />
                          )}
                          <button
                            className="secondary outline"
                            onClick={() => updateWing({ ...selected, rooflights: (selected.rooflights ?? []).filter((r) => r.id !== rl.id) })}
                            aria-label="Remove rooflight"
                          >
                            ×
                          </button>
                        </div>
                        <div className="two-col">
                          <label>
                            From left (m)
                            <input type="number" step="0.1" value={rl.offsetM} onChange={(e) => patchRl({ offsetM: Number(e.target.value) })} />
                          </label>
                          <label>
                            Up slope (m)
                            <input
                              type="number"
                              step="0.1"
                              value={rl.upSlopeM}
                              onChange={(e) => patchRl({ upSlopeM: Number(e.target.value) })}
                              title="Distance from the eave to the rooflight's lower edge, measured along the slope"
                            />
                          </label>
                          <label>
                            Width (m)
                            <input type="number" step="0.1" value={rl.widthM} onChange={(e) => patchRl({ widthM: Number(e.target.value) })} />
                          </label>
                          <label>
                            Length (m)
                            <input type="number" step="0.1" value={rl.lengthM} onChange={(e) => patchRl({ lengthM: Number(e.target.value) })} title="Size up the slope" />
                          </label>
                        </div>
                      </details>
                    );
                  })}
                  <small className="muted">Hip roofs can't take rooflights yet — the hip planes need in-plane clamping first.</small>
                </details>
              )}
            </>
          )}
        </aside>

        <div className="composer-main">
          <PlanCanvas
            wings={activeWings}
            boundaryOutline={boundaryOutline}
            showBoundary={showBoundary}
            compassBearingDeg={showCompass ? bearing : undefined}
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
              <SceneEditor
                wings={activeWings}
                view={mainView}
                selectedWingId={selectedId}
                selectedOpeningId={selectedOpeningId}
                gridSize={gridSize}
                snap={snap}
                label={
                  mainView === "3d"
                    ? `Pseudo-3D placement aid (${variant} — ${activeMaterial}) — indicative only, never in the PDF; click a view below to edit an elevation`
                    : `${dirLabel(mainView)} elevation (${variant} — ${activeMaterial}) — editing`
                }
                roofColor={activeColor}
                wingColors={wingColors}
                onSelectOpening={(wingId, openingId) => {
                  if (wingId) setSelectedId(wingId);
                  setSelectedOpeningId(openingId);
                }}
                onUpdateWing={updateWing}
              />
            </div>
          )}
          <small className="muted" style={{ display: "block", marginTop: 12 }}>
        Each block owns its own materials — select a block and set <em>Roof material</em> and <em>Wall material</em> in its panel. On the proposed
        building, change the covering only on blocks that are actually being re-covered (or tick <em>covering unchanged</em>); the drawings and
        schedule follow the blocks.
      </small>

      {activeWings.length > 0 && (
        <div className="previews" style={{ marginTop: 8 }}>
          <div
            className={`preview-tile${mainView === "3d" ? " active" : ""}`}
            tabIndex={0}
            onClick={() => setMainView("3d")}
            onKeyDown={(e) => e.key === "Enter" && setMainView("3d")}
          >
            <ObliquePreview wings={activeWings} label="Pseudo-3D (aid only — not in PDF)" height={130} roofColor={activeColor} wingColors={wingColors} />
          </div>
          {(["S", "N", "E", "W"] as const).map((dir) => (
            <div
              key={dir}
              className={`preview-tile${mainView === dir ? " active" : ""}`}
                tabIndex={0}
              onClick={() => setMainView(dir)}
              onKeyDown={(e) => e.key === "Enter" && setMainView(dir)}
            >
              <ElevationScenePreview wings={activeWings} dir={dir} label={`${dirLabel(dir)} elevation`} roofColor={activeColor} wingColors={wingColors} />
            </div>
          ))}
          <PlanScenePreview wings={activeWings} label={`Roof plan (${variant})`} roofColor={activeColor} wingColors={wingColors} />
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
