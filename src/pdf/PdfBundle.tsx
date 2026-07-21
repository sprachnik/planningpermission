import { Fragment } from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { PlanningCase, Wing } from "../data/types";
import type { Point } from "../geometry/roof";
import { planScene, elevationScene, buildingHeights, groundSegments } from "../geometry/composite";
import type { Direction, Scene2D } from "../geometry/composite";
import { DrawingPage, OutlinePath, LineSegment } from "./DrawingKit";
import { boundaryCentroid, toLocalMetres, boundaryBoundingBoxM } from "../geometry/latlng";
import { boundaryInPlanFrame, boundaryClearances } from "../geometry/siteplan";
import { CONTENT_WIDTH_MM, CONTENT_HEIGHT_MM, fitDrawingScale, PT_PER_MM, PAGE_WIDTH_MM, PAGE_HEIGHT_MM, MARGIN_MM } from "./scale";
import { roofColorFor, lighten, openingFill, garagePanelLines, CONTEXT_WALL_FILL, CONTEXT_ROOF_FILL } from "../components/svgDraw";
import { windSuffix } from "../geometry/compass";
import { geometryUnchanged, wingChanges } from "../data/caseGeometry";

const WALL_FILL = "#f2f2f2";
const RED_LINE = "#e02424";
const BLUE_LINE = "#1d4ed8";

/** True bearing the plan grid's "up" faces: explicit case setting, else the
 *  boundary-underlay rotation (aligning the true-north-up plot to the grid by
 *  R° CCW means grid-up faces bearing R), else grid north = true north. */
function northBearing(planningCase: PlanningCase): number {
  return planningCase.northBearingDeg ?? planningCase.composerBoundaryRotationDeg ?? 0;
}

/** The wing set a page should draw: proposed pages use proposedWings when the geometry diverged. */
function wingsFor(planningCase: PlanningCase, proposed: boolean): Wing[] {
  return (proposed ? planningCase.proposedWings : undefined) ?? planningCase.wings!;
}


/** Per-wing material overrides describe the variant their wing set belongs
 *  to, so they only apply to proposed pages once proposedWings exists. */
function overridesApply(planningCase: PlanningCase, proposed: boolean): boolean {
  return !proposed || !!planningCase.proposedWings;
}

/** A wing's effective roof covering (label + swatch) for one variant, taking
 *  per-block overrides and the "covering unchanged" flag into account. */
function resolveWingMaterial(planningCase: PlanningCase, wing: Wing, proposed: boolean): { label: string; color: string } {
  if (proposed && wing.materialUnchanged) {
    const existing = (planningCase.wings ?? []).find((w) => w.id === wing.id);
    return {
      label: `${existing?.material?.trim() || planningCase.materials.existing || "existing covering"} (unchanged)`,
      color: existing?.materialColor ?? roofColorFor(planningCase.materials, false),
    };
  }
  const base = proposed ? planningCase.materials.proposed : planningCase.materials.existing;
  return {
    label: wing.material?.trim() || base || "not specified",
    color: wing.materialColor ?? roofColorFor(planningCase.materials, proposed),
  };
}

function wingColorMap(planningCase: PlanningCase, proposed: boolean): Record<string, string> {
  if (!overridesApply(planningCase, proposed)) return {};
  const wings = wingsFor(planningCase, proposed);
  return Object.fromEntries(wings.map((w) => [w.id, resolveWingMaterial(planningCase, w, proposed).color]));
}

/** "Roof covering: X" — or a per-block list when blocks differ. Context-only
 *  neighbour blocks are not part of the application and are excluded. */
function materialsNote(planningCase: PlanningCase, proposed: boolean): string {
  const wings = wingsFor(planningCase, proposed).filter((w) => !w.isContext);
  const base = (proposed ? planningCase.materials.proposed : planningCase.materials.existing) || "not specified";
  const apply = overridesApply(planningCase, proposed);
  if (!apply) return `Roof covering: ${base}`;
  const labels = wings.map((w) => resolveWingMaterial(planningCase, w, proposed).label);
  if (new Set(labels).size <= 1) return `Roof covering: ${labels[0] ?? base}`;
  return `Roof coverings: ${wings.map((w, i) => `${w.name} — ${labels[i]}`).join("; ")}`;
}

/** Common title-block fields threaded to every page. */
interface PageMeta {
  address: string;
  dateISO: string;
  drawingNumber: string;
  applicantLine?: string;
}

/** "Applicant: … · Agent: …" when either is captured. */
function applicantLineFor(planningCase: PlanningCase): string | undefined {
  const parts = [];
  if (planningCase.applicant?.trim()) parts.push(`Applicant: ${planningCase.applicant.trim()}`);
  if (planningCase.agent?.trim()) parts.push(`Agent: ${planningCase.agent.trim()}`);
  return parts.length ? parts.join(" · ") : undefined;
}

