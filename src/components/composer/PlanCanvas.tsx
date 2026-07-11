/**
 * Interactive top-down plan editor. World units are metres with y pointing
 * north (up), so all rendering flips through `sy()`; pointer positions are
 * mapped back to world via the viewBox (the svg keeps its aspect ratio
 * locked to the viewBox, so the linear map in `toWorld` stays valid).
 * Placement from the palette works pointer-up on the canvas; drags capture
 * the pointer so fast mouse moves can't drop the block mid-drag.
 */
import { useRef, useState } from "react";
import type { Wing } from "../../data/types";
import { wingsBounds, chimneyLocalRect } from "../../geometry/composite";
import { wingPlanSize, wingRotation, rotateLocalPoint } from "../../geometry/faces3d";
import { ROOF_FILL_LIGHT } from "../svgDraw";

interface Props {
  wings: Wing[];
  /**
   * Site boundary (local metres, centroid at origin) drawn as a faint
   * underlay to trace against. Always part of the viewport fit so hiding it
   * doesn't rescale the grid.
   */
  boundaryOutline?: { x: number; y: number }[];
  /** Hide the underlay without changing the viewport fit. */
  showBoundary?: boolean;
  selectedId: string | null;
  gridSize: number;
  snap: boolean;
  /** Roof type being placed from the palette (ghost follows the pointer) */
  placing: Wing | null;
  onSelect: (id: string | null) => void;
  onUpdate: (wing: Wing) => void;
  onPlace: (x: number, y: number) => void;
}

/** True when the wing's plan axes are swapped (90/270 quarter turns). */
function isSwapped(w: Pick<Wing, "rotated" | "rotationDeg">): boolean {
  const r = wingRotation(w);
  return r === 90 || r === 270;
}

/** World point → wing-local frame (inverse of the quarter-turn placement). */
function worldToLocal(px: number, py: number, w: Wing): { x: number; y: number } {
  const X = px - w.x;
  const Y = py - w.y;
  switch (wingRotation(w)) {
    case 0:
      return { x: X, y: Y };
    case 90:
      return { x: Y, y: w.depthM - X };
    case 180:
      return { x: w.widthM - X, y: w.depthM - Y };
    case 270:
      return { x: w.widthM - Y, y: X };
  }
}

const PAD_M = 3;
const MIN_VIEW_W = 18;
const MIN_VIEW_H = 14;
const HANDLE = 0.45;

