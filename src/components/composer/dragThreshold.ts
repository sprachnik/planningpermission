/** When a press becomes a drag.
 *
 *  Both editors arm a drag on pointerdown, because that is also how a block or
 *  an opening is selected. Without a threshold the first pointermove — one
 *  pixel of jitter, which is what a real mouse click produces — ran the drag
 *  maths and wrote the result: `doSnap` re-snapped the item to the grid, so
 *  anything sitting off it (the x/y fields step in 0.1 m, the grid defaults to
 *  0.5) jumped by up to a quarter of a grid cell just for being clicked.
 *
 *  On the proposed house that turned a pure re-covering into a reshaped one.
 *  10 cm is a millimetre on a 1:100 sheet — invisible — but enough for
 *  `geometryKey` to differ, so the set printed "(altered)" labels on blocks
 *  nobody had touched, "alterations to Main house…" in the Planning Statement
 *  and "Proposed geometry differs from existing" on the Schedule of Materials.
 *  A document that goes to a council, describing works that were never
 *  proposed. Selecting something must never change it.
 *
 *  4 px matches the Windows system drag threshold (SM_CXDRAG). */
export const DRAG_THRESHOLD_PX = 4;

/** True once the pointer has travelled far enough from where it went down for
 *  the press to count as a drag rather than a selection. */
export function isDrag(downX: number, downY: number, clientX: number, clientY: number): boolean {
  return Math.hypot(clientX - downX, clientY - downY) >= DRAG_THRESHOLD_PX;
}