/** Text placed at a real-world point on a drawing (sizes in page mm). */
function SvgText({ at, toMm, size = 2.6, color = "#111", anchor = "middle", children }: { at: Point; toMm: (p: Point) => Point; size?: number; color?: string; anchor?: "middle" | "start" | "end"; children: string }) {
  const q = toMm(at);
  return (
    <Text x={q.x} y={q.y} textAnchor={anchor} style={{ fontSize: size, fill: color }}>
      {children}
    </Text>
  );
}

/** A dimension line with end ticks and a centred distance label. */
function DimLine({ from, to, label, toMm }: { from: Point; to: Point; label: string; toMm: (p: Point) => Point }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // unit perpendicular for the end ticks and label offset
  const px = -dy / len;
  const py = dx / len;
  const tick = 0.4;
  const mid = { x: (from.x + to.x) / 2 + px * 0.9, y: (from.y + to.y) / 2 + py * 0.9 };
  return (
    <>
      <LineSegment from={from} to={to} toMm={toMm} stroke="#555" strokeWidth={0.25} />
      <LineSegment from={{ x: from.x - px * tick, y: from.y - py * tick }} to={{ x: from.x + px * tick, y: from.y + py * tick }} toMm={toMm} stroke="#555" strokeWidth={0.25} />
      <LineSegment from={{ x: to.x - px * tick, y: to.y - py * tick }} to={{ x: to.x + px * tick, y: to.y + py * tick }} toMm={toMm} stroke="#555" strokeWidth={0.25} />
      <SvgText at={mid} toMm={toMm} size={2.4} color="#333">
        {label}
      </SvgText>
    </>
  );
}

/** The centroid of a polygon's vertices — good enough to place a label. */
function polyCentroid(points: Point[]): Point {
  return {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  };
}

function RoofPlanPage({ planningCase, proposed, meta }: { planningCase: PlanningCase; proposed: boolean; meta: PageMeta }) {
  const wings = wingsFor(planningCase, proposed);
  const scene = planScene(wings);
  const colors = wingColorMap(planningCase, proposed);
  const baseColor = roofColorFor(planningCase.materials, proposed);
  const roofFillFor = (wingId: string, context?: boolean) => (context ? CONTEXT_ROOF_FILL : lighten(colors[wingId] ?? baseColor, 0.45));
  const extent = { width: scene.widthM, height: scene.heightM };
  const changes = proposed ? wingChanges(planningCase) : undefined;
  const changeLabel = (wingId: string): string | null =>
    changes?.newIds.has(wingId) ? "NEW" : changes?.alteredIds.has(wingId) ? "ALTERED" : null;
  const notes = [materialsNote(planningCase, proposed)];
  if (proposed && geometryUnchanged(planningCase)) {
    notes.push("Roof geometry unchanged — replacement of roof covering only");
  }
  if (wings.some((w) => w.isContext)) {
    notes.push("Grey blocks are neighbouring buildings, shown for context only");
  }
  return (
    <DrawingPage
      title={`${proposed ? "Proposed" : "Existing"} Roof Plan`}
      address={meta.address}
      applicantLine={meta.applicantLine}
      scaleDenominator={fitDrawingScale(extent)}
      drawingExtentM={extent}
      drawingNumber={meta.drawingNumber}
      dateISO={meta.dateISO}
      notes={notes}
      showNorthArrow
      northBearingDeg={northBearing(planningCase)}
    >
      {(toMm) => (
        <>
          {scene.wings.map((w, i) => (
            <OutlinePath key={`o${i}`} points={w.outline} toMm={toMm} fill={roofFillFor(w.wingId, w.context)} />
          ))}
          {scene.wings.map((w, i) => (
            <Fragment key={`l${i}`}>
              {w.ridgeLine && <LineSegment from={w.ridgeLine[0]} to={w.ridgeLine[1]} toMm={toMm} strokeWidth={0.5} />}
              {w.hipLines.map((h, j) => (
                <LineSegment key={j} from={h[0]} to={h[1]} toMm={toMm} />
              ))}
              {w.slopeArrow && <LineSegment from={w.slopeArrow[0]} to={w.slopeArrow[1]} toMm={toMm} dashed />}
              {w.chimney && <OutlinePath points={w.chimney} toMm={toMm} fill="#ffffff" strokeWidth={0.4} />}
              {w.rooflights.map((r, j) => (
                <OutlinePath key={`rl${j}`} points={r} toMm={toMm} fill={openingFill("rooflight")} strokeWidth={0.3} />
              ))}
              {changeLabel(w.wingId) && (
                <SvgText at={polyCentroid(w.outline)} toMm={toMm} size={3} color={RED_LINE}>
                  {changeLabel(w.wingId)!}
                </SvgText>
              )}
            </Fragment>
          ))}
        </>
      )}
    </DrawingPage>
  );
}

