# roofplan

Branded **"Auto-Planning UK"** in the UI (wordmark, footer). Open source under
MIT (Sep 2026); public at github.com/sprachnik/planningpermission. There is no
sign-in and no server: the site is public static files and cases live in the
visitor's own localStorage. The stubbed localStorage account (`src/auth.ts`,
`AuthPage.tsx`) and the Netlify password-gate edge function were removed when
it went public — don't reintroduce a login without a real backend behind it.
Docs in `docs/`: `OVERVIEW.md` (architecture TLDR + expansion levers),
`planning-requirements.md` (what councils validate against),
`automation-ideas.md` (auto-trace/photo/LiDAR ideation).

Generates the drawing set a UK householder planning application needs.
The product is **not roof-specific** — a case carries a `caseType`
(re-roof / extension / loft-dormer / outbuilding / other) chosen when it is
created, and the copy throughout is framed around planning applications
generally. Output: Location Plan (1:1250/1:2500 with
red + optional blue line), Block Plan (1:200/1:500 with boundary clearance
dimensions), Existing/Proposed Roof Plans and eight elevation sheets (all four
compass directions × existing/proposed, one elevation per sheet, captioned
beneath the drawing, each named by the true wind it faces — "NNE Elevation",
never "South (NNE)"), a Schedule of Materials and a generated Planning
Statement — each drawing with an accurate scale bar, bundled as one PDF for
the Planning Portal. Floor plans were dropped from the set (owner decision
Aug 2026): the outline-level pages added noise without validation value.

## Commands

```bash
npm run dev      # Vite dev server (localhost:5173, or next free port)
npm run build    # tsc -b && vite build → dist/
npm run lint     # oxlint
npm test         # vitest — geometry invariants + PDF smoke render
```

Tests cover the pure layers: `src/geometry/composite.test.ts` (projection
invariants, rotation/normals regressions, openings/chimney),
`src/geometry/compass.test.ts` + `siteplan.test.ts` (bearings, boundary
clearances), `src/pdf/scale.test.ts` (scale maths), `src/pdf/pdfBundle.test.tsx`
(renders the real PDF in Node, asserts page count) and
`src/data/proposal.test.ts` (the generated statement/schedule wording — guards
against re-asserting a roof re-covering for non-roof cases). UI verification is still done by driving the app
headlessly: install `playwright` as a temporary devDependency, script the
wizard (sign in via the stubbed auth → create case → place blocks → download
PDF), screenshot each step, then uninstall. Check `console`/`pageerror`
events — the app should produce zero (bar the documented free-plan CORS probe).

## Environment

Copy `.env.example` → `.env.local`:

- `VITE_OS_API_KEY` — OS Data Hub key. **The project must be on the Premium
  plan** (free £1,000/month allowance): planning-scale zooms (17+) are
  "Premium Data" and 403 on the free OpenData plan. The app detects this and
  shows an upgrade banner. Restrict the key to the deployed domain — Vite
  inlines it into the public bundle, so origin restriction is the only thing
  protecting it.

## Architecture

Static SPA (Vite + React + TS + PicoCSS), no backend, no auth. Deploys to
Netlify (`netlify.toml` = build command + publish dir, nothing else), but
`dist/` is plain static files that any host will serve.

### Data

