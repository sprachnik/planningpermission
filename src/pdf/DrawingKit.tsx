import { Page, View, Text, Svg, Path, Line, Polygon, Image, StyleSheet } from "@react-pdf/renderer";
import type { Point } from "../geometry/roof";
import {
  mmForRealMetres,
  niceScaleBarLengthM,
  PT_PER_MM,
  PAGE_WIDTH_MM,
  PAGE_HEIGHT_MM,
  MARGIN_MM,
  TITLE_BLOCK_HEIGHT_MM,
} from "./scale";

function mmToPt(mm: number): number {
  return mm * PT_PER_MM;
}

const styles = StyleSheet.create({
  page: {
    padding: 0,
  },
  titleBlock: {
    position: "absolute",
    left: mmToPt(MARGIN_MM),
    bottom: mmToPt(MARGIN_MM),
    width: mmToPt(PAGE_WIDTH_MM - MARGIN_MM * 2),
    height: mmToPt(TITLE_BLOCK_HEIGHT_MM),
    borderTop: "1pt solid #333",
    paddingTop: mmToPt(3),
    flexDirection: "row",
    justifyContent: "space-between",
  },
  titleText: {
    fontSize: 12,
    marginBottom: 3,
  },
  metaText: {
    fontSize: 8,
    color: "#333",
  },
  noteText: {
    fontSize: 6.5,
    color: "#333",
    marginBottom: 1,
  },
  stampText: {
    fontSize: 6.5,
    color: "#111",
    marginTop: 2,
  },
  border: {
    position: "absolute",
    left: mmToPt(MARGIN_MM),
    top: mmToPt(MARGIN_MM),
    width: mmToPt(PAGE_WIDTH_MM - MARGIN_MM * 2),
    height: mmToPt(PAGE_HEIGHT_MM - MARGIN_MM * 2),
    border: "0.75pt solid #999",
  },
});

/** Renders a real-world-accurate scale bar (e.g. 0—5—10m) as a small SVG widget. */
export function ScaleBar({ scaleDenominator }: { scaleDenominator: number }) {
  const barLengthM = niceScaleBarLengthM(scaleDenominator);
  const segments = 5;
  const segmentM = barLengthM / segments;
  const widthMm = mmForRealMetres(barLengthM, scaleDenominator);
  const heightMm = 4;

  const bars = Array.from({ length: segments }, (_, i) => {
    const xMm = (i * widthMm) / segments;
    const segWidthMm = widthMm / segments;
    return (
      <Path
        key={i}
        d={`M ${xMm} 0 H ${xMm + segWidthMm} V ${heightMm} H ${xMm} Z`}
        fill={i % 2 === 0 ? "#111" : "#fff"}
        stroke="#111"
        strokeWidth={0.2}
      />
    );
  });

  return (
    <View>
      <Svg width={mmToPt(widthMm)} height={mmToPt(heightMm + 4)} viewBox={`0 0 ${widthMm} ${heightMm + 4}`}>
        {bars}
        <Text x={0} y={heightMm + 3.5} style={{ fontSize: 3 }}>
          0
        </Text>
        <Text x={widthMm} y={heightMm + 3.5} textAnchor="end" style={{ fontSize: 3 }}>
          {barLengthM}m
        </Text>
      </Svg>
      <Text style={styles.metaText}>Scale 1:{scaleDenominator} at A4 landscape — bar shows {segmentM}m increments</Text>
    </View>
  );
}

/** North arrow, rotated when the drawing's plan grid doesn't face true north.
 *  `bearingDeg` is the true bearing the page's "up" direction faces; the
 *  needle turns so it always points at true north. */
