import type { RoofParams } from "../data/types";

export interface Point {
  x: number;
  y: number;
}

export interface RoofPlanGeometry {
  /** Footprint outline in metres, plan (top-down) view */
  outline: Point[];
  ridgeLine: [Point, Point] | null;
  hipLines: [Point, Point][];
  apex: Point | null;
  /** Mono-pitch only: arrow from low edge to high edge */
  slopeArrow: [Point, Point] | null;
  ridgeHeightM: number;
}

export type ElevationView = "A" | "B";

export interface ElevationGeometry {
  /** Closed silhouette polygon (metres) starting at ground level, left to right */
  profile: Point[];
  /** Region of the silhouette occupied by visible roof (above the eaves), for shading */
  roofProfile: Point[] | null;
  /** Horizontal extent of this view, in metres */
  widthM: number;
  eaveHeightM: number;
  maxHeightM: number;
}

function pitchRise(run: number, pitchDegrees: number): number {
  return run * Math.tan((pitchDegrees * Math.PI) / 180);
}

/**
 * Gable ridge position along the depth axis. Symmetric roofs put it at D/2;
 * when `rearPitchDegrees` differs the ridge sits where the two slopes (front
 * rising at `pitchDegrees`, rear at `rearPitchDegrees`, sharing one eave
 * height) meet: y·tan(front) = (D−y)·tan(rear).
 */
export function gableRidgeY(params: RoofParams): number {
  const D = params.depthM;
  const t1 = Math.tan((params.pitchDegrees * Math.PI) / 180);
  const t2 = Math.tan(((params.rearPitchDegrees ?? params.pitchDegrees) * Math.PI) / 180);
  if (t1 + t2 <= 1e-9) return D / 2;
  return (D * t2) / (t1 + t2);
}

export function computeRoofPlan(params: RoofParams): RoofPlanGeometry {
  const { widthM: W, depthM: D, roofType, pitchDegrees, eaveHeightM } = params;
  const outline: Point[] = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: D },
    { x: 0, y: D },
  ];

  if (roofType === "flat") {
    return { outline, ridgeLine: null, hipLines: [], apex: null, slopeArrow: null, ridgeHeightM: eaveHeightM };
  }

  if (roofType === "mono-pitch") {
    const highEdge = params.highEdge ?? "width-end";
    const run = highEdge.startsWith("width") ? W : D;
    const ridgeHeightM = eaveHeightM + pitchRise(run, pitchDegrees);
    const arrows: Record<NonNullable<RoofParams["highEdge"]>, [Point, Point]> = {
      "width-start": [{ x: W, y: D / 2 }, { x: 0, y: D / 2 }],
      "width-end": [{ x: 0, y: D / 2 }, { x: W, y: D / 2 }],
      "depth-start": [{ x: W / 2, y: D }, { x: W / 2, y: 0 }],
      "depth-end": [{ x: W / 2, y: 0 }, { x: W / 2, y: D }],
    };
    return {
      outline,
      ridgeLine: null,
      hipLines: [],
      apex: null,
      slopeArrow: arrows[highEdge],
      ridgeHeightM,
    };
  }

  if (roofType === "gable") {
    const ridgeY = gableRidgeY(params);
    return {
      outline,
      ridgeLine: [{ x: 0, y: ridgeY }, { x: W, y: ridgeY }],
      hipLines: [],
      apex: null,
      slopeArrow: null,
      ridgeHeightM: eaveHeightM + pitchRise(ridgeY, pitchDegrees),
    };
  }

  const ridgeHeightM = eaveHeightM + pitchRise(D / 2, pitchDegrees);

  // hip
  const inset = D / 2;
  if (W > D) {
    const ridgeLine: [Point, Point] = [
      { x: inset, y: D / 2 },
      { x: W - inset, y: D / 2 },
    ];
    const hipLines: [Point, Point][] = [
      [{ x: 0, y: 0 }, { x: inset, y: D / 2 }],
      [{ x: 0, y: D }, { x: inset, y: D / 2 }],
      [{ x: W, y: 0 }, { x: W - inset, y: D / 2 }],
      [{ x: W, y: D }, { x: W - inset, y: D / 2 }],
    ];
    return { outline, ridgeLine, hipLines, apex: null, slopeArrow: null, ridgeHeightM };
  }

  // pyramid hip (footprint narrower than it is deep along the ridge axis)
  const apex: Point = { x: W / 2, y: D / 2 };
  const hipLines: [Point, Point][] = [
    [{ x: 0, y: 0 }, apex],
    [{ x: W, y: 0 }, apex],
    [{ x: W, y: D }, apex],
    [{ x: 0, y: D }, apex],
  ];
  return { outline, ridgeLine: null, hipLines, apex, slopeArrow: null, ridgeHeightM };
}

/**
 * View A looks along the width axis (horizontal extent = depth) — the
 * "end elevation". View B looks along the depth axis (horizontal extent =
 * width) — the "front/rear elevation".
 */