function ScenePolygonsPdf({
  scene,
  toMm,
  roofColor,
  wingColors,
  offsetX = 0,
}: {
  scene: Scene2D;
  toMm: (p: Point) => Point;
  roofColor: string;
  wingColors?: Record<string, string>;
  offsetX?: number;
}) {
  const fillFor = (poly: Scene2D["polygons"][number], i: number) => {
    if (poly.context) return poly.kind === "roof" ? CONTEXT_ROOF_FILL : CONTEXT_WALL_FILL;
    switch (poly.kind) {
      case "roof": {
        const base = wingColors?.[poly.wingId] ?? roofColor;
        return i % 2 ? lighten(base, 0.22) : base;
      }
      case "opening":
        return openingFill(poly.openingType);
      case "chimney":
        return "#d9d2c6";
      default:
        return WALL_FILL;
    }
  };
  return (
    <>
      {scene.polygons.map((poly, i) => (
        <Fragment key={i}>
          <OutlinePath
            points={poly.points.map((p) => ({ x: p.x + offsetX, y: p.y }))}
            toMm={toMm}
            fill={fillFor(poly, i)}
          />
          {poly.openingType === "garage" &&
            garagePanelLines(poly.points).map(([a, b], j) => (
              <LineSegment key={j} from={{ x: a.x + offsetX, y: a.y }} to={{ x: b.x + offsetX, y: b.y }} toMm={toMm} strokeWidth={0.2} />
            ))}
        </Fragment>
      ))}
    </>
  );
}

function ElevationsPage({
  planningCase,
  proposed,
  dirs,
  meta,
}: {
  planningCase: PlanningCase;
  proposed: boolean;
  dirs: [Direction, Direction];
  meta: PageMeta;
}) {
  const wings = wingsFor(planningCase, proposed);
  const roofColor = roofColorFor(planningCase.materials, proposed);
  const wingColors = wingColorMap(planningCase, proposed);
  const sceneA = elevationScene(wings, dirs[0]);
  const sceneB = elevationScene(wings, dirs[1]);
  const gap = 2;
  const bOffset = sceneA.widthM + gap;
  const bearing = northBearing(planningCase);
  const dirName: Record<Direction, string> = { N: "North", E: "East", S: "South", W: "West" };
  const elevName = (dir: Direction) => `${dirName[dir]}${windSuffix(dir, bearing)}`;
  const extent = { width: sceneA.widthM + gap + sceneB.widthM, height: Math.max(sceneA.heightM, sceneB.heightM) };

  const notes = [materialsNote(planningCase, proposed)];
  const heights = buildingHeights(wings);
  notes.push(
    `Maximum height ${heights.maxRidgeM.toFixed(2)} m to ridge; highest eaves ${heights.maxEaveM.toFixed(2)} m above datum (chimney stacks excluded)`,
  );
  if (windSuffix(dirs[0], bearing)) {
    notes.push("Bracketed compass points give the true direction each elevation faces");
  }
  if (wings.some((w) => w.isContext)) {
    notes.push("Neighbouring buildings shown grey, for context only");
  }
  const stepped = wings.some((w) => w.groundOffsetM);
  if (stepped) {
    notes.push("Stepped baselines indicate ground levels relative to the site datum");
  }
  if (proposed) {
    if (geometryUnchanged(planningCase)) {
      notes.push("No external alterations proposed other than the change of roof covering");
    } else {
      const changes = wingChanges(planningCase);
      const named = wings.filter((w) => changes.newIds.has(w.id) || changes.alteredIds.has(w.id));
      if (named.length > 0) {
        notes.push(`Alterations: ${named.map((w) => `${w.name} (${changes.newIds.has(w.id) ? "new" : "altered"})`).join("; ")}`);
      }
      notes.push("See existing drawings for the house as it stands");
    }
  } else {
    notes.push("Walls, windows and doors as existing");
  }

  return (
    <DrawingPage
      title={`${proposed ? "Proposed" : "Existing"} Elevations (${elevName(dirs[0])} & ${elevName(dirs[1])})`}
      address={meta.address}
      applicantLine={meta.applicantLine}
      scaleDenominator={fitDrawingScale(extent)}
      drawingExtentM={extent}
      drawingNumber={meta.drawingNumber}
      dateISO={meta.dateISO}
      notes={notes}
    >
      {(toMm) => (
        <>
          <ScenePolygonsPdf scene={sceneA} toMm={toMm} roofColor={roofColor} wingColors={wingColors} />
          <ScenePolygonsPdf scene={sceneB} toMm={toMm} roofColor={roofColor} wingColors={wingColors} offsetX={bOffset} />
          {/* ground: one datum line on flat sites, per-block baselines on stepped ones */}
          {stepped ? (
            <>
              {groundSegments(wings, dirs[0], sceneA.origin).map((s, i) => (
                <LineSegment key={`ga${i}`} from={s.from} to={s.to} toMm={toMm} strokeWidth={0.5} />
              ))}
              {groundSegments(wings, dirs[1], sceneB.origin).map((s, i) => (
                <LineSegment key={`gb${i}`} from={{ x: s.from.x + bOffset, y: s.from.y }} to={{ x: s.to.x + bOffset, y: s.to.y }} toMm={toMm} strokeWidth={0.5} />
              ))}
            </>
          ) : (
            <>
              <LineSegment from={{ x: -0.8, y: 0 }} to={{ x: sceneA.widthM + 0.8, y: 0 }} toMm={toMm} strokeWidth={0.5} />
              <LineSegment from={{ x: bOffset - 0.8, y: 0 }} to={{ x: bOffset + sceneB.widthM + 0.8, y: 0 }} toMm={toMm} strokeWidth={0.5} />
            </>
          )}
        </>
      )}
    </DrawingPage>
  );
}