export function NorthArrow({ bearingDeg = 0 }: { bearingDeg?: number }) {
  const size = 14;
  const cx = size / 2;
  const cy = size / 2 + 0.6;
  // page-up faces bearing B, so true north sits B° anticlockwise on the page;
  // SVG y points down, so a visual-anticlockwise turn is a negative rotation
  const rad = (-bearingDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const at = (x: number, y: number): [number, number] => [cx + x * cos - y * sin, cy + x * sin + y * cos];
  // needle in local coords (pointing up = negative y), rotated into place
  const needle = [at(0, -4.5), at(1.7, 3.2), at(0, 1.7), at(-1.7, 3.2)]
    .map(([x, y]) => `${x},${y}`)
    .join(" ");
  const [labelX, labelY] = at(0, -5.6);
  return (
    <Svg width={mmToPt(size)} height={mmToPt(size)} viewBox={`0 0 ${size} ${size}`}>
      <Polygon points={needle} fill="#111" />
      <Text x={labelX} y={labelY + 1.2} textAnchor="middle" style={{ fontSize: 3.5 }}>
        N
      </Text>
    </Svg>
  );
}

export interface DrawingPageProps {
  title: string;
  address: string;
  /** "Applicant: … · Agent: …" line for the title block, when captured */
  applicantLine?: string;
  scaleDenominator: number;
  /** Real-world size (metres) of the content being drawn, used to fit/centre it. */
  drawingExtentM: { width: number; height: number };
  /** Unique drawing number for the title block, e.g. "AP-03". */
  drawingNumber: string;
  /** Issue date shown in the title block (YYYY-MM-DD). */
  dateISO: string;
  revision?: string;
  /** Short annotation lines shown in the title block (materials, OS licence, etc.). */
  notes?: string[];
  showNorthArrow?: boolean;
  /** True bearing the page's "up" direction faces — rotates the north arrow. */
  northBearingDeg?: number;
  /** Captured basemap snapshot (data URL), drawn full-bleed behind the content area. */
  backgroundImageDataUrl?: string;
  /** Receives a transform from real-world metres to page mm (already offset/centred/y-flipped). */
  children: (toMm: (p: Point) => Point) => React.ReactNode;
}

export function DrawingPage({
  title,
  address,
  applicantLine,
  scaleDenominator,
  drawingExtentM,
  drawingNumber,
  dateISO,
  revision = "A",
  notes,
  showNorthArrow,
  northBearingDeg,
  backgroundImageDataUrl,
  children,
}: DrawingPageProps) {
  const contentAreaWidthMm = PAGE_WIDTH_MM - MARGIN_MM * 2;
  const contentAreaHeightMm = PAGE_HEIGHT_MM - MARGIN_MM * 2 - TITLE_BLOCK_HEIGHT_MM;

  const drawingWidthMm = mmForRealMetres(drawingExtentM.width, scaleDenominator);
  const drawingHeightMm = mmForRealMetres(drawingExtentM.height, scaleDenominator);

  const offsetX = (contentAreaWidthMm - drawingWidthMm) / 2;
  const offsetY = (contentAreaHeightMm - drawingHeightMm) / 2;

  const toMm = (p: Point): Point => ({
    x: offsetX + mmForRealMetres(p.x, scaleDenominator),
    // flip Y so "up" in real-world coordinates renders as up on the page
    y: offsetY + (drawingHeightMm - mmForRealMetres(p.y, scaleDenominator)),
  });

  return (
    <Page size={{ width: mmToPt(PAGE_WIDTH_MM), height: mmToPt(PAGE_HEIGHT_MM) }} style={styles.page}>
      <View style={styles.border} />
      <View
        style={{
          position: "absolute",
          left: mmToPt(MARGIN_MM),
          top: mmToPt(MARGIN_MM),
          width: mmToPt(contentAreaWidthMm),
          height: mmToPt(contentAreaHeightMm),
        }}
      >
        {backgroundImageDataUrl && (
          <Image
            src={backgroundImageDataUrl}
            style={{
              position: "absolute",
              left: mmToPt(offsetX),
              top: mmToPt(offsetY),
              width: mmToPt(drawingWidthMm),
              height: mmToPt(drawingHeightMm),
            }}
          />
        )}
        <Svg width={mmToPt(contentAreaWidthMm)} height={mmToPt(contentAreaHeightMm)} viewBox={`0 0 ${contentAreaWidthMm} ${contentAreaHeightMm}`}>
          {children(toMm)}
        </Svg>
        {showNorthArrow && (
          <View style={{ position: "absolute", top: 0, right: 0 }}>
            <NorthArrow bearingDeg={northBearingDeg} />
          </View>
        )}
      </View>
      <View style={styles.titleBlock}>
        <View style={{ maxWidth: "38%" }}>
          <Text style={styles.titleText}>{title}</Text>
          <Text style={styles.metaText}>{address}</Text>
          {applicantLine && <Text style={styles.metaText}>{applicantLine}</Text>}
          <Text style={styles.stampText}>
            Drawing {drawingNumber} · Rev {revision} · {dateISO} · Purpose: PLANNING
          </Text>
        </View>
        {notes && notes.length > 0 && (
          <View style={{ maxWidth: "30%", justifyContent: "flex-start" }}>
            {notes.map((line, i) => (
              <Text key={i} style={styles.noteText}>
                {line}
              </Text>
            ))}
          </View>
        )}
        <View>
          <ScaleBar scaleDenominator={scaleDenominator} />
        </View>
      </View>
    </Page>
  );
}

/** Draws a closed polygon outline (metres) using an already-computed toMm transform. */
export function OutlinePath({ points, toMm, stroke = "#111", strokeWidth = 0.3, fill = "none" }: { points: Point[]; toMm: (p: Point) => Point; stroke?: string; strokeWidth?: number; fill?: string }) {
  const mmPoints = points.map(toMm);
  const d = mmPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
  return <Path d={d} stroke={stroke} strokeWidth={strokeWidth} fill={fill} />;
}

export function LineSegment({ from, to, toMm, stroke = "#111", strokeWidth = 0.3, dashed = false }: { from: Point; to: Point; toMm: (p: Point) => Point; stroke?: string; strokeWidth?: number; dashed?: boolean }) {
  const a = toMm(from);
  const b = toMm(to);
  return <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dashed ? "1,1" : undefined} />;
}
