export type RoofType = "gable" | "hip" | "mono-pitch";

export interface BoundaryPoint {
  lng: number;
  lat: number;
}

export interface RoofParams {
  /** Footprint width in metres (the axis the ridge runs along, for gable/hip) */
  widthM: number;
  /** Footprint depth in metres (the cross-pitch axis) */
  depthM: number;
  roofType: RoofType;
  pitchDegrees: number;
  eaveHeightM: number;
  /** Only used for mono-pitch: which edge is the high edge */
  highEdge?: "width-start" | "width-end" | "depth-start" | "depth-end";
}

export interface MaterialLabels {
  existing: string;
  proposed: string;
  /** Roof swatch colours (hex) tinting roof planes in previews and the PDF */
  existingColor?: string;
  proposedColor?: string;
}

/**
 * One rectangular block of the house on the shared plan grid. Width runs
 * along plan-x (east) and depth along plan-y (north) unless `rotated`, which
 * swaps the axes (ridge turns 90°).
 */
export interface Wing extends RoofParams {
  id: string;
  name: string;
  /** Plan offset of the wing's SW corner, metres east of origin */
  x: number;
  /** Plan offset of the wing's SW corner, metres north of origin */
  y: number;
  rotated?: boolean;
}

export interface PlanningCase {
  id: string;
  address: string;
  createdAt: string;
  updatedAt: string;
  /** Property boundary as drawn/edited on the location plan map */
  boundary: BoundaryPoint[];
  /** Map centre used to render the location plan */
  mapCentre?: BoundaryPoint;
  /** Captured basemap snapshot for the Location Plan PDF (data URL) */
  locationPlanImage?: string;
  locationPlanScale?: 1250 | 2500;
  /** Legacy single-block model; superseded by `wings` (migrated on load) */
  roof?: RoofParams;
  wings?: Wing[];
  /**
   * Proposed geometry when it differs from existing (extensions, dormers…).
   * Undefined means "same as `wings`" — the like-for-like material change.
   */
  proposedWings?: Wing[];
  materials: MaterialLabels;
}
