/**
 * The composer's main editing viewport. Renders either the pseudo-3D
 * (cabinet oblique) projection or any orthographic elevation, with a grid,
 * and lets openings (windows/doors) be selected, dragged and corner-resized
 * directly in whichever view is active: pointer deltas are decomposed against
 * the projected direction of the opening's wall axis (u) and the vertical
 * (0,1), giving along-wall offset and sill changes in real metres, snapped to
 * the grid. Openings on walls hidden in one view are edited by switching view.
 */
import { useRef } from "react";
import type { Opening, Wing } from "../../data/types";
import { obliqueScene, elevationScene, wingsBounds, OBLIQUE_KX, OBLIQUE_KY } from "../../geometry/composite";
import { wingRotation } from "../../geometry/faces3d";
import type { Direction } from "../../geometry/composite";
import type { Point } from "../../geometry/roof";
import { WALL_FILL, ROOF_FILL, lighten, toPointsAttr } from "../svgDraw";

export type EditorView = "3d" | Direction;

const LINE = "#2b2b2b";
const SELECTED_STROKE = "#4353ff";
const STROKE = 0.06;

interface Props {
  wings: Wing[];
  view: EditorView;
  selectedWingId: string | null;
  selectedOpeningId: string | null;
  gridSize: number;
  snap: boolean;
  label: string;
  roofColor?: string;
  /** Per-wing roof colour overrides (wing id → hex) */
  wingColors?: Record<string, string>;
  onSelectOpening: (wingId: string | null, openingId: string | null) => void;
  onUpdateWing: (wing: Wing) => void;
}

/** Direction of increasing `offsetM` on each wall, in the wing's local frame. */
const LOCAL_OFFSET_DIR: Record<Opening["side"], [number, number]> = {
  front: [1, 0],
  back: [-1, 0],
  left: [0, -1],
  right: [0, 1],
};

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Projected direction (scene coords, y-up) of increasing opening offset. */
function offsetDirInView(wing: Wing, side: Opening["side"], view: EditorView): Point {
  const [lx, ly] = LOCAL_OFFSET_DIR[side];
  // rotate the local direction by the wing's quarter turns (CCW)
  let wdx = lx;
  let wdy = ly;
  switch (wingRotation(wing)) {
    case 90:
      [wdx, wdy] = [-ly, lx];
      break;
    case 180:
      [wdx, wdy] = [-lx, -ly];
      break;
    case 270:
      [wdx, wdy] = [ly, -lx];
      break;
  }
  switch (view) {
    case "3d":
      return { x: wdx + OBLIQUE_KX * wdy, y: OBLIQUE_KY * wdy };
    case "S":
      return { x: wdx, y: 0 };
    case "N":
      return { x: -wdx, y: 0 };
    case "E":
      return { x: wdy, y: 0 };
    case "W":
      return { x: -wdy, y: 0 };
  }
}