export function PlanCanvas({ wings, boundaryOutline, showBoundary = true, selectedId, gridSize, snap, placing, onSelect, onUpdate, onPlace }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; mode: "move" | "resize" | "chimney" | "chimney-size"; corner?: string; startX: number; startY: number; orig: Wing } | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  /** Inline editor opened by clicking a block's dimension or name label */
  const [inlineEdit, setInlineEdit] = useState<{ id: string; px: number; py: number; kind: "dims" | "name" } | null>(null);
  // The viewport auto-fits the content, but re-fitting on every drag frame
  // makes the grid slide under the pointer — freeze it while dragging.
  const frozenViewRef = useRef<{ minX: number; minY: number; w: number; h: number } | null>(null);
  const [, endDragRender] = useState(0);

  const bounds = wingsBounds(wings);
  const outlineXs = boundaryOutline?.map((p) => p.x) ?? [];
  const outlineYs = boundaryOutline?.map((p) => p.y) ?? [];
  const fitMinX = Math.min(bounds.minX, 0, ...outlineXs) - PAD_M;
  const fitMinY = Math.min(bounds.minY, 0, ...outlineYs) - PAD_M;
  const fitted = {
    minX: fitMinX,
    minY: fitMinY,
    w: Math.max(bounds.maxX - fitMinX + PAD_M, ...outlineXs.map((x) => x - fitMinX + PAD_M), MIN_VIEW_W),
    h: Math.max(bounds.maxY - fitMinY + PAD_M, ...outlineYs.map((y) => y - fitMinY + PAD_M), MIN_VIEW_H),
  };
  const view = dragRef.current && frozenViewRef.current ? frozenViewRef.current : fitted;
  const { minX: viewMinX, minY: viewMinY, w: viewW, h: viewH } = view;
  const viewMaxY = viewMinY + viewH;

  // Text/handles are sized in metres, so a large plot (big viewport) makes
  // them unreadably small — scale them with the viewport instead.
  const s = Math.max(1, viewW / MIN_VIEW_W / 1.4);

  // world y is north-up; svg y is down — flip about the viewport
  const sy = (worldY: number) => viewMaxY - worldY + viewMinY;

  function toWorld(e: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const x = viewMinX + ((e.clientX - rect.left) / rect.width) * viewW;
    const ySvg = viewMinY + ((e.clientY - rect.top) / rect.height) * viewH;
    return { x, y: viewMaxY - ySvg + viewMinY };
  }

  const doSnap = (v: number) => (snap ? Math.round(v / gridSize) * gridSize : Math.round(v * 100) / 100);

  function startMove(e: React.PointerEvent, wing: Wing) {
    e.stopPropagation();
    onSelect(wing.id);
    const p = toWorld(e);
    frozenViewRef.current = view;
    dragRef.current = { id: wing.id, mode: "move", startX: p.x, startY: p.y, orig: wing };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function startResize(e: React.PointerEvent, wing: Wing, corner: string) {
    e.stopPropagation();
    onSelect(wing.id);
    const p = toWorld(e);
    frozenViewRef.current = view;
    dragRef.current = { id: wing.id, mode: "resize", corner, startX: p.x, startY: p.y, orig: wing };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function handleMove(e: React.PointerEvent) {
    if (placing) {
      const p = toWorld(e);
      setGhost({ x: doSnap(p.x), y: doSnap(p.y) });
    }
    const drag = dragRef.current;
    if (!drag) return;
    const p = toWorld(e);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    const orig = drag.orig;
    if (drag.mode === "move") {
      onUpdate({ ...orig, x: doSnap(orig.x + dx), y: doSnap(orig.y + dy) });
      return;
    }
    if (drag.mode === "chimney" || drag.mode === "chimney-size") {
      // work in the wing's local frame (inverse of the quarter-turn placement)
      const local = worldToLocal(p.x, p.y, orig);
      const c = orig.chimney!;
      if (drag.mode === "chimney") {
        const half = (c.alongM ?? 0.9) / 2;
        const offsetM = Math.min(Math.max(doSnap(local.x), half + 0.1), orig.widthM - half - 0.1);
        onUpdate({ ...orig, chimney: { ...c, offsetM } });
      } else {
        const r = chimneyLocalRect(orig)!;
        const alongM = Math.min(Math.max(Math.round(2 * Math.abs(local.x - r.cx) * 10) / 10, 0.4), 3);
        const acrossM = Math.min(Math.max(Math.round(2 * Math.abs(local.y - r.cy) * 10) / 10, 0.3), 2);
        onUpdate({ ...orig, chimney: { ...c, alongM, acrossM } });
      }
      return;
    }
    // resize from a corner, opposite corner stays fixed
    const { w: pw, d: pd } = wingPlanSize(orig);
    let x1 = orig.x;
    let y1 = orig.y;
    let x2 = orig.x + pw;
    let y2 = orig.y + pd;
    if (drag.corner!.includes("w")) x1 = doSnap(orig.x + dx);
    if (drag.corner!.includes("e")) x2 = doSnap(orig.x + pw + dx);
    if (drag.corner!.includes("s")) y1 = doSnap(orig.y + dy);
    if (drag.corner!.includes("n")) y2 = doSnap(orig.y + pd + dy);
    const newW = Math.max(gridSize, x2 - x1);
    const newD = Math.max(gridSize, y2 - y1);
    onUpdate({
      ...orig,
      x: x1,
      y: y1,
      widthM: isSwapped(orig) ? newD : newW,
      depthM: isSwapped(orig) ? newW : newD,
    });
  }

  function handleUp(e: React.PointerEvent) {
    if (dragRef.current) {
      dragRef.current = null;
      frozenViewRef.current = null;
      endDragRender((n) => n + 1); // re-fit the viewport now the drag is done
    }
    if (placing && ghost) {
      onPlace(ghost.x, ghost.y);
      setGhost(null);
    } else if (placing) {
      const p = toWorld(e);
      onPlace(doSnap(p.x), doSnap(p.y));
    }
  }

  // grid lines
  const gridLines: React.ReactNode[] = [];
  const startGX = Math.floor(viewMinX / gridSize) * gridSize;
  const startGY = Math.floor(viewMinY / gridSize) * gridSize;
  const isMajor = (v: number) => Math.abs(v / (gridSize * 5) - Math.round(v / (gridSize * 5))) < 1e-6;
  for (let gx = startGX; gx <= viewMinX + viewW; gx += gridSize) {
    gridLines.push(<line key={`vx${gx}`} x1={gx} y1={viewMinY} x2={gx} y2={viewMinY + viewH} stroke="var(--pico-muted-border-color)" strokeWidth={(isMajor(gx) ? 0.04 : 0.015) * s} />);
  }
  for (let gy = startGY; gy <= viewMinY + viewH; gy += gridSize) {
    gridLines.push(<line key={`hy${gy}`} x1={viewMinX} y1={sy(gy)} x2={viewMinX + viewW} y2={sy(gy)} stroke="var(--pico-muted-border-color)" strokeWidth={(isMajor(gy) ? 0.04 : 0.015) * s} />);
  }

  const editWing = inlineEdit ? wings.find((w) => w.id === inlineEdit.id) : null;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
    <svg
      ref={svgRef}
      className="plan-canvas"
      viewBox={`${viewMinX} ${viewMinY} ${viewW} ${viewH}`}
      style={{ width: "100%", aspectRatio: `${viewW} / ${viewH}`, touchAction: "none", cursor: placing ? "copy" : "default" }}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerDown={() => {
        onSelect(null);
        setInlineEdit(null);
      }}
    >
      {gridLines}
      {showBoundary && boundaryOutline && boundaryOutline.length >= 3 && (
        <g pointerEvents="none">
          <polygon
            points={boundaryOutline.map((p) => `${p.x},${sy(p.y)}`).join(" ")}
            fill="#e02424"
            fillOpacity={0.04}
            stroke="#e02424"
            strokeOpacity={0.5}
            strokeWidth={0.08 * s}
            strokeDasharray={`${0.5 * s},${0.35 * s}`}
          />
          <text x={Math.min(...boundaryOutline.map((p) => p.x)) + 0.3} y={sy(Math.max(...boundaryOutline.map((p) => p.y))) + 1 * s} fontSize={0.6 * s} fill="#e02424" fillOpacity={0.6}>
            site boundary
          </text>
        </g>
      )}
      {/* scale bar: one major grid cell labelled */}
      <g fill="var(--pico-muted-color)" stroke="none">
        <text x={viewMinX + 0.4 * s} y={viewMinY + 1 * s} fontSize={0.75 * s}>
          grid {gridSize} m{snap ? " · snap on" : ""}
        </text>
        <line x1={viewMinX + 0.4 * s} y1={viewMinY + 1.6 * s} x2={viewMinX + 0.4 * s + gridSize * 5} y2={viewMinY + 1.6 * s} stroke="var(--pico-muted-color)" strokeWidth={0.08 * s} />
        <text x={viewMinX + 0.4 * s} y={viewMinY + 2.4 * s} fontSize={0.6 * s}>
          {gridSize * 5} m
        </text>
        <text x={viewMinX + viewW - 0.4 * s} y={viewMinY + 1 * s} fontSize={0.75 * s} textAnchor="end">
          {viewW.toFixed(1)} × {viewH.toFixed(1)} m
        </text>
      </g>
      {wings.map((w) => {
        const { w: pw, d: pd } = wingPlanSize(w);
        const selected = w.id === selectedId;
        const corners = [
          { key: "sw", x: w.x, y: w.y },
          { key: "se", x: w.x + pw, y: w.y },
          { key: "ne", x: w.x + pw, y: w.y + pd },
          { key: "nw", x: w.x, y: w.y + pd },
        ];
        return (
          <g key={w.id}>
            <rect
              x={w.x}
              y={sy(w.y + pd)}
              width={pw}
              height={pd}
              fill={ROOF_FILL_LIGHT}
              fillOpacity={0.85}
              stroke={selected ? "#4353ff" : "#2b2b2b"}
              strokeWidth={(selected ? 0.12 : 0.06) * s}
              style={{ cursor: "move" }}
              onPointerDown={(e) => startMove(e, w)}
            />
            {/* ridge indicator */}
            {w.roofType !== "mono-pitch" &&
              (isSwapped(w) ? (
                <line x1={w.x + pw / 2} y1={sy(w.y + (w.roofType === "hip" ? Math.min(pw / 2, pd) : 0))} x2={w.x + pw / 2} y2={sy(w.y + pd - (w.roofType === "hip" ? Math.min(pw / 2, pd) : 0))} stroke="#2b2b2b" strokeWidth={0.08 * s} pointerEvents="none" />
              ) : (
                <line x1={w.x + (w.roofType === "hip" ? Math.min(pd / 2, pw) : 0)} y1={sy(w.y + pd / 2)} x2={w.x + pw - (w.roofType === "hip" ? Math.min(pd / 2, pw) : 0)} y2={sy(w.y + pd / 2)} stroke="#2b2b2b" strokeWidth={0.08 * s} pointerEvents="none" />
              ))}
            {/* the name sits at the block's centre where select/drag clicks land,
                so it behaves like the block — double-click opens the renamer */}
            <text
              x={w.x + pw / 2}
              y={sy(w.y + pd / 2) + 0.6 * s}
              fontSize={0.6 * s}
              textAnchor="middle"
              fill="#2b2b2b"
              style={{ cursor: "move" }}
              onPointerDown={(e) => startMove(e, w)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                const rect = wrapRef.current!.getBoundingClientRect();
                setInlineEdit({ id: w.id, px: e.clientX - rect.left, py: e.clientY - rect.top, kind: "name" });
              }}
            >
              <title>Double-click to rename</title>
              {w.name}
            </text>
            {(() => {
              const c = chimneyLocalRect(w);
              if (!c) return null;
              // local rect → world (rotation swaps axes)
              const centre = rotateLocalPoint(c.cx, c.cy, wingRotation(w), w.widthM, w.depthM);
              const cxW = w.x + centre.x;
              const cyW = w.y + centre.y;
              const hx = isSwapped(w) ? c.b : c.a;
              const hy = isSwapped(w) ? c.a : c.b;
              return (
                <>
                  <rect
                    x={cxW - hx}
                    y={sy(cyW + hy)}
                    width={hx * 2}
                    height={hy * 2}
                    fill="#fff"
                    stroke="#2b2b2b"
                    strokeWidth={0.05 * s}
                    style={{ cursor: "move" }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onSelect(w.id);
                      const p = toWorld(e);
                      frozenViewRef.current = view;
                      dragRef.current = { id: w.id, mode: "chimney", startX: p.x, startY: p.y, orig: w };
                      (e.target as Element).setPointerCapture(e.pointerId);
                    }}
                  >
                    <title>Chimney — drag along the ridge</title>
                  </rect>
                  {selected && (
                    <rect
                      x={cxW + hx - (HANDLE * s) / 3}
                      y={sy(cyW - hy) - (HANDLE * s) / 3}
                      width={((HANDLE * s) / 3) * 2}
                      height={((HANDLE * s) / 3) * 2}
                      fill="#4353ff"
                      style={{ cursor: "nwse-resize" }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        const p = toWorld(e);
                        frozenViewRef.current = view;
                        dragRef.current = { id: w.id, mode: "chimney-size", startX: p.x, startY: p.y, orig: w };
                        (e.target as Element).setPointerCapture(e.pointerId);
                      }}
                    >
                      <title>Resize chimney</title>
                    </rect>
                  )}
                </>
              );
            })()}
            <text
              x={w.x + pw / 2}
              y={sy(w.y) + 0.75 * s}
              fontSize={0.55 * s}
              textAnchor="middle"
              fill="var(--pico-muted-color)"
              style={{ cursor: "text" }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(w.id);
                const rect = wrapRef.current!.getBoundingClientRect();
                setInlineEdit({ id: w.id, px: e.clientX - rect.left, py: e.clientY - rect.top, kind: "dims" });
              }}
            >
              {pw.toFixed(1)} × {pd.toFixed(1)} m
            </text>
            {selected &&
              corners.map((c) => (
                <rect
                  key={c.key}
                  x={c.x - (HANDLE * s) / 2}
                  y={sy(c.y) - (HANDLE * s) / 2}
                  width={HANDLE * s}
                  height={HANDLE * s}
                  fill="#4353ff"
                  style={{ cursor: `${c.key}-resize` }}
                  onPointerDown={(e) => startResize(e, w, c.key)}
                />
              ))}
            {selected && (
              // rotate 90° (snap rotation — the model is axis-aligned); also on the R key
              <g
                style={{ cursor: "pointer" }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate({ ...w, rotationDeg: (((wingRotation(w) + 90) % 360) as 0 | 90 | 180 | 270), rotated: undefined });
                }}
              >
                <title>Rotate 90° (R)</title>
                <circle cx={w.x + pw / 2} cy={sy(w.y + pd) - 0.9 * s} r={0.45 * s} fill="#fff" stroke="#4353ff" strokeWidth={0.06 * s} />
                <text x={w.x + pw / 2} y={sy(w.y + pd) - 0.9 * s + 0.22 * s} fontSize={0.6 * s} textAnchor="middle" fill="#4353ff">
                  ⟳
                </text>
              </g>
            )}
          </g>
        );
      })}
      {placing && ghost && (
        <rect x={ghost.x} y={sy(ghost.y + placing.depthM)} width={placing.widthM} height={placing.depthM} fill="#4353ff" fillOpacity={0.25} stroke="#4353ff" strokeDasharray="0.3,0.2" strokeWidth={0.08} pointerEvents="none" />
      )}
    </svg>
      {inlineEdit && editWing && (
        <div
          className="dim-editor"
          style={{ left: inlineEdit.px, top: inlineEdit.py }}
          onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && setInlineEdit(null)}
        >
          {inlineEdit.kind === "dims" ? (
            <>
              <input
                type="number"
                step="0.1"
                autoFocus
                value={isSwapped(editWing) ? editWing.depthM : editWing.widthM}
                onChange={(e) => onUpdate(isSwapped(editWing) ? { ...editWing, depthM: Number(e.target.value) } : { ...editWing, widthM: Number(e.target.value) })}
                aria-label="Plan width (m)"
              />
              <span>×</span>
              <input
                type="number"
                step="0.1"
                value={isSwapped(editWing) ? editWing.widthM : editWing.depthM}
                onChange={(e) => onUpdate(isSwapped(editWing) ? { ...editWing, widthM: Number(e.target.value) } : { ...editWing, depthM: Number(e.target.value) })}
                aria-label="Plan depth (m)"
              />
              <span>m</span>
            </>
          ) : (
            <input autoFocus value={editWing.name} onChange={(e) => onUpdate({ ...editWing, name: e.target.value })} aria-label="Block name" style={{ width: "9rem" }} />
          )}
          <button onClick={() => setInlineEdit(null)} aria-label="Done">
            ✓
          </button>
        </div>
      )}
    </div>
  );
}
