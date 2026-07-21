# Auto-Planning UK — what's built, and where it can go

TLDR of the current app (repo `roofplan`, branded **Auto-Planning UK** in the UI) with
enough architectural detail to plan expansion and automation. Companion doc:
[value-research.md](./value-research.md) for the commercial case.

## What it does today

A static SPA (Vite + React + TS + PicoCSS, no backend) that produces the full
drawing set a UK householder planning application needs for a like-for-like
roof material change: Location Plan (1:1250/1:2500 on OS mapping with a
red-line boundary), Existing/Proposed Roof Plans, and four Existing/Proposed
Elevations at 1:100 — each with a scale bar that is correct by construction —
bundled into one client-side PDF for the Planning Portal.

Flow: **case list → 3-step wizard** (Location Plan → Roof & Elevations →
Download). Postcode search centres the map and doubles as the case's address.
The site is password-gated by a Netlify edge function with an HMAC cookie
(`netlify/edge-functions/gate.ts`), styled as an "Auto-Planning UK" sign-in page.

## The one idea that matters

**Parametric single source of truth.** A house is `wings: Wing[]` — axis-
aligned rectangular blocks on a shared plan grid, each with roof type
(gable/hip/mono-pitch/flat), pitch, eave height, footprint, position,
quarter-turn rotation (0/90/180/270), windows/doors, an optional ridge
chimney and per-block material overrides (`src/data/types.ts`). Everything
else is *derived*:

- `src/geometry/roof.ts` — per-block 2D primitives (ridge/hips, elevation profiles); pure functions.
- `src/geometry/faces3d.ts` — full 3D solid per wing (walls, roof planes, openings, chimney), placed on the grid by quarter-turn rotation (winding preserved, Newell normals outward).
- `src/geometry/composite.ts` — projections: `elevationScene(wings, dir)` (backface cull + painter sort), `planScene`, `obliqueScene` (composer preview).
- `src/pdf/scale.ts` + `DrawingKit.tsx` — geometry is converted to physical page mm before layout, so printed scale is structural, not cosmetic.
- `src/pdf/PdfBundle.tsx` — assembles the multi-page document via `@react-pdf/renderer`.

Change a wing parameter and every plan, elevation, preview and PDF page
updates. This is what makes automation cheap: **anything that can produce
`Wing[]` + a boundary polygon gets the whole drawing set for free.**

## Supporting cast

- **Persistence**: `src/data/repository.ts` interface, currently one
  implementation (per-browser localStorage). A backend = a second
  implementation; call sites untouched.
- **OS Data Hub**: `src/os/client.ts` is the single choke point — vector tile
  style, key handling, free-vs-Premium plan probe (deep zooms 403 on free),
  and NGD building-height lookup (`getNearestBuilding`, trusted only at
  High/Moderate confidence) already used to prefill eave/pitch.
- **Basemap capture**: `src/os/basemap.ts` maps print scale ↔ Web-Mercator
  zoom (512px-tile convention — the 256px constant is a known 2× trap);
  capture is a canvas snapshot at exact pixel dimensions for the page.
- **Deploy**: Netlify free tier; OS key must be Premium plan and
  origin-restricted.

## Known validity gaps (roadmap, agreed with owner)

1. ~~Openings/chimney editor on elevations~~ — done, plus the July 2026
   gap-analysis pass: block plan with boundary clearances, outline floor
   plans, full materials schedule, rooflights, context neighbours, ground
   levels, blue line, external chimneys, change labels, applicant metadata
   and a generated Planning Statement (see CLAUDE.md roadmap).
2. Photo tracing for elevations (scale from a known dimension).
3. True valley/junction lines where blocks intersect.
4. Angled wings, half-hip/mansard roof forms, hip-plane rooflights, section page.
5. Netlify deploy + domain-restricted key end-to-end check.

## Expansion & automation levers

Ordered roughly by leverage-per-effort:

1. **Auto-trace the house from OS data.** The NGD API that already returns
   building heights also serves building **footprint polygons**. Decompose
   the footprint into axis-aligned rectangles → seed `Wing[]` automatically;
   heights/pitch from the existing prefill path. The wizard's step 2 becomes
   "check and nudge" instead of "draw". This is the single biggest step
   toward *postcode in → drawing set out*.
2. **Auto-suggest the red line.** OS NGD land parcels / INSPIRE polygons can
   pre-draw the boundary from the clicked property; user confirms.
3. **Headless generation.** `@react-pdf/renderer` renders in Node. The
   geometry layer is pure functions with no DOM deps. Only the basemap
   capture needs a browser (MapLibre canvas) — a small Playwright worker or a
   static-map raster endpoint closes that. Result: an API/queue that turns
   `{postcode, boundary?, wings?}` into a PDF server-side — the foundation
   for selling per-job generation to roofers.
4. **Accounts + billing.** Second `Repository` implementation (any KV/SQL) +
   auth to replace the password gate; Stripe per-case checkout on the
   Download step. localStorage repo remains the offline/dev fallback.
5. **Broaden the document set.** The same case data can fill site plans at
   1:200/1:500, a Design & Access-style cover statement (template text +
   materials), and application form fields — most conservation-area re-roof
   applications need exactly these.
6. **Beyond re-roofs.** `proposedWings` already diverges from existing —
   extensions/dormers work today at block level. Roadmap items 1–3 close the
   validity gap for those richer applications.

## Constraints to respect when expanding

- **OS licensing**: reselling output containing OS basemap imagery needs the
  commercial terms checked (see value-research.md). Keep `os/client.ts` the
  only OS touchpoint so a licensing change is one file.
- **Scale accuracy is structural** — never lay out drawings in arbitrary
  units and rescale; go through `mmForRealMetres`.
- **Vite pinned to 7** (Vite 8 breaks maplibre's worker in production
  builds); re-verify boundary drawing on a production build before upgrading.
- No test suite: verification is driving the app headlessly (Playwright,
  installed temporarily) and checking for zero console/page errors.