export function SceneEditor({ wings, view, selectedWingId, selectedOpeningId, gridSize, snap, label, roofColor, wingColors, onSelectOpening, onUpdateWing }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    wingId: string;
    openingId: string;
    mode: "move" | "resize";
    /** Semantic corner being resized: 0=(offset,sill) 1=(offset+w,sill) 2=(offset+w,sill+h) 3=(offset,sill+h) */
    corner?: 0 | 1 | 2 | 3;
    startX: number;
    startY: number;
    orig: Opening;
  } | null>(null);

  const scene = view === "3d" ? obliqueScene(wings) : elevationScene(wings, view);
  const roofBaseFor = (wingId: string) => wingColors?.[wingId] ?? roofColor ?? ROOF_FILL;

  // Grid: ground plane for the oblique view, a flat metre grid for elevations.
  const gridLines: { a: Point; b: Point; major: boolean }[] = [];
  const isMajor = (v: number) => Math.abs(v / (gridSize * 5) - Math.round(v / (gridSize * 5))) < 1e-6;
  if (view === "3d") {
    const project = (x: number, y: number): Point => ({ x: x + OBLIQUE_KX * y - scene.origin.x, y: OBLIQUE_KY * y - scene.origin.y });
    const bounds = wingsBounds(wings);
    const g0x = Math.floor((bounds.minX - 1) / gridSize) * gridSize;
    const g1x = Math.ceil((bounds.maxX + 1) / gridSize) * gridSize;
    const g0y = Math.floor((bounds.minY - 1) / gridSize) * gridSize;
    const g1y = Math.ceil((bounds.maxY + 1) / gridSize) * gridSize;
    for (let gx = g0x; gx <= g1x + 1e-9; gx += gridSize) {
      gridLines.push({ a: project(gx, g0y), b: project(gx, g1y), major: isMajor(gx) });
    }
    for (let gy = g0y; gy <= g1y + 1e-9; gy += gridSize) {
      gridLines.push({ a: project(g0x, gy), b: project(g1x, gy), major: isMajor(gy) });
    }
  } else {
    for (let gx = 0; gx <= scene.widthM + 1e-9; gx += gridSize) {
      gridLines.push({ a: { x: gx, y: 0 }, b: { x: gx, y: scene.heightM }, major: isMajor(gx) });
    }
    for (let gy = 0; gy <= scene.heightM + 1e-9; gy += gridSize) {
      gridLines.push({ a: { x: 0, y: gy }, b: { x: scene.widthM, y: gy }, major: isMajor(gy) });
    }
  }

  // Viewport: scene extent ∪ grid extent, padded.
  const gridPts = gridLines.flatMap((l) => [l.a, l.b]);
  const pad = 0.8;
  const vMinX = Math.min(0, ...gridPts.map((p) => p.x)) - pad;
  const vMinY = Math.min(0, ...gridPts.map((p) => p.y)) - pad;
  const vMaxX = Math.max(scene.widthM, ...gridPts.map((p) => p.x)) + pad;
  const vMaxY = Math.max(scene.heightM, ...gridPts.map((p) => p.y)) + pad;
  const vW = vMaxX - vMinX;
  const vH = vMaxY - vMinY;
  // scene y is up-positive; svg y is down — flip within the viewport
  const sy = (y: number) => vMinY + vMaxY - y;
  const fs = Math.max(1, vW / 30);

  function toScene(e: React.PointerEvent): Point {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = vMinX + ((e.clientX - rect.left) / rect.width) * vW;
    const ySvg = vMinY + ((e.clientY - rect.top) / rect.height) * vH;
    return { x, y: vMinY + vMaxY - ySvg };
  }

  const doSnap = (v: number) => (snap ? Math.round(v / gridSize) * gridSize : Math.round(v * 100) / 100);

  function startDrag(e: React.PointerEvent, wingId: string, openingId: string, mode: "move" | "resize", corner?: 0 | 1 | 2 | 3) {
    e.stopPropagation();
    const wing = wings.find((w) => w.id === wingId);
    const opening = wing?.openings?.find((o) => o.id === openingId);
    if (!wing || !opening) return;
    onSelectOpening(wingId, openingId);
    const p = toScene(e);
    dragRef.current = { wingId, openingId, mode, corner, startX: p.x, startY: p.y, orig: opening };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function handleMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const wing = wings.find((w) => w.id === drag.wingId);
    if (!wing) return;
    const p = toScene(e);
    const d = { x: p.x - drag.startX, y: p.y - drag.startY };

    // Decompose the pointer delta: d ≈ da·u + db·(0,1), where u is the
    // projected direction of increasing offset along the wall.
    const u = offsetDirInView(wing, drag.orig.side, view);
    if (Math.abs(u.x) < 1e-9) return; // wall edge-on in this view
    const da = d.x / u.x;
    const db = d.y - da * u.y;

    const wallLen = drag.orig.side === "front" || drag.orig.side === "back" ? wing.widthM : wing.depthM;
    const orig = drag.orig;
    let patch: Partial<Opening>;

    if (drag.mode === "move") {
      const offsetM = clamp(doSnap(orig.offsetM + da), 0.05, wallLen - orig.widthM - 0.05);
      const sillM = orig.type === "door" ? 0 : clamp(doSnap(orig.sillM + db), 0, wing.eaveHeightM - orig.heightM - 0.05);
      patch = { offsetM, sillM };
    } else {
      // resize: the dragged corner moves, its opposite edges stay put
      const corner = drag.corner!;
      patch = {};
      if (corner === 0 || corner === 3) {
        // offset edge: keep the far edge fixed
        const offsetM = clamp(doSnap(orig.offsetM + da), 0.05, orig.offsetM + orig.widthM - 0.3);
        patch.offsetM = offsetM;
        patch.widthM = orig.offsetM + orig.widthM - offsetM;
      } else {
        patch.widthM = clamp(doSnap(orig.widthM + da), 0.3, wallLen - orig.offsetM - 0.05);
      }
      if (corner === 2 || corner === 3) {
        // top edge
        patch.heightM = clamp(doSnap(orig.heightM + db), 0.3, wing.eaveHeightM - orig.sillM - 0.05);
      } else if (orig.type !== "door") {
        // bottom edge: keep the head fixed (doors stay grounded)
        const sillM = clamp(doSnap(orig.sillM + db), 0, orig.sillM + orig.heightM - 0.3);
        patch.sillM = sillM;
        patch.heightM = orig.sillM + orig.heightM - sillM;
      }
    }

    onUpdateWing({
      ...wing,
      openings: (wing.openings ?? []).map((o) => (o.id === drag.openingId ? { ...o, ...patch } : o)),
    });
  }

  function handleUp() {
    dragRef.current = null;
  }

  return (
    <div>
      <div style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
      <svg
        ref={svgRef}
        viewBox={`${vMinX} ${vMinY} ${vW} ${vH}`}
        // aspect ratio locked to the viewBox so the linear pointer→metre map
        // in toScene stays valid (no preserveAspectRatio letterboxing)
        style={{ width: "100%", aspectRatio: `${vW} / ${vH}`, touchAction: "none" }}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerDown={() => onSelectOpening(selectedWingId, null)}
      >
        <g pointerEvents="none">
          {gridLines.map((l, i) => (
            <line key={i} x1={l.a.x} y1={sy(l.a.y)} x2={l.b.x} y2={sy(l.b.y)} stroke="var(--pico-muted-border-color)" strokeWidth={(l.major ? 0.04 : 0.015) * fs} />
          ))}
        </g>
        {view !== "3d" && (
          <line x1={-0.8} y1={sy(0)} x2={scene.widthM + 0.8} y2={sy(0)} stroke={LINE} strokeWidth={STROKE * 1.5} pointerEvents="none" />
        )}
        {scene.polygons.map((poly, i) => {
          const isOpening = poly.kind === "opening";
          const isSelected = isOpening && poly.openingId === selectedOpeningId;
          const fill =
            poly.kind === "roof"
              ? i % 2
                ? lighten(roofBaseFor(poly.wingId), 0.22)
                : roofBaseFor(poly.wingId)
              : poly.kind === "opening"
                ? "#ffffff"
                : poly.kind === "chimney"
                  ? "#d9d2c6"
                  : WALL_FILL;
          return (
            <polygon
              key={i}
              points={toPointsAttr(poly.points.map((p) => ({ x: p.x, y: sy(p.y) })))}
              fill={fill}
              stroke={isSelected ? SELECTED_STROKE : selectedWingId && poly.wingId === selectedWingId && poly.kind !== "opening" ? SELECTED_STROKE : LINE}
              strokeWidth={isSelected ? STROKE * 2.5 : STROKE}
              strokeLinejoin="round"
              style={isOpening ? { cursor: "move" } : undefined}
              onPointerDown={isOpening && poly.openingId ? (e) => startDrag(e, poly.wingId, poly.openingId!, "move") : undefined}
            />
          );
        })}
        {(() => {
          // Corner handles for the selected opening. Face points are built in
          // the order (offset,sill) → (+w,sill) → (+w,+h) → (offset,+h) and
          // true rotations preserve that order.
          const poly = scene.polygons.find((p) => p.kind === "opening" && p.openingId === selectedOpeningId);
          const wing = poly && wings.find((w) => w.id === poly.wingId);
          if (!poly || !wing || poly.points.length !== 4) return null;
          const pts = poly.points;
          const HANDLE = 0.18;
          return pts.map((p, k) => (
            <rect
              key={`h${k}`}
              x={p.x - HANDLE / 2}
              y={sy(p.y) - HANDLE / 2}
              width={HANDLE}
              height={HANDLE}
              fill={SELECTED_STROKE}
              stroke="#fff"
              strokeWidth={0.03}
              style={{ cursor: k === 0 || k === 2 ? "nesw-resize" : "nwse-resize" }}
              onPointerDown={(e) => startDrag(e, poly.wingId, poly.openingId!, "resize", k as 0 | 1 | 2 | 3)}
            />
          ));
        })()}
        <text x={vMinX + 0.3} y={vMinY + 0.7 * fs} fontSize={0.55 * fs} fill="var(--pico-muted-color)" pointerEvents="none">
          grid {gridSize} m{snap ? " · snap on" : ""} — drag windows/doors to move, corners to resize
        </text>
      </svg>
    </div>
  );
}
