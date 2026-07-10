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

export function computeRoofPlan(params: RoofParams): RoofPlanGeometry {
  const { widthM: W, depthM: D, roofType, pitchDegrees, eaveHeightM } = params;
  const outline: Point[] = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: D },
    { x: 0, y: D },
  ];

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

  const ridgeHeightM = eaveHeightM + pitchRise(D / 2, pitchDegrees);

  if (roofType === "gable") {
    return {
      outline,
      ridgeLine: [{ x: 0, y: D / 2 }, { x: W, y: D / 2 }],
      hipLines: [],
      apex: null,
      slopeArrow: null,
      ridgeHeightM,
    };
  }

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
  return {
    widthM: D,
    eaveHeightM,
    maxHeightM: ridgeH,
    profile: [
      { x: 0, y: 0 },
      { x: 0, y: eaveHeightM },
      { x: D / 2, y: ridgeH },
      { x: D, y: eaveHeightM },
      { x: D, y: 0 },
    ],
    roofProfile: [
      { x: 0, y: eaveHeightM },
      { x: D / 2, y: ridgeH },
      { x: D, y: eaveHeightM },
    ],
  };
}