function LocationPlanPage({ planningCase, meta }: { planningCase: PlanningCase; meta: PageMeta }) {
  const scale = planningCase.locationPlanScale ?? 1250;
  const hasCapture = !!planningCase.locationPlanImage && !!planningCase.mapCentre;
  const year = meta.dateISO.slice(0, 4);
  const blueLine = (planningCase.blueLine?.length ?? 0) >= 3 ? planningCase.blueLine! : null;
  const notes = [
    `Contains OS data © Crown copyright and database right ${year}`,
    "Red line denotes the application site boundary, including access to the highway",
  ];
  if (blueLine) notes.push("Blue line denotes other land in the applicant's ownership");

  if (hasCapture) {
    // The captured basemap covers exactly the page content area at the chosen
    // scale, centred on the capture point — so the drawing extent must be the
    // image's true ground coverage and the boundary must be placed relative to
    // the capture centre, or the red line won't align with the map.
    const imgWidthM = (CONTENT_WIDTH_MM * scale) / 1000;
    const imgHeightM = (CONTENT_HEIGHT_MM * scale) / 1000;
    const centre = planningCase.mapCentre!;
    const place = (pts: { lng: number; lat: number }[]) =>
      pts.map((p) => toLocalMetres(p, centre)).map((p) => ({ x: p.x + imgWidthM / 2, y: p.y + imgHeightM / 2 }));
    const shifted = place(planningCase.boundary);
    const blueShifted = blueLine ? place(blueLine) : null;
    return (
      <DrawingPage
        title="Location Plan"
        address={meta.address}
        applicantLine={meta.applicantLine}
        scaleDenominator={scale}
        drawingExtentM={{ width: imgWidthM, height: imgHeightM }}
        drawingNumber={meta.drawingNumber}
        dateISO={meta.dateISO}
        notes={notes}
        showNorthArrow
        backgroundImageDataUrl={planningCase.locationPlanImage}
      >
        {(toMm) => (
          <>
            {blueShifted && <OutlinePath points={blueShifted} toMm={toMm} stroke={BLUE_LINE} strokeWidth={0.5} />}
            <OutlinePath points={shifted} toMm={toMm} stroke={RED_LINE} strokeWidth={0.6} />
          </>
        )}
      </DrawingPage>
    );
  }

  // No basemap captured: draw the red-line boundary alone, framed to fit.
  const origin = boundaryCentroid(planningCase.boundary);
  const local = planningCase.boundary.map((p) => toLocalMetres(p, origin));
  const blueLocal = blueLine ? blueLine.map((p) => toLocalMetres(p, origin)) : null;
  const { widthM, heightM } = boundaryBoundingBoxM(planningCase.boundary);
  const pad = Math.max(widthM, heightM) * 0.15 || 10;
  const xs = local.map((p) => p.x);
  const ys = local.map((p) => p.y);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const shift = (p: Point) => ({ x: p.x - minX, y: p.y - minY });
  const shifted = local.map(shift);
  const blueShifted = blueLocal?.map(shift) ?? null;

  return (
    <DrawingPage
      title="Location Plan"
      address={meta.address}
      applicantLine={meta.applicantLine}
      scaleDenominator={scale}
      drawingExtentM={{ width: widthM + pad * 2, height: heightM + pad * 2 }}
      drawingNumber={meta.drawingNumber}
      dateISO={meta.dateISO}
      notes={notes}
      showNorthArrow
    >
      {(toMm) => (
        <>
          {blueShifted && <OutlinePath points={blueShifted} toMm={toMm} stroke={BLUE_LINE} strokeWidth={0.5} />}
          <OutlinePath points={shifted} toMm={toMm} stroke={RED_LINE} strokeWidth={0.6} />
        </>
      )}
    </DrawingPage>
  );
}

