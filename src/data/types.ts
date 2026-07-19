export type RoofType = "gable" | "hip" | "mono-pitch" | "flat";

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
/** A window or door on one wall of a wing (local frame, before rotation).
 *  "garage" is a wide sectional door; "open" is a doorway with no door leaf
 *  (open porch / carport aperture). Both sit on the ground like a door. */
export interface Opening {
  id: string;
  type: "window" | "door" | "garage" | "open";
  /** Wall in the wing's local frame: front y=0, back y=depth, left x=0, right x=width */
  side: "front" | "back" | "left" | "right";
  /** Distance (m) along the wall from its left corner as seen from outside */
  offsetM: number;
  widthM: number;
  heightM: number;
  /** Sill height above ground (m); 0 for doors */
  sillM: number;
}

/** A simple masonry chimney stack sitting on the ridge. */
export interface ChimneySpec {
  /** Distance (m) along the ridge axis from the wing's local x=0 end */
  offsetM: number;
  /** Stack size along the ridge (m); defaults to 0.9 */
  alongM?: number;
  /** Stack size across the ridge (m); defaults to 0.5 */
  acrossM?: number;
}

export interface Wing extends RoofParams {
  id: string;
  name: string;
  /** Plan offset of the wing's SW corner, metres east of origin */
  x: number;
  /** Plan offset of the wing's SW corner, metres north of origin */
  y: number;
  /** @deprecated legacy 90° flag — superseded by rotationDeg (treated as 90) */
  rotated?: boolean;
  /** Plan rotation in quarter turns (counter-clockwise). 0 = ridge east–west. */
  rotationDeg?: 0 | 90 | 180 | 270;
  openings?: Opening[];
  /** Gable/hip only (needs a ridge) */
  chimney?: ChimneySpec;
  /** Roof covering override for this block. Interpreted in the context of the
   *  wing set it belongs to (existing house vs proposed); falls back to the
   *  case-level `materials` label/colour when unset. */
  material?: string;
  materialColor?: string;
  /** Proposed-house blocks only: this block keeps its existing covering —
   *  drawings and the schedule show it as unchanged. */
  materialUnchanged?: boolean;
}

export interface PlanningCase {
  id: string;
  /** Display name for the case; falls back to `address` in the UI */
  name?: string;
  /** Full property address — printed in every drawing's title block. Seeded
   *  with the searched postcode until the user sets the real address. */
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
  /** Rotation (degrees) applied to the boundary *underlay* in the composer so
   *  an angled plot can line up with the axis-aligned blocks. Display aid
   *  only — never affects the saved boundary or the Location Plan. */
  composerBoundaryRotationDeg?: number;
  /** True compass bearing (° clockwise from north) that the plan grid's "up"
   *  (+y) direction faces. Undefined = derived from the boundary underlay
   *  rotation (rotating the true-north-up underlay CCW by R means grid-up
   *  faces bearing R), falling back to 0 (grid north = true north). Drives
   *  the composer compass, elevation names and the PDF north arrow. */
  northBearingDeg?: number;
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