export function computeElevation(params: RoofParams, view: ElevationView): ElevationGeometry {
  const { widthM: W, depthM: D, roofType, eaveHeightM } = params;
  const plan = computeRoofPlan(params);
  const ridgeH = plan.ridgeHeightM;

  if (roofType === "flat") {
    const extent = view === "A" ? D : W;
    return {
      widthM: extent,
      eaveHeightM,
      maxHeightM: eaveHeightM,
      profile: [
        { x: 0, y: 0 },
        { x: 0, y: eaveHeightM },
        { x: extent, y: eaveHeightM },
        { x: extent, y: 0 },
      ],
      roofProfile: null,
    };
  }

  if (roofType === "mono-pitch") {
    const highEdge = params.highEdge ?? "width-end";
    const slopeAxisIsWidth = highEdge.startsWith("width");
    const viewShowsSlope = (view === "B" && slopeAxisIsWidth) || (view === "A" && !slopeAxisIsWidth);
    const extent = view === "A" ? D : W;

    if (!viewShowsSlope) {
      // Slope runs toward/away from the viewer: the silhouette is a rectangle
      // to the high edge, with the roof face visible as a band above the eaves.
      return {
        widthM: extent,
        eaveHeightM,
        maxHeightM: ridgeH,
        profile: [
          { x: 0, y: 0 },
          { x: 0, y: ridgeH },
          { x: extent, y: ridgeH },
          { x: extent, y: 0 },
        ],
        roofProfile: [
          { x: 0, y: eaveHeightM },
          { x: 0, y: ridgeH },
          { x: extent, y: ridgeH },
          { x: extent, y: eaveHeightM },
        ],
      };
    }

    const rising = highEdge === "width-end" || highEdge === "depth-end";
    const [startH, endH] = rising ? [eaveHeightM, ridgeH] : [ridgeH, eaveHeightM];
    return {
      widthM: extent,
      eaveHeightM,
      maxHeightM: ridgeH,
      profile: [
        { x: 0, y: 0 },
        { x: 0, y: startH },
        { x: extent, y: endH },
        { x: extent, y: 0 },
      ],
      roofProfile: rising
        ? [
            { x: 0, y: eaveHeightM },
            { x: extent, y: ridgeH },
            { x: extent, y: eaveHeightM },
          ]
        : [
            { x: 0, y: ridgeH },
            { x: extent, y: eaveHeightM },
            { x: 0, y: eaveHeightM },
          ],
    };
  }

  if (view === "B") {
    if (roofType === "gable") {
      // The ridge runs the full width, so the roof face projects as a band
      // from eaves to ridge across the whole elevation — the silhouette must
      // reach ridge height, not stop at the eaves.
      return {
        widthM: W,
        eaveHeightM,
        maxHeightM: ridgeH,
        profile: [
          { x: 0, y: 0 },
          { x: 0, y: ridgeH },
          { x: W, y: ridgeH },
          { x: W, y: 0 },
        ],
        roofProfile: [
          { x: 0, y: eaveHeightM },
          { x: 0, y: ridgeH },
          { x: W, y: ridgeH },
          { x: W, y: eaveHeightM },
        ],
      };
    }
    // hip
    if (plan.ridgeLine) {
      const [r1, r2] = plan.ridgeLine;
      return {
        widthM: W,
        eaveHeightM,
        maxHeightM: ridgeH,
        profile: [
          { x: 0, y: 0 },
          { x: 0, y: eaveHeightM },
          { x: r1.x, y: ridgeH },
          { x: r2.x, y: ridgeH },
          { x: W, y: eaveHeightM },
          { x: W, y: 0 },
        ],
        roofProfile: [
          { x: 0, y: eaveHeightM },
          { x: r1.x, y: ridgeH },
          { x: r2.x, y: ridgeH },
          { x: W, y: eaveHeightM },
        ],
      };
    }
    // pyramid
    return {
      widthM: W,
      eaveHeightM,
      maxHeightM: ridgeH,
      profile: [
        { x: 0, y: 0 },
        { x: 0, y: eaveHeightM },
        { x: W / 2, y: ridgeH },
        { x: W, y: eaveHeightM },
        { x: W, y: 0 },
      ],
      roofProfile: [
        { x: 0, y: eaveHeightM },
        { x: W / 2, y: ridgeH },
        { x: W, y: eaveHeightM },
      ],
    };
  }

  // view A: end elevation — triangular gable/hip-end silhouette for both types
  const apexY = roofType === "gable" ? gableRidgeY(params) : D / 2;
  return {
    widthM: D,
    eaveHeightM,
    maxHeightM: ridgeH,
    profile: [
      { x: 0, y: 0 },
      { x: 0, y: eaveHeightM },
      { x: apexY, y: ridgeH },
      { x: D, y: eaveHeightM },
      { x: D, y: 0 },
    ],
    roofProfile: [
      { x: 0, y: eaveHeightM },
      { x: apexY, y: ridgeH },
      { x: D, y: eaveHeightM },
    ],
  };
}
