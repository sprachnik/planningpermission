# roofplan

Generates the drawing set a UK householder planning application needs —
Location Plan with red-line boundary, Existing/Proposed Roof Plans, and four
Existing/Proposed Elevations — as a single scaled, annotated PDF bundle ready
for the Planning Portal. Built for like-for-like roof material changes
(e.g. Kent peg tile → grey slate), and the proposed drawings can carry their
own geometry too (extensions, dormers).

Static Vite + React SPA, no backend — cases are stored in the browser's
`localStorage` (see `src/data/`), and the whole app builds to plain static
files for Netlify.

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

- `VITE_OS_API_KEY` — an [OS Data Hub](https://osdatahub.os.uk/) API key,
  restricted to your dev/deployed origin (Data Hub dashboard > Project >
  API keys). Works on the **free** plan: close-up tiles (z16+) are "Premium
  Data", so the app detects the plan and renders the most detailed free data
  magnified — crisp vector lines with generalised building outlines, plus a
  banner explaining the trade-off. Upgrade the project to the **Premium
  plan** (first £1,000/month free) for full-detail 1:1250 mapping. Without
  any key the Location Plan step is disabled; the Roof & Elevations step and
  PDF export still work.
- `GATE_PASSWORD` — the password required to enter the deployed site
  (checked by `netlify/edge-functions/gate.ts`). Not used in local `vite
  dev`, only relevant once deployed to Netlify.

```bash
npm run dev    # localhost:5173 (note: OS keys are origin-restricted — add
               # your dev origin to the key's allowlist)
npm run build  # tsc + vite build → dist/
npm run lint   # oxlint
```

## How it works

1. **Location Plan** — search a postcode (auto-filled from the case
   address), draw a red-line boundary on the OS basemap with a crosshair
   pointer (drag points to adjust, Ctrl+Z/undo to step back), then capture
   a true-scale 1:1250 or 1:2500 snapshot.
2. **Roof & Elevations** — compose the house from rectangular blocks
   ("wings") on a snapping plan grid, with the site boundary from step 1
   drawn underneath as a tracing guide. Toggle between **Existing** and
   **Proposed**: proposed starts as a copy of existing (a pure material
   change), or edit its blocks independently for extensions and dormers.
   Pick gable/hip/lean-to from the palette, drag/resize on the canvas, set
   pitch and eave heights per block (or prefill from OS building height
   data where confidence is High/Moderate). Material names and roof colour
   swatches tint the live previews: pseudo-3D, bird's-eye roof plan, and
   four compass-true orthographic elevations.
3. **Download** — `src/pdf/PdfBundle.tsx` assembles everything into one PDF
   (`@react-pdf/renderer`): each page carries a real-world-accurate scale
   bar (1:100, falling back to an honest 1:200 when the drawing wouldn't
   fit) and the Location Plan overlays the boundary on the captured basemap
   at true scale.

See `CLAUDE.md` for the architecture map, geometry conventions, hard-won
gotchas (OS licensing/zoom quirks, MapLibre's 512px-tile zoom convention,
capture maths), and the roadmap.

## Planning-validity caveats

The block model represents most houses fairly, but elevations have no
openings (doors/windows) or chimneys yet, and block junctions don't draw
true valley lines — check with your LPA before treating the output as
submission-ready for complex houses.

## Deploying to Netlify

Connect the repo (or `netlify deploy`), set `VITE_OS_API_KEY` and
`GATE_PASSWORD` as site environment variables, and deploy — `netlify.toml`
already wires up the build command and the password-gate edge function.