/**
 * Block plan (1:200/1:500): the modelled house inside the red-line boundary,
 * with written clearances to each boundary — the site-plan sheet on nearly
 * every LPA validation list. Uses the proposed house when one exists, since
 * the block plan describes the application.
 */
function BlockPlanPage({ planningCase, meta }: { planningCase: PlanningCase; meta: PageMeta }) {
  const wings = wingsFor(planningCase, !!planningCase.proposedWings);
  const boundaryPts = boundaryInPlanFrame(planningCase.boundary, planningCase.composerBoundaryRotationDeg);
  const scene = planScene(wings);
  // planScene normalises to its own extent; undo the shift to get back to the
  // shared plan-grid frame the boundary underlay lives in
  const toGrid = (p: Point): Point => ({ x: p.x + scene.minX, y: p.y + scene.minY });
  const clearances = boundaryClearances(boundaryPts, wings);

  const allPts: Point[] = [...boundaryPts, ...scene.wings.flatMap((w) => w.outline.map(toGrid))];
  const pad = 2.5;
  const minX = Math.min(...allPts.map((p) => p.x)) - pad;
  const minY = Math.min(...allPts.map((p) => p.y)) - pad;
  const maxX = Math.max(...allPts.map((p) => p.x)) + pad;
  const maxY = Math.max(...allPts.map((p) => p.y)) + pad;
  const shift = (p: Point): Point => ({ x: p.x - minX, y: p.y - minY });
  const extent = { width: maxX - minX, height: maxY - minY };

  const notes = [
    "Red line denotes the application site boundary",
    "Written dimensions are clearances from the building to the boundary, in metres",
    planningCase.proposedWings && !geometryUnchanged(planningCase) ? "Building shown as proposed" : "Building shown as existing (unchanged)",
  ];
  if (wings.some((w) => w.isContext)) notes.push("Grey blocks are neighbouring buildings, for context only");

  return (
    <DrawingPage
      title="Block Plan"
      address={meta.address}
      applicantLine={meta.applicantLine}
      scaleDenominator={fitDrawingScale(extent, 200)}
      drawingExtentM={extent}
      drawingNumber={meta.drawingNumber}
      dateISO={meta.dateISO}
      notes={notes}
      showNorthArrow
      northBearingDeg={northBearing(planningCase)}
    >
      {(toMm) => (
        <>
          <OutlinePath points={boundaryPts.map(shift)} toMm={toMm} stroke={RED_LINE} strokeWidth={0.6} />
          {scene.wings.map((w, i) => {
            const outline = w.outline.map(toGrid).map(shift);
            const wing = wings.find((x) => x.id === w.wingId);
            return (
              <Fragment key={i}>
                <OutlinePath points={outline} toMm={toMm} fill={w.context ? CONTEXT_ROOF_FILL : "#ececec"} strokeWidth={0.35} />
                {w.ridgeLine && <LineSegment from={shift(toGrid(w.ridgeLine[0]))} to={shift(toGrid(w.ridgeLine[1]))} toMm={toMm} strokeWidth={0.25} />}
                {w.hipLines.map((h, j) => (
                  <LineSegment key={j} from={shift(toGrid(h[0]))} to={shift(toGrid(h[1]))} toMm={toMm} strokeWidth={0.2} />
                ))}
                {!w.context && wing && (
                  <SvgText at={polyCentroid(outline)} toMm={toMm} size={2.2} color="#333">
                    {wing.name}
                  </SvgText>
                )}
              </Fragment>
            );
          })}
          {clearances.map((c, i) => (
            <DimLine key={`c${i}`} from={shift(c.from)} to={shift(c.to)} label={`${c.distM.toFixed(2)} m`} toMm={toMm} />
          ))}
        </>
      )}
    </DrawingPage>
  );
}

const FLOOR_NAMES = ["Ground floor", "First floor", "Second floor", "Third floor"];

/** Storeys a block contributes to the floor plans: explicit setting, else a
 *  conservative guess from the eaves (two storeys needs ~4.4 m of wall). */
function effectiveStoreys(w: Wing): number {
  return w.storeys ?? (w.eaveHeightM >= 4.4 ? 2 : 1);
}

/**
 * Outline-level floor plans, one frame per storey. The block model has no
 * internal partitions — room uses are annotated per block, which satisfies
 * most validation lists for external-works applications.
 */
