# Auto-Planning UK (repo: roofplan)

Generates the drawing set a UK householder planning application needs —
Location Plan with red-line boundary, Block Plan, Existing/Proposed Roof
Plans, eight elevation sheets, a Schedule of
Materials and a generated Planning Statement — as a single scaled, annotated
PDF bundle ready for the Planning Portal. Covers extensions, loft conversions
and dormers, outbuildings, re-roofs and other external alterations: each case
carries a **project type** (`caseType`) that, together with the actual
existing↔proposed difference, words the statement and schedule.

**Private tool — not open source.** Built by
[James Moores](https://www.linkedin.com/in/jamesmoores/).

Static Vite + React SPA, no backend — cases are stored in the browser's
`localStorage` (see `src/data/`), accounts are a localStorage stub, and the
whole app builds to plain static files for Netlify.

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
  magnified — crisp vector lines with generalised building outlines, plus an
  amber footer pill explaining the trade-off. Upgrade the project to the
  **Premium plan** (first £1,000/month free) for full-detail 1:1250 mapping.
  Without any key the Location Plan step is disabled; the Building &
  Elevations step and PDF export still work.
- `GATE_PASSWORD` — the password required to enter the deployed site
  (checked by `netlify/edge-functions/gate.ts`). Not used in local `vite
  dev`, only relevant once deployed to Netlify. `robots.txt`/`llms.txt` stay
  public for crawlers; set `GATE_PUBLIC=true` to open the whole site.

```bash
npm run dev    # localhost:5173 (note: OS keys are origin-restricted — add
               # your dev origin to the key's allowlist)
npm test       # vitest — geometry invariants + PDF smoke render
npm run build  # tsc + vite build → dist/
npm run lint   # oxlint
```

## How it works

Creating a case first asks **what the application is for** — the project type
(re-roof / extension / loft conversion or dormer / outbuilding / other), which
words the generated Planning Statement and schedule. It's skippable and
editable later via "Edit details"; skip it and the documents are written from
the existing↔proposed difference alone. Then the 3-step wizard:

1. **Location Plan** — search a postcode (it seeds the case address), draw a
   red-line boundary around the whole plot on the OS basemap (drag points to
   adjust, Ctrl+Z to step back), then capture a true-scale 1:1250 or 1:2500
   snapshot.
2. **Building & Elevations** — compose the building from rectangular blocks
   ("wings") on a snapping plan grid, with the site boundary from step 1
   drawn underneath as a tracing guide (rotatable as a display aid). Toggle
   between **Existing** and **Proposed**: proposed starts as a copy of
   existing (leave it alone when only materials change), or edit its blocks
   independently for extensions, dormers and outbuildings. Pick
   gable/hip/lean-to/flat from the palette,
   drag/resize/rotate (quarter turns) on the canvas, set pitch and eaves per
   block (or prefill from OS building-height data where confidence is
   High/Moderate), and place blocks precisely with numeric X/Y inputs. Add
   **windows, doors, garage doors, open doorways and chimneys** — new
   openings land on the wall facing the elevation view being edited, and
   drag directly on the pseudo-3D view or any elevation (the thumbnails
   switch the main editing view). Each block owns its **roof covering**,
   existing and proposed edited independently (or marked "covering
   unchanged" on proposed blocks). A **plan north bearing** — derived
   automatically from the boundary underlay rotation, manually overridable —
   drives a compass overlay on the plan, true-compass elevation names
   ("SSW Elevation") and the rotated north arrow on the PDF.
3. **Download** — `src/pdf/PdfBundle.tsx` assembles everything into one PDF
   (`@react-pdf/renderer`): every page carries a real title block (unique
   drawing number, revision, date, "1:100 at A4" statement, PLANNING purpose
   tag) and a real-world-accurate scale bar (1:100, falling back to an honest
   1:200 when the drawing wouldn't fit — chosen once per drawing family, so
   existing and proposed sheets are always at the same scale for comparison).
   Elevations get a sheet each, captioned beneath the drawing. The Location
   Plan overlays the boundary on the captured basemap at true scale with the
   OS copyright line (printed only when a basemap was actually captured);
   a Block Plan carries boundary clearance dimensions; and a Schedule of
   Materials plus a
   generated Planning Statement close it. Both of those last two are worded
   from the case's project type and the real existing↔proposed difference
   (`src/data/proposal.ts`), so an extension or window job is never described
   as a roof re-covering.

There's an in-app **Guidance** page (header link) walking through the
permitted-development limits per project type (extension depths, dormer
volume allowances, outbuilding heights, when a re-roof needs consent),
red-line rules, scales, materials wording, submission routes (Planning Portal
vs direct to the council) and the Building Regs / Party Wall /
bat-survey / heritage-statement traps.

See `CLAUDE.md` for the architecture map, geometry conventions, hard-won
gotchas (OS licensing/zoom quirks, MapLibre's 512px-tile zoom convention,
capture maths), and the roadmap. Deeper docs in `docs/`: OVERVIEW.md
(architecture TLDR + expansion levers), planning-requirements.md (validation
research + example PDFs), value-research.md (commercial case) and
automation-ideas.md (auto-trace from OS footprints, LiDAR, photos).

## Planning-validity caveats

The block model represents most houses fairly — elevations carry openings,
chimneys and rooflights, and neighbouring buildings can be added as grey
context blocks. But blocks are rectangular and quarter-turn only (no angled
wings or curved bays), junctions don't draw true valley lines, rooflights
can't sit on hip planes, the set carries no floor plans (some councils ask
for them on extensions and conversions), and conservation officers are the
pickiest audience. Check your council's local validation checklist before
treating the output as submission-ready for complex houses.

## Deploying to Netlify

Connect the repo (or `netlify deploy`), set `VITE_OS_API_KEY` and
`GATE_PASSWORD` as site environment variables, and deploy — `netlify.toml`
already wires up the build command and the password-gate edge function.