- `src/data/types.ts` — `PlanningCase` is the unit of persistence. It carries
  an optional `caseType` (`CaseType`: re-roof / extension / loft-dormer /
  outbuilding / other) naming the kind of application — undefined on legacy
  cases and whenever the user skips the question, in which case
  `data/proposal.ts` words the documents purely from the existing↔proposed
  diff. The building
  is modelled as `wings: Wing[]`: axis-aligned rectangular blocks on a shared
  plan grid, each with its own roof type (gable/hip/mono-pitch/flat), pitch
  (gables take an optional `rearPitchDegrees` — the ridge moves off-centre so
  asymmetric slopes meet), eave height, quarter-turn rotation (`rotationDeg`
  0/90/180/270; legacy `rotated` boolean = 90), openings (windows/doors/
  garage doors/open doorways per wall — only windows have a sill, and opening
  tops clamp to the *real* wall top, so gable-end/mono walls take upper
  windows above the eaves; garage doors render with panel lines, open
  doorways as a dark aperture), rooflights on gable/mono slopes,
  `groundOffsetM` (stepped/sloping sites — heights and elevation baselines
  follow), `zOrder` (manual painter-layer override for overlapping blocks;
  display-only, ignored by `geometryUnchanged`), `isContext` (neighbouring
  building drawn grey, excluded from schedules/heights/notes), `storeys` +
  `roomLabels` (legacy — fed the removed floor plan pages; kept so saved cases
  parse), `wallMaterial` (schedule),
  optional chimney (on the ridge, or an external stack up a gable end), and
  its own roof covering (`material`/
  `materialColor` — blocks are independent; `materialUnchanged` marks a
  proposed block keeping its existing covering). Coverings are granular by
  design — there is no whole-house material control in the UI; the proposed
  house copies the existing coverings and each re-roofed block is changed in
  its own panel. `normaliseCase()` materialises blank block coverings from
  the case `materials` on open; those case fields survive only as hidden
  seeds/legacy fallback labels — **documents must quote coverings via
  `coveringSummary()`/per-block resolution, never the case fields directly**
  (quoting the seed printed a covering the user had long since changed).
  `geometryUnchanged()`/`wingChanges()` (`data/caseGeometry.ts`) compare a
  *canonical* geometry key, not raw wing JSON: names, ids-order, zOrder,
  material fields, materialised defaults (`rotationDeg: 0`, `openings: []`,
  rear pitch equal to front, chimney "ridge") are all ignored — raw JSON
  comparison once stamped "Proposed geometry differs from existing" on a pure
  re-covering because blocks had been renamed/touched in the composer. Keep it
  canonical when adding wing fields: geometry fields join `geometryKey`,
  display fields must not. `proposedWings` holds diverged proposed
  geometry (extensions/dormers); undefined means "same as existing" — the
  like-for-like material change. `materials` carries labels plus optional
  roof swatch colours (defaults in `components/svgDraw.ts`). `roof` is the
  legacy single-block field, migrated to `wings` by `normaliseCase()` in
  `App.tsx` on open. `northBearingDeg` is the true bearing plan-up faces
  (defaults to `composerBoundaryRotationDeg` — aligning the north-up plot
  underlay to the grid by R° CCW means plan-up faces bearing R): it drives
  the composer's compass overlay, the elevation names (`elevationName()` in
  `geometry/compass.ts` — the true wind alone, "NNE"/"South") and the rotated
  PDF north arrow; wall names in the openings editor keep the grid name with
  a "(SSW)"-style suffix (`windSuffix`). The plan geometry itself stays
  axis-aligned.