function FloorPlansPage({ planningCase, proposed, meta }: { planningCase: PlanningCase; proposed: boolean; meta: PageMeta }) {
  const wings = wingsFor(planningCase, proposed).filter((w) => !w.isContext);
  const scene = planScene(wings.length ? wings : wingsFor(planningCase, proposed));
  const levels = Math.max(1, ...wings.map(effectiveStoreys));
  const gap = 3;
  const frameW = scene.widthM;
  const titleH = 2;
  const extent = { width: levels * frameW + (levels - 1) * gap, height: scene.heightM + titleH };
  const byId = new Map(wings.map((w) => [w.id, w]));

  const notes = [
    "External block outlines only — internal partitions are not part of this application",
    proposed ? "Layout as proposed" : "Layout as existing",
  ];

  return (
    <DrawingPage
      title={`${proposed ? "Proposed" : "Existing"} Floor Plans`}
      address={meta.address}
      applicantLine={meta.applicantLine}
      scaleDenominator={fitDrawingScale(extent)}
      drawingExtentM={extent}
      drawingNumber={meta.drawingNumber}
      dateISO={meta.dateISO}
      notes={notes}
      showNorthArrow
      northBearingDeg={northBearing(planningCase)}
    >
      {(toMm) => (
        <>
          {Array.from({ length: levels }, (_, level) => {
            const offset = level * (frameW + gap);
            const move = (p: Point): Point => ({ x: p.x + offset, y: p.y });
            const included = scene.wings.filter((w) => {
              const wing = byId.get(w.wingId);
              return wing && effectiveStoreys(wing) > level;
            });
            return (
              <Fragment key={level}>
                {included.map((w, i) => {
                  const wing = byId.get(w.wingId)!;
                  const rooms = (wing.roomLabels?.[level] ?? "").split(",").map((r) => r.trim()).filter(Boolean);
                  const centre = polyCentroid(w.outline.map(move));
                  return (
                    <Fragment key={i}>
                      <OutlinePath points={w.outline.map(move)} toMm={toMm} fill="#f7f7f7" strokeWidth={0.4} />
                      {(rooms.length ? rooms : [wing.name]).map((label, j, arr) => (
                        <SvgText key={j} at={{ x: centre.x, y: centre.y + ((arr.length - 1) / 2 - j) * 1.1 }} toMm={toMm} size={2.2} color="#333">
                          {label}
                        </SvgText>
                      ))}
                    </Fragment>
                  );
                })}
                <SvgText at={{ x: offset + frameW / 2, y: scene.heightM + titleH - 0.8 }} toMm={toMm} size={2.8}>
                  {FLOOR_NAMES[level] ?? `Floor ${level}`}
                </SvgText>
              </Fragment>
            );
          })}
        </>
      )}
    </DrawingPage>
  );
}

const statementStyles = StyleSheet.create({
  page: { padding: MARGIN_MM * PT_PER_MM },
  frame: { border: "0.75pt solid #999", padding: 10 * PT_PER_MM, height: "100%" },
  heading: { fontSize: 16, marginBottom: 4 },
  sub: { fontSize: 9, color: "#333", marginBottom: 12 },
  sectionHead: { fontSize: 10, marginTop: 10, marginBottom: 3 },
  body: { fontSize: 9, color: "#222", lineHeight: 1.5 },
  stamp: { position: "absolute", bottom: MARGIN_MM * PT_PER_MM + 6, left: (MARGIN_MM + 10) * PT_PER_MM, fontSize: 6.5, color: "#111" },
});

/** A short design/planning statement generated from the case — the covering
 *  narrative conservation officers expect alongside the drawings. */
