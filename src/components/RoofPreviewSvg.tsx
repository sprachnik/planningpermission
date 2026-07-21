import type { Wing } from "../data/types";
import type { Scene2D } from "../geometry/composite";
import { planScene, elevationScene, obliqueScene } from "../geometry/composite";
import type { Direction } from "../geometry/composite";
import { buildWingFaces, faceNormal, faceCentroid } from "../geometry/faces3d";
import type { RoofParams } from "../data/types";
import { WALL_FILL, ROOF_FILL, ROOF_FILL_LIGHT, CONTEXT_WALL_FILL, CONTEXT_ROOF_FILL, flip, toPointsAttr, lighten, openingFill, garagePanelLines } from "./svgDraw";

const SELECTED_STROKE = "#4353ff";
const LINE = "#2b2b2b";
const MUTED = "#8a8a8a";

const STROKE = 0.06;
const FONT = 0.62;

interface FrameProps {
  widthM: number;
  heightM: number;
  pad?: number;
  height?: number | string;
  children: React.ReactNode;
}

export function Frame({ widthM, heightM, pad = 1.6, height = 190, children }: FrameProps) {
  const w = widthM + pad * 2;
  const h = heightM + pad * 2;
  return (
    <svg viewBox={`${-pad} ${-pad} ${w} ${h}`} width="100%" height={height}>
      {children}
    </svg>
  );
}

function HorizontalDim({ y, from, to, label }: { y: number; from: number; to: number; label: string }) {
  // keep dimension text readable regardless of how large the drawing is
  const s = Math.max(1, (to - from) / 18);
  return (
    <g stroke={MUTED} strokeWidth={(STROKE / 2) * s} fill={MUTED}>
      <line x1={from} y1={y} x2={to} y2={y} />
      <line x1={from} y1={y - 0.25 * s} x2={from} y2={y + 0.25 * s} />
      <line x1={to} y1={y - 0.25 * s} x2={to} y2={y + 0.25 * s} />
      <text x={(from + to) / 2} y={y + (FONT + 0.15) * s} fontSize={FONT * s} textAnchor="middle" stroke="none">
        {label}
      </text>
    </g>
  );
}

/** Renders any projected Scene2D (oblique or elevation) with wall/roof shading. */
const CHIMNEY_FILL = "#d9d2c6";

export function ScenePolygons({
  scene,
  selectedWingId,
  roofColor,
  wingColors,
}: {
  scene: Scene2D;
  selectedWingId?: string | null;
  roofColor?: string;
  /** Per-wing roof colour overrides (wing id → hex); falls back to roofColor */
  wingColors?: Record<string, string>;
}) {
  const fillFor = (poly: Scene2D["polygons"][number], i: number) => {
    if (poly.context) return poly.kind === "roof" ? CONTEXT_ROOF_FILL : CONTEXT_WALL_FILL;
    switch (poly.kind) {
      case "roof": {
        const base = wingColors?.[poly.wingId] ?? roofColor ?? ROOF_FILL;
        return i % 2 ? lighten(base, 0.22) : base;
      }
      case "opening":
        return openingFill(poly.openingType);
      case "chimney":
        return CHIMNEY_FILL;
      default:
        return WALL_FILL;
    }
  };
  return (
    <>
      {scene.polygons.map((poly, i) => (
        <g key={i}>
          <polygon
            points={toPointsAttr(flip(poly.points, scene.heightM))}
            fill={fillFor(poly, i)}
            stroke={selectedWingId && poly.wingId === selectedWingId ? SELECTED_STROKE : LINE}
            strokeWidth={selectedWingId && poly.wingId === selectedWingId ? STROKE * 2 : STROKE}
            strokeLinejoin="round"
          />
          {poly.openingType === "garage" &&
            garagePanelLines(poly.points).map(([a, b], j) => {
              const [fa, fb] = flip([a, b], scene.heightM);
              return <line key={j} x1={fa.x} y1={fa.y} x2={fb.x} y2={fb.y} stroke={LINE} strokeWidth={STROKE / 2} />;
            })}
        </g>
      ))}
    </>
  );
}

export function ObliquePreview({
  wings,
  selectedWingId,
  label,
  height,
  roofColor,
  wingColors,
}: {
  wings: Wing[];
  selectedWingId?: string | null;
  label?: string;
  height?: number | string;
  roofColor?: string;
  wingColors?: Record<string, string>;
}) {
  const scene = obliqueScene(wings);
  return (
    <div>
      {label && <div style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>}
      <Frame widthM={scene.widthM} heightM={scene.heightM} pad={0.8} height={height}>
        <ScenePolygons scene={scene} selectedWingId={selectedWingId} roofColor={roofColor} wingColors={wingColors} />
      </Frame>
    </div>
  );
}

