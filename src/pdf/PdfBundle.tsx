import { Fragment } from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { PlanningCase, Wing } from "../data/types";
import type { Point } from "../geometry/roof";
import { planScene, elevationScene } from "../geometry/composite";
import type { Direction, Scene2D } from "../geometry/composite";
import { DrawingPage, OutlinePath, LineSegment } from "./DrawingKit";
import { boundaryCentroid, toLocalMetres, boundaryBoundingBoxM } from "../geometry/latlng";
import { CONTENT_WIDTH_MM, CONTENT_HEIGHT_MM, fitDrawingScale, PT_PER_MM, PAGE_WIDTH_MM, PAGE_HEIGHT_MM, MARGIN_MM } from "./scale";
import { roofColorFor, lighten, openingFill, garagePanelLines } from "../components/svgDraw";
import { windSuffix } from "../geometry/compass";
import { geometryUnchanged } from "../data/caseGeometry";

const WALL_FILL = "#f2f2f2";

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

/** "Roof covering: X" — or a per-block list when blocks differ. */
function materialsNote(planningCase: PlanningCase, proposed: boolean): string {
  const wings = wingsFor(planningCase, proposed);
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
}

function RoofPlanPage({ planningCase, proposed, meta }: { planningCase: PlanningCase; proposed: boolean; meta: PageMeta }) {
  const wings = wingsFor(planningCase, proposed);
  const scene = planScene(wings);
  const colors = wingColorMap(planningCase, proposed);
  const baseColor = roofColorFor(planningCase.materials, proposed);
  const roofFillFor = (wingId: string) => lighten(colors[wingId] ?? baseColor, 0.45);
  const extent = { width: scene.widthM, height: scene.heightM };
  const notes = [materialsNote(planningCase, proposed)];
  if (proposed && geometryUnchanged(planningCase)) {
    notes.push("Roof geometry unchanged — replacement of roof covering only");
  }
  return (
    <DrawingPage
      title={`${proposed ? "Proposed" : "Existing"} Roof Plan`}
      address={meta.address}
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
            <OutlinePath key={`o${i}`} points={w.outline} toMm={toMm} fill={roofFillFor(w.wingId)} />
          ))}
          {scene.wings.map((w, i) => (
            <Fragment key={`l${i}`}>
              {w.ridgeLine && <LineSegment from={w.ridgeLine[0]} to={w.ridgeLine[1]} toMm={toMm} strokeWidth={0.5} />}
              {w.hipLines.map((h, j) => (
                <LineSegment key={j} from={h[0]} to={h[1]} toMm={toMm} />
              ))}
              {w.slopeArrow && <LineSegment from={w.slopeArrow[0]} to={w.slopeArrow[1]} toMm={toMm} dashed />}
              {w.chimney && <OutlinePath points={w.chimney} toMm={toMm} fill="#ffffff" strokeWidth={0.4} />}
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
  if (windSuffix(dirs[0], bearing)) {
    notes.push("Bracketed compass points give the true direction each elevation faces");
  }
  if (proposed) {
    notes.push(
      geometryUnchanged(planningCase)
        ? "No external alterations proposed other than the change of roof covering"
        : "See existing drawings for the house as it stands",
    );
  } else {
    notes.push("Walls, windows and doors as existing");
  }

  return (
    <DrawingPage
      title={`${proposed ? "Proposed" : "Existing"} Elevations (${elevName(dirs[0])} & ${elevName(dirs[1])})`}
      address={meta.address}
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
          {/* ground lines */}
          <LineSegment from={{ x: -0.8, y: 0 }} to={{ x: sceneA.widthM + 0.8, y: 0 }} toMm={toMm} strokeWidth={0.5} />
          <LineSegment from={{ x: bOffset - 0.8, y: 0 }} to={{ x: bOffset + sceneB.widthM + 0.8, y: 0 }} toMm={toMm} strokeWidth={0.5} />
        </>
      )}
    </DrawingPage>
  );
}