function StatementPage({ planningCase, meta }: { planningCase: PlanningCase; meta: PageMeta }) {
  const unchanged = geometryUnchanged(planningCase);
  const changes = wingChanges(planningCase);
  const proposedWings = wingsFor(planningCase, true).filter((w) => !w.isContext);
  const changed = proposedWings.filter((w) => changes.newIds.has(w.id) || changes.alteredIds.has(w.id));
  const hExisting = buildingHeights(planningCase.wings ?? []);
  const hProposed = buildingHeights(wingsFor(planningCase, true));
  const existingCovering = planningCase.materials.existing || "the existing covering";
  const proposedCovering = planningCase.materials.proposed || "the proposed covering";

  const proposalText = unchanged
    ? `The application seeks consent for the replacement of the roof covering, from ${existingCovering.toLowerCase()} to ` +
      `${proposedCovering.toLowerCase()}. No alterations are proposed to the building's footprint, height, openings or any other external element.`
    : `The application seeks consent for external alterations to the dwelling` +
      (changed.length ? `, comprising: ${changed.map((w) => `${w.name} (${changes.newIds.has(w.id) ? "new" : "altered"})`).join("; ")}` : "") +
      `. The extent of the works is shown on the existing and proposed drawings; unaltered elements of the house are retained as existing.`;

  const scaleText = unchanged
    ? `The building height is unchanged at ${hExisting.maxRidgeM.toFixed(2)} m to the ridge.`
    : `The maximum building height is ${hExisting.maxRidgeM.toFixed(2)} m to the ridge as existing and ${hProposed.maxRidgeM.toFixed(2)} m as proposed.`;

  const sections: [string, string][] = [
    ["The proposal", proposalText],
    [
      "Materials",
      `Roof covering: ${existingCovering} (existing); ${proposedCovering} (proposed). ` +
        `Walls: ${[...new Set(proposedWings.map((w) => w.wallMaterial?.trim()).filter(Boolean))].join("; ") || "existing, unchanged"}. ` +
        `Windows and doors: ${planningCase.joineryMaterial?.trim() || "existing, unchanged"}. Rainwater goods: ${planningCase.rainwaterMaterial?.trim() || "existing, unchanged"}. ` +
        `Materials are scheduled in full on the Schedule of Materials sheet.`,
    ],
    ["Scale and appearance", `${scaleText} The drawings are to the stated scales with scale bars on every sheet.`],
    [
      "Access and boundary",
      "The site boundary is shown edged red on the location and block plans. Access arrangements are unaltered by this proposal.",
    ],
  ];

  return (
    <Page size={{ width: PAGE_WIDTH_MM * PT_PER_MM, height: PAGE_HEIGHT_MM * PT_PER_MM }} style={statementStyles.page}>
      <View style={statementStyles.frame}>
        <Text style={statementStyles.heading}>Planning Statement</Text>
        <Text style={statementStyles.sub}>
          {meta.address}
          {meta.applicantLine ? ` — ${meta.applicantLine}` : ""}
        </Text>
        {sections.map(([head, body]) => (
          <View key={head}>
            <Text style={statementStyles.sectionHead}>{head}</Text>
            <Text style={statementStyles.body}>{body}</Text>
          </View>
        ))}
      </View>
      <Text style={statementStyles.stamp}>
        Drawing {meta.drawingNumber} · Rev A · {meta.dateISO} · Purpose: PLANNING · Not to scale
      </Text>
    </Page>
  );
}

const scheduleStyles = StyleSheet.create({
  page: { padding: MARGIN_MM * PT_PER_MM },
  frame: { border: "0.75pt solid #999", padding: 10 * PT_PER_MM, height: "100%" },
  heading: { fontSize: 16, marginBottom: 4 },
  sub: { fontSize: 9, color: "#333", marginBottom: 14 },
  row: { flexDirection: "row", borderBottom: "0.5pt solid #ccc", paddingVertical: 5 },
  headerRow: { flexDirection: "row", borderBottom: "1pt solid #333", paddingVertical: 5 },
  cellElement: { width: "24%", fontSize: 9 },
  cell: { width: "38%", fontSize: 9 },
  headerCell: { fontSize: 9, color: "#111" },
  note: { fontSize: 8, color: "#333", marginTop: 14, lineHeight: 1.5 },
  stamp: { position: "absolute", bottom: MARGIN_MM * PT_PER_MM + 6, left: (MARGIN_MM + 10) * PT_PER_MM, fontSize: 6.5, color: "#111" },
});

