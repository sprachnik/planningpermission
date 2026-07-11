# roofplan

Generates the drawing set a UK householder planning application needs for a
like-for-like roof material change (e.g. Kent peg tile → grey slate):
Location Plan (1:1250/1:2500), Existing/Proposed Roof Plans and four
Existing/Proposed Elevations (1:100), each with an accurate scale bar,
bundled as one PDF for the Planning Portal.

## Commands

```bash
npm run dev      # Vite dev server (localhost:5173, or next free port)
npm run build    # tsc -b && vite build → dist/
npm run lint     # oxlint
```

No test suite. Verification is done by driving the app headlessly: install
`playwright` as a temporary devDependency, script the wizard (create case →
place blocks → download PDF), screenshot each step, then uninstall. Check
`console`/`pageerror` events — the app should produce zero.

## Environment

Copy `.env.example` → `.env.local`:

- `VITE_OS_API_KEY` — OS Data Hub key. **The project must be on the Premium
  plan** (free £1,000/month allowance): planning-scale zooms (17+) are
  "Premium Data" and 403 on the free OpenData plan. The app detects this and
  shows an upgrade banner. Restrict the key to the deployed domain.
- `GATE_PASSWORD` (+ optional `GATE_SECRET`) — checked by the Netlify edge
  function; irrelevant to local dev.

## Architecture

Static SPA (Vite + React + TS + PicoCSS), no backend. Deploys to Netlify;
`netlify/edge-functions/gate.ts` password-gates the whole site with an
HMAC-signed cookie (runs on the free tier, unlike Netlify's built-in
password protection).

### Data

- `src/data/types.ts` — `PlanningCase` is the unit of persistence. The house
  is modelled as `wings: Wing[]`: axis-aligned rectangular blocks on a shared
  plan grid, each with its own roof type (gable/hip/mono-pitch), pitch, eave
  height, and optional 90° rotation. `proposedWings` holds diverged proposed
  geometry (extensions/dormers); undefined means "same as existing" — the
  like-for-like material change. `materials` carries labels plus optional
  roof swatch colours (defaults in `components/svgDraw.ts`). `roof` is the
  legacy single-block field, migrated to `wings` by `normaliseCase()` in
  `App.tsx` on open.
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
  optional axis-swap; point order reversed on rotation to keep Newell
  normals outward).
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
- `src/pdf/PdfBundle.tsx` — assembles the full document: Location Plan (only
  when boundary drawn; when a basemap was captured the drawing extent MUST
  be the image's true ground coverage centred on the capture point, or the
  red line misaligns — see comment there), roof plans, and elevation pages
  (S+E, N+W) × existing/proposed.

### OS / external data

- `src/os/client.ts` — the single choke point for OS Data Hub calls: vector
  tile style + `transformRequest` (appends key to sprite/glyph/tile
  requests), NGD building heights (`height_confidencelevel` must be
  High/Moderate to trust), `hasApiKey()` guard.
- `src/os/basemap.ts` — Web-Mercator zoom ↔ print-scale maths for capturing
  the basemap at a true 1:1250/1:2500.
- `src/os/postcode.ts` — free postcodes.io lookup (no key) to centre the map.

### UI flow (`src/App.tsx`)

Case list → 4-step wizard per case: Details (address; postcode is extracted
and drives the map) → Location Plan (`LocationPlanStep`: MapLibre vector
basemap, click-to-draw red-line boundary with drag-to-move points and
undo, capture at chosen scale via canvas snapshot) → Roof & Elevations
(`components/composer/`: existing/proposed toggle — proposed is seeded as
a copy of existing on first open — palette + plan canvas with grid/snap/
drag/resize, site-boundary underlay traced from step 2, pseudo-3D + four
elevation previews tinted by the material swatch) → Download (client-side
PDF via `@react-pdf/renderer`, keyed by `updatedAt`).

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
  `LocationPlanStep` shows an info banner. A hard tile-failure banner
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
- **Rotation = transpose**, which mirrors winding — `placeWingFaces`
  reverses point order for rotated wings so normals stay outward. Break
  this and elevations silently lose faces to the backface cull.
- **react-pdf has no `<g>`** inside its `Svg`; use `Fragment`.
- **Planning validity**: drawings should fairly represent the real house.
  The block model approximates shape well but has no openings
  (doors/windows), chimneys, or true valley geometry at block junctions —
  see roadmap before treating output as submission-ready for complex
  houses.

## Roadmap (agreed with owner, not yet built)

1. Openings/chimney editor on elevations (biggest validity win, cheap).
2. Photo tracing for elevations (scale from a known dimension).
3. True valley/junction lines where blocks intersect.
4. Netlify deploy + domain-restricted key end-to-end check.
