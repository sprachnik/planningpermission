# roofplan

Generates the drawings a UK planning application for a like-for-like roof
material change needs (Location Plan, Existing/Proposed Roof Plans,
Existing/Proposed Elevations) as a single scaled, annotated PDF bundle.

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
  restricted to your dev/deployed domain (Data Hub dashboard > Project >
  API keys). **The project must be on the Premium plan** (first
  £1,000/month free) — planning-scale zooms are "Premium Data" and 403 on
  the free plan. Without a working key the Location Plan step shows a
  warning and the basemap/boundary tools are disabled; the Roof &
  Elevation step and PDF export still work.
- `GATE_PASSWORD` — the password required to enter the deployed site
  (checked by `netlify/edge-functions/gate.ts`). Not used in local `vite
  dev`, only relevant once deployed to Netlify.

```bash
npm run dev
```

## How it works

1. **Location Plan** — search a postcode (auto-filled from the case
   address), draw a red-line boundary on the OS basemap, capture it as a
   true-scale 1:1250/1:2500 snapshot.
2. **Roof & Elevations** — compose the house from rectangular blocks
   ("wings") on a snapping plan grid: pick gable/hip/lean-to from the
   palette, drag/resize on the canvas, set pitch and eave heights per block
   (or prefill from OS building height data where confident). A pseudo-3D
   view and four orthographic elevations (N/E/S/W) update live from the
   same model.
3. **Download** — `src/pdf/PdfBundle.tsx` assembles everything into one PDF
   (`@react-pdf/renderer`), with a real-world-accurate scale bar and north
   arrow on every page (`src/pdf/DrawingKit.tsx`).

See `CLAUDE.md` for the architecture map, geometry conventions, gotchas
(OS licensing, MapLibre capture), and roadmap.

## Deploying to Netlify

Connect the repo (or `netlify deploy`), set `VITE_OS_API_KEY` and
`GATE_PASSWORD` as site environment variables, and deploy — `netlify.toml`
already wires up the build command and the password-gate edge function.
