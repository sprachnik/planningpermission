import { Fragment } from "react";
import { Document } from "@react-pdf/renderer";
import type { PlanningCase, Wing } from "../data/types";
import type { Point } from "../geometry/roof";
import { planScene, elevationScene } from "../geometry/composite";
import type { Direction, Scene2D } from "../geometry/composite";
import { DrawingPage, OutlinePath, LineSegment } from "./DrawingKit";
import { boundaryCentroid, toLocalMetres, boundaryBoundingBoxM } from "../geometry/latlng";
import { CONTENT_WIDTH_MM, CONTENT_HEIGHT_MM, fitDrawingScale } from "./scale";
import { roofColorFor, lighten } from "../components/svgDraw";

const WALL_FILL = "#f2f2f2";

/** The wing set a page should draw: proposed pages use proposedWings when the geometry diverged. */
function wingsFor(planningCase: PlanningCase, proposed: boolean): Wing[] {
  return (proposed ? planningCase.proposedWings : undefined) ?? planningCase.wings!;
}

function RoofPlanPage({ planningCase, proposed }: { planningCase: PlanningCase; proposed: boolean }) {
  const wings = wingsFor(planningCase, proposed);
  const scene = planScene(wings);
  const material = proposed ? planningCase.materials.proposed : planningCase.materials.existing;
  const roofFill = lighten(roofColorFor(planningCase.materials, proposed), 0.45);
  const extent = { width: scene.widthM, height: scene.heightM };
  return (
    <DrawingPage
      title={`${proposed ? "Proposed" : "Existing"} Roof Plan — ${material || "material not set"}`}
      address={planningCase.address}
      scaleDenominator={fitDrawingScale(extent)}
      drawingExtentM={extent}
    >
      {(toMm) => (
        <>
          {scene.wings.map((w, i) => (
            <OutlinePath key={`o${i}`} points={w.outline} toMm={toMm} fill={roofFill} />
          ))}
          {scene.wings.map((w, i) => (
            <Fragment key={`l${i}`}>
              {w.ridgeLine && <LineSegment from={w.ridgeLine[0]} to={w.ridgeLine[1]} toMm={toMm} strokeWidth={0.5} />}
              {w.hipLines.map((h, j) => (
                <LineSegment key={j} from={h[0]} to={h[1]} toMm={toMm} />
              ))}
              {w.slopeArrow && <LineSegment from={w.slopeArrow[0]} to={w.slopeArrow[1]} toMm={toMm} dashed />}
            </Fragment>
          ))}
        </>
      )}
    </DrawingPage>
  );
}

function ScenePolygonsPdf({ scene, toMm, roofColor, offsetX = 0 }: { scene: Scene2D; toMm: (p: Point) => Point; roofColor: string; offsetX?: number }) {
  const roofLight = lighten(roofColor, 0.22);
  return (
    <>
      {scene.polygons.map((poly, i) => (
        <OutlinePath
          key={i}
          points={poly.points.map((p) => ({ x: p.x + offsetX, y: p.y }))}
          toMm={toMm}
          fill={poly.kind === "roof" ? (i % 2 ? roofLight : roofColor) : WALL_FILL}
        />
      ))}
    </>
  );
}

function ElevationsPage({
  planningCase,
  proposed,
  dirs,
}: {
  planningCase: PlanningCase;
  proposed: boolean;
  dirs: [Direction, Direction];
}) {
  const wings = wingsFor(planningCase, proposed);
  const material = proposed ? planningCase.materials.proposed : planningCase.materials.existing;
  const roofColor = roofColorFor(planningCase.materials, proposed);
  const sceneA = elevationScene(wings, dirs[0]);
  const sceneB = elevationScene(wings, dirs[1]);
  const gap = 2;
  const bOffset = sceneA.widthM + gap;
  const dirName: Record<Direction, string> = { N: "North", E: "East", S: "South", W: "West" };
  const extent = { width: sceneA.widthM + gap + sceneB.widthM, height: Math.max(sceneA.heightM, sceneB.heightM) };

  return (
    <DrawingPage
      title={`${proposed ? "Proposed" : "Existing"} Elevations (${dirName[dirs[0]]} & ${dirName[dirs[1]]}) — ${material || "material not set"}`}
      address={planningCase.address}
      scaleDenominator={fitDrawingScale(extent)}
      drawingExtentM={extent}
    >
      {(toMm) => (
        <>
          <ScenePolygonsPdf scene={sceneA} toMm={toMm} roofColor={roofColor} />
          <ScenePolygonsPdf scene={sceneB} toMm={toMm} roofColor={roofColor} offsetX={bOffset} />
          {/* ground lines */}
          <LineSegment from={{ x: -0.8, y: 0 }} to={{ x: sceneA.widthM + 0.8, y: 0 }} toMm={toMm} strokeWidth={0.5} />
          <LineSegment from={{ x: bOffset - 0.8, y: 0 }} to={{ x: bOffset + sceneB.widthM + 0.8, y: 0 }} toMm={toMm} strokeWidth={0.5} />
        </>
      )}
    </DrawingPage>
  );
}

function LocationPlanPage({ planningCase }: { planningCase: PlanningCase }) {
  const scale = planningCase.locationPlanScale ?? 1250;
  const hasCapture = !!planningCase.locationPlanImage && !!planningCase.mapCentre;

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
        address={planningCase.address}
        scaleDenominator={scale}
        drawingExtentM={{ width: imgWidthM, height: imgHeightM }}
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
      address={planningCase.address}
      scaleDenominator={scale}
      drawingExtentM={{ width: widthM + pad * 2, height: heightM + pad * 2 }}
      showNorthArrow
    >
      {(toMm) => <OutlinePath points={shifted} toMm={toMm} stroke="#e02424" strokeWidth={0.6} />}
    </DrawingPage>
  );
}

export function PdfBundle({ planningCase }: { planningCase: PlanningCase }) {
  const hasBoundary = planningCase.boundary.length >= 3;
  const wings: Wing[] = planningCase.wings ?? [];
  const hasRoof = wings.length > 0;
  const withWings = { ...planningCase, wings };
  return (
    <Document>
      {hasBoundary && <LocationPlanPage planningCase={planningCase} />}
      {hasRoof && <RoofPlanPage planningCase={withWings} proposed={false} />}
      {hasRoof && <RoofPlanPage planningCase={withWings} proposed />}
      {hasRoof && <ElevationsPage planningCase={withWings} proposed={false} dirs={["S", "E"]} />}
      {hasRoof && <ElevationsPage planningCase={withWings} proposed={false} dirs={["N", "W"]} />}
      {hasRoof && <ElevationsPage planningCase={withWings} proposed dirs={["S", "E"]} />}
      {hasRoof && <ElevationsPage planningCase={withWings} proposed dirs={["N", "W"]} />}
    </Document>
  );
}