- `src/data/proposal.ts` — **how the application describes itself in words.**
  `CASE_TYPES` (labels/hints/noun phrases for the project-type picker) and
  `describeProposal()`, which produces the Planning Statement prose, the
  proposed roof-plan/elevation annotations and the schedule note. It combines
  the stated `caseType` with what *actually* differs between existing and
  proposed — `coveringChanged()` compares per-block coverings, never
  inferring a re-covering from geometry. This exists because the old code
  keyed everything off `geometryUnchanged()` and so asserted "consent for the
  replacement of the roof covering" for *any* unchanged-geometry case
  (window swaps, render, solar). Never reintroduce that inference: unchanged
  geometry means unchanged geometry, nothing more.
  **One work item per clause.** The covering clause carries its own scope
  ("the replacement of the roof covering to Main house and Gable 3, from X to
  Y"), so the works listed beside it are geometry only, and a re-covered block
  is never also named under "alterations to …": doing both read as two separate
  jobs on one roof, and on a re-covering it named the same blocks twice. The
  elevation footnote follows suit — a covering-only job prints one line
  ("Alterations: roof covering replaced as scheduled above. No other changes
  proposed.") rather than a block-by-block roll-call restating the coverings
  note above it. Owner review, Aug 2026.
  The same trap has a second door, closed by `CASE_TYPES[].requires`: a stated
  `caseType` is a statement of intent, not evidence. Picking "re-roof" and
  leaving both coverings identical once produced a statement asking consent
  "for the replacement of the roof covering" on the same page that said the
  covering was unchanged. A type's phrase is only used when the model backs it
  up (`requires: "covering" | "geometry"`, unset = always allowed, as for
  "other"); otherwise the wording falls back to the diff and `typeMismatch` is
  raised so App.tsx can flag it on the Download step. Covered by
  `proposal.test.ts`.
- `src/data/repository.ts` + `localStorageRepository.ts` — the "database
  stub". All persistence is per-browser localStorage behind a small
  `Repository` interface; a real backend later means writing a second
  implementation, not touching call sites.

### Geometry (the heart of the app)

Single source of truth: parametric wings → everything else is derived.

- `src/geometry/roof.ts` — 2D primitives for one block: top-down roof plan
  (ridge/hips/slope arrow, `ridgeHeightM = eave + run·tan(pitch)`) and
  single-block elevation profiles. Pure functions, no rendering deps.
- `src/geometry/faces3d.ts` — builds the complete 3D solid (all walls + all
  roof planes) for one wing, places it on the plan grid (translate +
  quarter-turn rotation about the footprint — true rotations preserve
  winding, so Newell normals stay outward with no point-order tricks).
- `src/geometry/composite.ts` — projects the combined solids:
  - `elevationScene(wings, dir)` — orthographic N/E/S/W elevations.
    Convention: an "S" elevation is what you see standing south looking
    north; horizontal axes are mirrored per direction so east/west read
    correctly. Backface cull (`normal · toViewer > 0`) then painter sort
    far-to-near gives correct occlusion between blocks.
  - `obliqueScene(wings)` — cabinet-style pseudo-3D (depth up-right at
    KX=0.45/KY=0.26) for the composer's placement preview.
  - `planScene(wings)` — composite bird's-eye roof plan.
- `src/geometry/latlng.ts` — equirectangular lat/lng → local metres
  (fine at house scale).

### Rendering

- `src/components/RoofPreviewSvg.tsx` — on-screen SVG renderers for the
  projected scenes (shared fills/strokes, dimension labels, palette
  thumbnails). Real-world metres are the SVG user unit; y is flipped at
  render time (`flip()`), not in the geometry.
- `src/pdf/scale.ts` — the page-layout constants (A4 landscape, margins,
  content area) shared by PDF and basemap capture. **Scale accuracy is
  structural**: geometry is converted to physical page mm
  (`mmForRealMetres`) before layout, so the scale bar is correct by
  construction.
- `src/pdf/DrawingKit.tsx` — `DrawingPage` (title block, border, north
  arrow, `ScaleBar`) hands children a `toMm` transform (centred, y-flipped).
  An optional `caption` prints directly beneath the drawing; it reserves
  `CAPTION_BAND_MM` at the foot of the content area, which scale-fitting
  callers must subtract too.
- `src/pdf/drawingScales.ts` — **one scale per drawing family.**
  `elevationSetScale()` fits once across *both* variants
  and every direction, and the result is passed into each page. Fitting each
  sheet to its own extent is what let a proposed sheet quietly drop to 1:200
  because a new wing made it wider, while the existing sheet it is meant to be
  compared against stayed at 1:100. Kept out of `PdfBundle.tsx` so the
  component module only exports components (react-refresh lint rule).
- `src/pdf/PdfBundle.tsx` — assembles the full document: Location Plan (only
  when boundary drawn; when a basemap was captured the drawing extent MUST
  be the image's true ground coverage centred on the capture point, or the
  red line misaligns — see comment there; the OS copyright note belongs only
  on sheets that actually carry OS mapping), roof plans, and one elevation
  sheet per direction × existing/proposed, each captioned beneath its drawing.
  `roofSwatchFor()` → `variantRoofColor()` (svgDraw.ts) resolves roof colour
  **from the material name first** (`colorForMaterial`), then the case swatch,
  then the variant default. The drawing must never contradict the label the
  schedule prints: colouring by variant alone drew blocks labelled "Kent peg
  tile" in slate grey, and on a re-covering — where existing and proposed
  differ in nothing but material — left the two sets looking identical, so the
  drawings showed no change on an application that was entirely about the
  change. An explicit per-block `materialColor` (the composer's colour picker)
  still wins; the Download step warns when both variants still resolve to the
  same colour. Covered by `components/svgDraw.test.ts`.

### OS / external data

- `src/os/client.ts` — the single choke point for OS Data Hub calls: vector
  tile style + `transformRequest` (appends key to sprite/glyph/tile
  requests), NGD building heights (`height_confidencelevel` must be
  High/Moderate to trust), `hasApiKey()` guard.
- `src/os/basemap.ts` — Web-Mercator zoom ↔ print-scale maths for capturing
  the basemap at a true 1:1250/1:2500.
- `src/os/postcode.ts` — free postcodes.io lookup (no key) to centre the map.

### UI flow (`src/App.tsx`)

Case list → 3-step wizard per case (shared `Shell` header/footer chrome):
Location Plan (`LocationPlanStep`: MapLibre vector basemap, postcode search —
the searched postcode is saved as the case's `address`, naming the case, PDF
filename and title blocks — click-to-draw red-line boundary with drag-to-move
points and undo, capture at chosen scale via canvas snapshot) → Building &
Elevations (`Step` key `"model"`; the component is still named
`RoofComposerStep` internally — `components/composer/`: existing/proposed
toggle — proposed is seeded as a copy of existing on first open — palette +
plan canvas with grid/snap/drag/resize, site-boundary underlay traced from
step 2, pseudo-3D + four elevation previews tinted by the material swatch) →
Download (client-side PDF via `@react-pdf/renderer`, keyed by `updatedAt`).

Creating a case opens the "What's this application for?" modal (the details
modal in `draftIsNew` mode) so `caseType` is captured up front; it's skippable
and re-editable via "Edit details". New cases seed `materials.existing ===
materials.proposed` deliberately — the tool must not assume the covering is
changing.

## Gotchas / hard-won knowledge

- **OS free plan ≠ full detail.** Tiles deeper than z15 are Premium Data
  (403 — observed empirically; the docs' "z17+" is wrong for this style).
  The Premium plan's first £1,000/month is free. `client.ts#hasPremiumTiles`
  probes one z16 tile at startup; on free plans `osVectorStyleCapped()` caps
  tile sources at z15 AND retunes the layer zoom bands (the style swaps to
  Premium-only source-layers past z15, so capping sources alone renders a
  blank beige map): layers visible at z15 lose their `maxzoom`, layers with
  `minzoom > 15` are dropped. MapLibre then *overzooms* the free vector
  data — crisp at planning zooms, just generalised building outlines — and
  App.tsx shows an amber footer pill (tooltip carries the detail; it re-uses
  the same cached `hasPremiumTiles()` probe). A hard tile-failure banner
  remains as belt-and-braces if the probe misdetects. The probe logs one
  unavoidable CORS console error on free plans (OS 403s carry no CORS
  headers) — expected, not a bug.
- **OS keys are origin-restricted.** Tile/style requests 403 unless the
  browser origin is on the key's allowlist — plain curl/PowerShell requests
  403 even for free-plan zooms, and a Vite dev server that lands on an
  unlisted port (5175 when 5173/5174 are busy) gets a blank map. Test
  through a browser context on an allowed origin.
- **Vite is pinned to 7.** The rolldown-based Vite 8 mis-bundles
  maplibre-gl's web worker ("GV/f is not defined" inside the worker blob):
  GeoJSON sources render nothing in production builds only — dev serves
  unbundled modules and works, which makes it easy to ship broken. See the
  comment in vite.config.ts; re-verify boundary drawing on a production
  build before upgrading Vite.
- **MapLibre zoom ≠ OSM zoom.** MapLibre/Mapbox zoom follows the 512px-tile
  convention — one level offset from the classic 256px formula
  (156543·cos(lat)/2^z). `os/basemap.ts` uses the 512px constant (78271.5);
  using the 256px one made "1:1250" captures actually 1:625 and misaligned
  the PDF red-line overlay by exactly 2×.
- **PDFDownloadLink caches its blob** — it renders the document once on
  mount and ignores prop changes, so it's keyed by `updatedAt` in App.tsx;
  without that, edits don't reach the downloaded PDF.
- **MapLibre blank canvas**: container size can settle after map init; a
  `ResizeObserver` calling `map.resize()` fixes "map doesn't draw until
  zoom". `canvasContextAttributes: { preserveDrawingBuffer: true }` is
  required for `toDataURL()` capture.
- **The basemap capture must exclude the boundary overlays.** `capture()` in
  `LocationPlanStep.tsx` hides `boundary-line`/`boundary-points`/
  `blueline-*` around the snapshot (restoring them in a `finally`, or the user
  is left with a boundary they can't see or edit). The PDF draws those lines
  itself, as vectors placed from the capture centre; leaving the layers on
  bakes a second raster copy into the image and the two land a fraction apart,
  so the Location Plan prints a doubled red line — which reads as two site
  boundaries at validation.
- **Selecting must never move.** Both editors arm a drag on `pointerdown`,
  which is also how a block/opening is selected, so without a travel threshold
  (`components/composer/dragThreshold.ts`, 4 px) one pixel of click jitter ran
  the drag maths and committed it: `doSnap` re-snapped the item to the grid,
  moving anything sitting off it (x/y fields step 0.1 m, grid defaults to 0.5)
  by up to a quarter cell. 10 cm is a millimetre at 1:100 — invisible on the
  drawing, but `geometryKey` differs, so a pure re-covering printed "(altered)"
  labels, "alterations to Main house…" in the Planning Statement and "Proposed
  geometry differs from existing" on the schedule: a document sent to a council
  describing works nobody proposed. Any new pointer interaction that writes
  model state needs the same guard. `matchProposedGeometry()` repairs sets
  already carrying a nudge ("Match shape to existing" in the composer), keeping
  the proposed coverings — plain "Reset to existing" would discard them. A
  `re-roof` case clears the project-type check on the covering alone, so
  diverged geometry used to reach the PDF with nothing flagged; the Download
  step now calls it out and points at that repair.
- **Rotation is true quarter turns** (`rotationDeg` 0/90/180/270, CCW about
  the footprint, via `rotateLocalPoint` in faces3d.ts) — rotations preserve
  winding so Newell normals stay outward. The old `rotated` boolean was a
  *transpose* (a mirror, needing point-order reversal); it's still read as
  90° via `wingRotation()` but never written. If you ever add a mirroring
  transform again, you must reverse point order or elevations silently lose
  faces to the backface cull.
- **react-pdf has no `<g>`** inside its `Svg`; use `Fragment`.
- **Planning validity**: drawings should fairly represent the real house.
  The block model now carries openings, rooflights, chimneys (ridge or
  gable-end), asymmetric pitches, stepped ground and context neighbours, but
  still has no true valley geometry at block junctions, no angled
  (non-quarter-turn) wings and no hip-plane rooflights — see roadmap before
  treating output as submission-ready for complex houses. The set carries no
  floor plans (removed Aug 2026); some LPAs ask for them on
  extensions/conversions.

## Roadmap (agreed with owner)

1. ~~Openings/chimney editor on elevations~~ — DONE (v1): per-wing
   windows/doors/garage doors/open doorways as coplanar faces drawn proud of
   their wall (`faces3d.ts`), ridge chimney box, composer editor section,
   rendered in previews + PDF.
2. ~~Gap-analysis pass (Jul 2026)~~ — DONE: block plan page with boundary
   clearances (`geometry/siteplan.ts`), outline floor plans (storeys/room
   labels; removed again Aug 2026 — owner judged them noise),
   wall/joinery/rainwater materials in the schedule, rooflights
   (gable/mono), context-only neighbour blocks, per-block ground levels with
   stepped elevation baselines, blue line on the location plan, external
   gable-end chimneys, NEW/ALTERED change labels on proposed drawings,
   applicant/agent title-block metadata, generated Planning Statement page.
3. ~~De-roof-centring pass (Jul 2026)~~ — DONE: the product is a general
   householder planning tool, not a re-roof tool. `caseType` +
   `data/proposal.ts`, wizard step 2 renamed Building & Elevations, project
   type asked on case creation, Guide page covers extension/dormer/outbuilding
   permitted-development limits, and the statement/schedule no longer infer a
   roof re-covering from unchanged geometry.
4. Photo tracing for elevations (scale from a known dimension).
5. True valley/junction lines where blocks intersect (also unlocks honest
   dormers-as-blocks).
6. Angled (non-quarter-turn) wings; more roof forms (half-hip, mansard);
   rooflights on hip planes; dedicated site-section page.
7. Netlify deploy + domain-restricted key end-to-end check.
8. Auto-trace from OS NGD footprints / INSPIRE parcels / LiDAR — see
   `docs/automation-ideas.md`.