export function ElevationScenePreview({ wings, dir, label, roofColor, wingColors }: { wings: Wing[]; dir: Direction; label: string; roofColor?: string; wingColors?: Record<string, string> }) {
  const scene = elevationScene(wings, dir);
  const groundOverhang = 0.8;
  return (
    <div>
      <div style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
      <Frame widthM={scene.widthM} heightM={scene.heightM} height={150}>
        <ScenePolygons scene={scene} roofColor={roofColor} wingColors={wingColors} />
        <line x1={-groundOverhang} y1={scene.heightM} x2={scene.widthM + groundOverhang} y2={scene.heightM} stroke={LINE} strokeWidth={STROKE * 1.5} />
        <HorizontalDim y={scene.heightM + 0.5} from={0} to={scene.widthM} label={`${scene.widthM.toFixed(1)} m`} />
      </Frame>
    </div>
  );
}

export function PlanScenePreview({ wings, label, roofColor, wingColors }: { wings: Wing[]; label: string; roofColor?: string; wingColors?: Record<string, string> }) {
  const scene = planScene(wings);
  const H = scene.heightM;
  const fillForWing = (wingId: string, context?: boolean) => {
    if (context) return CONTEXT_ROOF_FILL;
    const base = wingColors?.[wingId] ?? roofColor;
    return base ? lighten(base, 0.35) : ROOF_FILL_LIGHT;
  };
  return (
    <div>
      <div style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
      <Frame widthM={scene.widthM} heightM={scene.heightM} height={150}>
        {scene.wings.map((w) => (
          <g key={w.wingId}>
            <polygon points={toPointsAttr(flip(w.outline, H))} fill={fillForWing(w.wingId, w.context)} stroke={LINE} strokeWidth={STROKE} />
            {w.ridgeLine && (
              <line x1={w.ridgeLine[0].x} y1={H - w.ridgeLine[0].y} x2={w.ridgeLine[1].x} y2={H - w.ridgeLine[1].y} stroke={LINE} strokeWidth={STROKE * 1.8} />
            )}
            {w.hipLines.map((h, i) => (
              <line key={i} x1={h[0].x} y1={H - h[0].y} x2={h[1].x} y2={H - h[1].y} stroke={LINE} strokeWidth={STROKE} />
            ))}
            {w.slopeArrow && (
              <line
                x1={w.slopeArrow[0].x}
                y1={H - w.slopeArrow[0].y}
                x2={w.slopeArrow[1].x}
                y2={H - w.slopeArrow[1].y}
                stroke={LINE}
                strokeWidth={STROKE * 1.5}
                markerEnd="url(#plan-slope-arrow)"
              />
            )}
            {w.chimney && <polygon points={toPointsAttr(flip(w.chimney, H))} fill="#ffffff" stroke={LINE} strokeWidth={STROKE * 1.5} />}
            {w.rooflights.map((r, i) => (
              <polygon key={`rl${i}`} points={toPointsAttr(flip(r, H))} fill={openingFill("rooflight")} stroke={LINE} strokeWidth={STROKE} />
            ))}
          </g>
        ))}
        <defs>
          <marker id="plan-slope-arrow" markerWidth="6" markerHeight="6" refX="4.5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill={LINE} stroke="none" />
          </marker>
        </defs>
        <HorizontalDim y={H + 0.5} from={0} to={scene.widthM} label={`${scene.widthM.toFixed(1)} m`} />
      </Frame>
    </div>
  );
}

/** Tiny oblique thumbnail of a single roof type, for the composer palette. */
export function RoofTypeThumbnail({ params }: { params: RoofParams }) {
  const KX = 0.45;
  const KY = 0.26;
  const toViewer: [number, number, number] = [KX, -1, KY];
  const faces = buildWingFaces(params)
    .filter((f) => {
      const n = faceNormal(f.pts);
      return n[0] * toViewer[0] + n[1] * toViewer[1] + n[2] * toViewer[2] > 1e-9;
    })
    .sort((a, b) => faceCentroid(b.pts)[1] - faceCentroid(a.pts)[1]);
  const projected = faces.map((f) => ({ kind: f.kind, points: f.pts.map(([x, y, z]) => ({ x: x + KX * y, y: z + KY * y })) }));
  const allPts = projected.flatMap((p) => p.points);
  const minX = Math.min(...allPts.map((p) => p.x));
  const maxX = Math.max(...allPts.map((p) => p.x));
  const minY = Math.min(...allPts.map((p) => p.y));
  const maxY = Math.max(...allPts.map((p) => p.y));
  const H = maxY - minY;
  return (
    <svg viewBox={`-0.5 -0.5 ${maxX - minX + 1} ${H + 1}`} width="100%" height={56}>
      {projected.map((f, i) => (
        <polygon
          key={i}
          points={toPointsAttr(f.points.map((p) => ({ x: p.x - minX, y: H - (p.y - minY) })))}
          fill={f.kind === "roof" ? ROOF_FILL : WALL_FILL}
          stroke={LINE}
          strokeWidth={0.08}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