/** Schedule of materials — councils validate materials in words, not tints. */
function SchedulePage({ planningCase, meta }: { planningCase: PlanningCase; meta: PageMeta }) {
  const unchanged = geometryUnchanged(planningCase);
  const coveringCell = (proposed: boolean): string => {
    const wings = wingsFor(planningCase, proposed).filter((w) => !w.isContext);
    const base = (proposed ? planningCase.materials.proposed : planningCase.materials.existing) || "Not specified";
    if (!overridesApply(planningCase, proposed)) return base;
    const labels = wings.map((w) => resolveWingMaterial(planningCase, w, proposed).label);
    if (new Set(labels).size <= 1) return labels[0] ?? base;
    return wings.map((w, i) => `${w.name}: ${labels[i]}`).join("; ");
  };
  const heightCell = (proposed: boolean): string => {
    const h = buildingHeights(wingsFor(planningCase, proposed));
    return `${h.maxRidgeM.toFixed(2)} m to ridge; eaves ${h.maxEaveM.toFixed(2)} m`;
  };
  const wallsCell = (proposed: boolean): string => {
    const wings = wingsFor(planningCase, proposed).filter((w) => !w.isContext);
    const labels = [...new Set(wings.map((w) => w.wallMaterial?.trim()).filter((l): l is string => !!l))];
    if (labels.length === 1) return labels[0];
    if (labels.length > 1) return wings.map((w) => `${w.name}: ${w.wallMaterial?.trim() || "not specified"}`).join("; ");
    return proposed ? (unchanged ? "Unchanged" : "To match existing — see proposed drawings") : "Existing";
  };
  const coveringChanges = coveringCell(false) !== coveringCell(true);
  const rows: [string, string, string][] = [
    ["Roof covering", coveringCell(false), coveringCell(true)],
    ["Maximum building height", heightCell(false), heightCell(true) === heightCell(false) ? "Unchanged" : heightCell(true)],
    [
      "Ridge / hip / verge details",
      "Existing",
      coveringChanges ? "To suit proposed roof covering, to match existing appearance" : "Unchanged",
    ],
    ["Walls", wallsCell(false), wallsCell(true)],
    ["Windows & doors", planningCase.joineryMaterial?.trim() || "Existing", planningCase.joineryMaterial?.trim() || (unchanged ? "Unchanged" : "See proposed drawings")],
    ["Rainwater goods", planningCase.rainwaterMaterial?.trim() || "Existing", planningCase.rainwaterMaterial?.trim() || "Unchanged"],
  ];
  return (
    <Page size={{ width: PAGE_WIDTH_MM * PT_PER_MM, height: PAGE_HEIGHT_MM * PT_PER_MM }} style={scheduleStyles.page}>
      <View style={scheduleStyles.frame}>
        <Text style={scheduleStyles.heading}>Schedule of Materials</Text>
        <Text style={scheduleStyles.sub}>{meta.address}</Text>
        <View style={scheduleStyles.headerRow}>
          <Text style={[scheduleStyles.cellElement, scheduleStyles.headerCell]}>Element</Text>
          <Text style={[scheduleStyles.cell, scheduleStyles.headerCell]}>Existing</Text>
          <Text style={[scheduleStyles.cell, scheduleStyles.headerCell]}>Proposed</Text>
        </View>
        {rows.map(([element, existing, proposed]) => (
          <View key={element} style={scheduleStyles.row}>
            <Text style={scheduleStyles.cellElement}>{element}</Text>
            <Text style={scheduleStyles.cell}>{existing}</Text>
            <Text style={scheduleStyles.cell}>{proposed}</Text>
          </View>
        ))}
        <Text style={scheduleStyles.note}>
          {unchanged
            ? "The proposal is limited to the replacement of the roof covering. No alterations are proposed to the building's footprint, height, openings or any other external element."
            : "Proposed geometry differs from existing — refer to the proposed roof plan and elevations for the altered elements."}
          {coveringChanges ? " The existing roof covering will be stripped and disposed of appropriately; the replacement covering is as scheduled above." : ""}
        </Text>
      </View>
      <Text style={scheduleStyles.stamp}>
        Drawing {meta.drawingNumber} · Rev A · {meta.dateISO} · Purpose: PLANNING · Not to scale
      </Text>
    </Page>
  );
}

export function PdfBundle({ planningCase }: { planningCase: PlanningCase }) {
  const hasBoundary = planningCase.boundary.length >= 3;
  const wings: Wing[] = planningCase.wings ?? [];
  const hasRoof = wings.length > 0;
  const withWings = { ...planningCase, wings };
  const dateISO = planningCase.updatedAt.slice(0, 10);
  // Floor plans join the set for extension-type applications (diverged
  // geometry) or whenever storeys/rooms have been modelled explicitly.
  const floorPlansWanted =
    hasRoof &&
    (!geometryUnchanged(planningCase) ||
      [...wings, ...(planningCase.proposedWings ?? [])].some((w) => w.storeys !== undefined || w.roomLabels?.some((r) => r.trim())));

  // Sequential, unique drawing numbers regardless of which pages are included.
  let seq = 0;
  const meta = (): PageMeta => ({
    address: planningCase.address,
    dateISO,
    drawingNumber: `AP-${String(++seq).padStart(2, "0")}`,
    applicantLine: applicantLineFor(planningCase),
  });

  return (
    <Document>
      {hasBoundary && <LocationPlanPage planningCase={planningCase} meta={meta()} />}
      {hasBoundary && hasRoof && <BlockPlanPage planningCase={withWings} meta={meta()} />}
      {hasRoof && <RoofPlanPage planningCase={withWings} proposed={false} meta={meta()} />}
      {hasRoof && <RoofPlanPage planningCase={withWings} proposed meta={meta()} />}
      {hasRoof && <ElevationsPage planningCase={withWings} proposed={false} dirs={["S", "E"]} meta={meta()} />}
      {hasRoof && <ElevationsPage planningCase={withWings} proposed={false} dirs={["N", "W"]} meta={meta()} />}
      {hasRoof && <ElevationsPage planningCase={withWings} proposed dirs={["S", "E"]} meta={meta()} />}
      {hasRoof && <ElevationsPage planningCase={withWings} proposed dirs={["N", "W"]} meta={meta()} />}
      {floorPlansWanted && <FloorPlansPage planningCase={withWings} proposed={false} meta={meta()} />}
      {floorPlansWanted && <FloorPlansPage planningCase={withWings} proposed meta={meta()} />}
      {hasRoof && <SchedulePage planningCase={withWings} meta={meta()} />}
      {hasRoof && <StatementPage planningCase={withWings} meta={meta()} />}
    </Document>
  );
}