function LocationPlanPage({ planningCase, meta }: { planningCase: PlanningCase; meta: PageMeta }) {
  const scale = planningCase.locationPlanScale ?? 1250;
  const hasCapture = !!planningCase.locationPlanImage && !!planningCase.mapCentre;
  const year = meta.dateISO.slice(0, 4);
  const notes = [
    `Contains OS data © Crown copyright and database right ${year}`,
    "Red line denotes the application site boundary",
  ];

  if (hasCapture) {
    // The captured basemap covers exactly the page content area at the chosen
    // scale, centred on the capture point — so the drawing extent must be the
    // image's true ground coverage and the boundary must be placed relative to
    // the capture centre, or the red line won't align with the map.
    const imgWidthM = (CONTENT_WIDTH_MM * scale) / 1000;
    const imgHeightM = (CONTENT_HEIGHT_MM * scale) / 1000;
    const centre = planningCase.mapCentre!;
    const local = planningCase.boundary.map((p) => toLocalMetres(p, centre));
    const shifted = local.map((p) => ({ x: p.x + imgWidthM / 2, y: p.y + imgHeightM / 2 }));
    return (
      <DrawingPage
        title="Location Plan"
        address={meta.address}
        scaleDenominator={scale}
        drawingExtentM={{ width: imgWidthM, height: imgHeightM }}
        drawingNumber={meta.drawingNumber}
        dateISO={meta.dateISO}
        notes={notes}
        showNorthArrow
        backgroundImageDataUrl={planningCase.locationPlanImage}
      >
        {(toMm) => <OutlinePath points={shifted} toMm={toMm} stroke="#e02424" strokeWidth={0.6} />}
      </DrawingPage>
    );
  }

  // No basemap captured: draw the red-line boundary alone, framed to fit.
  const origin = boundaryCentroid(planningCase.boundary);
  const local = planningCase.boundary.map((p) => toLocalMetres(p, origin));
  const { widthM, heightM } = boundaryBoundingBoxM(planningCase.boundary);
  const pad = Math.max(widthM, heightM) * 0.15 || 10;
  const xs = local.map((p) => p.x);
  const ys = local.map((p) => p.y);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const shifted = local.map((p) => ({ x: p.x - minX, y: p.y - minY }));

  return (
    <DrawingPage
      title="Location Plan"
      address={meta.address}
      scaleDenominator={scale}
      drawingExtentM={{ width: widthM + pad * 2, height: heightM + pad * 2 }}
      drawingNumber={meta.drawingNumber}
      dateISO={meta.dateISO}
      notes={notes}
      showNorthArrow
    >
      {(toMm) => <OutlinePath points={shifted} toMm={toMm} stroke="#e02424" strokeWidth={0.6} />}
    </DrawingPage>
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
    const wings = wingsFor(planningCase, proposed);
    const base = (proposed ? planningCase.materials.proposed : planningCase.materials.existing) || "Not specified";
    if (!overridesApply(planningCase, proposed)) return base;
    const labels = wings.map((w) => resolveWingMaterial(planningCase, w, proposed).label);
    if (new Set(labels).size <= 1) return labels[0] ?? base;
    return wings.map((w, i) => `${w.name}: ${labels[i]}`).join("; ");
  };
  const rows: [string, string, string][] = [
    ["Roof covering", coveringCell(false), coveringCell(true)],
    ["Ridge / hip / verge details", "Existing", "To suit proposed roof covering, to match existing appearance"],
    ["Walls", "Existing", unchanged ? "Unchanged" : "See proposed drawings"],
    ["Windows & doors", "Existing", unchanged ? "Unchanged" : "See proposed drawings"],
    ["Rainwater goods", "Existing", "Unchanged"],
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
          {" "}The existing roof covering will be stripped and disposed of appropriately; the replacement covering is as scheduled above.
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

  // Sequential, unique drawing numbers regardless of which pages are included.
  let seq = 0;
  const meta = (): PageMeta => ({ address: planningCase.address, dateISO, drawingNumber: `AP-${String(++seq).padStart(2, "0")}` });

  return (
    <Document>
      {hasBoundary && <LocationPlanPage planningCase={planningCase} meta={meta()} />}
      {hasRoof && <RoofPlanPage planningCase={withWings} proposed={false} meta={meta()} />}
      {hasRoof && <RoofPlanPage planningCase={withWings} proposed meta={meta()} />}
      {hasRoof && <ElevationsPage planningCase={withWings} proposed={false} dirs={["S", "E"]} meta={meta()} />}
      {hasRoof && <ElevationsPage planningCase={withWings} proposed={false} dirs={["N", "W"]} meta={meta()} />}
      {hasRoof && <ElevationsPage planningCase={withWings} proposed dirs={["S", "E"]} meta={meta()} />}
      {hasRoof && <ElevationsPage planningCase={withWings} proposed dirs={["N", "W"]} meta={meta()} />}
      {hasRoof && <SchedulePage planningCase={withWings} meta={meta()} />}
    </Document>
  );
}
