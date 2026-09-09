# Automating the drawing set — ideation (July 2026)

Goal: shrink "postcode → Portal-ready PDF" from ~15 minutes of tracing to a
couple of confirmation clicks. Everything below feeds the same bottleneck:
anything that can produce `Wing[]` (+ a boundary polygon) gets the entire
drawing set for free — see [OVERVIEW.md](./OVERVIEW.md).

## First: what the grey shapes on the map actually are

They are **buildings, not plots** — but which buildings depends on the plan:

- **Premium plan (deep zooms)**: individual OS MasterMap-derived building
  footprints — accurate outlines of each structure, exactly what we'd trace.
- **Free plan (overzoomed z15 data)**: OS Open Zoomstack-style *generalised*
  buildings — adjacent buildings merged into blocks, corners simplified. Fine
  for orientation, not for tracing.

Land **plots** are not on the basemap at all. Ownership parcels come from a
different dataset: HMLR **INSPIRE Index Polygons** (free, open) or OS NGD land
features. Garden fences etc. exist in MasterMap topo as lines, not parcels.

## Idea 1 — Click a building → house appears (highest leverage)

The app already calls the OS **NGD Features API** for building heights
(`getNearestBuilding` in `src/os/client.ts`). The same
`bld-fts-buildingpart` collection returns the **footprint polygon** too — we
currently throw it away. So:

1. User clicks the building on the map (or we take the boundary centroid).
2. Fetch the NGD building part(s) intersecting that point: exact footprint
   polygon + eave/ridge height attributes (confidence-filtered, as now).
3. Footprint → `Wing[]`:
   - Rotate to the footprint's dominant orientation (minimum-area bounding
     rectangle angle) — wings are axis-aligned on their own grid anyway.
   - Decompose the (rectilinear-ish) polygon into rectangles: greedy split at
     reflex corners handles the L/T/U shapes that cover most UK housing.
     Snap edges to 0.25 m. Non-rectilinear leftovers: fit the min-area rect
     and let the user nudge.
   - Per rectangle: eave height from NGD; pitch from `(ridge − eave) / (run)`
     as the prefill already does; ridge along the long axis.
4. Roof type (gable vs hip) can't come from NGD reliably → default gable,
   one-click toggle per wing (the composer already does this).

Result: step 2 becomes *review*, not *draw*. Do the same trick for the red
line with INSPIRE parcels: click → parcel polygon → pre-drawn boundary.

Implementation notes: prefer the NGD Features API polygon over
`queryRenderedFeatures` on the vector tiles — tile geometry is clipped at
tile edges and generalised on free plans. Free plan users still get this,
because NGD Features is a separate API from the Premium tile layers (verify
allowance on the key).

## Idea 2 — LiDAR does the heights and pitch for free

DEFRA's **National LiDAR Programme** (open data, most of England at 1 m,
much at 25–50 cm) gives DSM + DTM rasters. Within a known footprint:

- eave/ridge = percentiles of (DSM − DTM);
- fit planes to the DSM points inside the footprint → number of roof slopes,
  their pitch, and ridge orientation, computed rather than guessed;
- distinguishes gable (2 planes) from hip (4) — closing Idea 1's blind spot.

Could run client-side against pre-tiled COGs, or in the headless worker
(Idea 4). This is the cheapest route to "we measured your roof from national
survey data" as a selling point.

## Idea 3 — Photos

Two tiers, matching roadmap item 2:

- **Single elevation photo, assisted**: user photographs each elevation
  roughly front-on, clicks 4 corners of a known rectangle (e.g. the gable
  wall), enters one known dimension → homography rectifies the photo to true
  scale. From that: eave/ridge heights checked against LiDAR/NGD, and —
  the real prize — **openings**: user clicks window/door corners on the
  rectified photo and they land on the elevation at correct scale, feeding
  roadmap item 1 (the biggest validity gap). The rectified photo could even
  print *as* the existing elevation backdrop.
- **VLM assist**: run the photo through a vision model to propose roof type,
  storey count, and opening bounding boxes for one-click confirmation.
  Useful sugar, but keep the deterministic click-to-scale path as the source
  of truth — planning drawings must be defensible.

Full photogrammetry (multi-photo mesh) is overkill for block-level drawings;
revisit only if true 3D facades become a product goal.

## Idea 4 — Headless end-to-end (the product version)

Chain 1–3 into a queue worker: `{postcode}` → INSPIRE parcel → NGD footprint
+ heights → LiDAR pitch → `Wing[]` → `@react-pdf/renderer` in Node →
PDF emailed back. Geometry is already pure/DOM-free; only basemap capture
needs a browser (small Playwright worker). That's the "send a postcode, get a
drawing set" shape.

## Suggested order

1. NGD footprint → wings (Idea 1) — reuses the existing NGD client, biggest
   minutes-saved.
2. INSPIRE parcel → red line — same shape of work, removes the fiddliest UI.
3. Photo-rectified openings (Idea 3a) — closes the validity gap.
4. LiDAR pitch/roof-type (Idea 2) — polish + marketing.
5. Headless pipeline (Idea 4) — once 1–2 prove the auto-trace quality.
