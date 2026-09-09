# UK householder planning application — drawing set requirements

Research notes for Auto Plan (July 2026). Scope: what a valid householder
application drawing set must contain (national requirements + common local
validation list items), what real submitted drawings look like, and the gaps
between those and Auto Plan's generated set. Sources and downloaded example
drawings are linked at the end.

---

## 1. National (statutory) requirements

Basis: Town and Country Planning (Development Management Procedure) (England)
Order 2015 (as amended), as summarised in the Government's Planning Practice
Guidance "Making an application" and the Planning Portal's "Maps, plans and
planning applications: What to submit" guide. Every householder application
needs:

- **Completed application form** (householder form), signed and dated, with a
  concise, accurate description of the development. The form itself asks for
  **existing and proposed materials** (walls, roof, windows, doors) — for a
  roof material change this is where "Kent peg tile" → "natural slate" is
  declared in words.
- **Ownership certificate** (A/B/C/D) + Agricultural Holdings declaration.
  Note: if the red line includes pavement/highway the applicant doesn't own,
  Certificate B + notice on the Highways Authority is needed.
- **The fee**.
- **A location plan** (mandatory for all planning permission applications).
- **Any other plans, drawings and information necessary to describe the
  development** — in practice, for householder work: existing + proposed
  elevations, existing + proposed floor/roof plans, and (per local lists) a
  site/block plan and sometimes sections.

### 1.1 Location plan (national criteria)

- Identified standard metric scale — **1:1250, or 1:2500 for larger sites** —
  and **scaled to fit A4 or A3 paper**.
- **Show the direction of north.**
- Based on an **up-to-date map** (OS or equivalent standard).
- **Application site edged clearly in red**, including *all land necessary to
  carry out the development* — e.g. land needed for access from the public
  highway, visibility splays, parking.
- **Any other land owned by the applicant** near/adjoining the site **edged
  blue**.
- Identify **sufficient roads and/or buildings on adjoining land** so the
  exact location is unambiguous — councils commonly phrase this as "**show at
  least two named roads** wherever possible" (Uttlesford asks for named/
  numbered surrounding properties too; its local list even says three street
  names "where possible").

**OS licensing rules for the map base** (Planning Portal guide):
- Must **show OS Crown copyright acknowledgement** and the **correct licence
  number** if printed/copied.
- Must **not** be a Land Registry document, a photocopy or screen grab, or
  reused across multiple applications.
- (Auto Plan captures OS Data Hub tiles under its own API plan — the PDF
  location plan page should carry the corresponding © Crown copyright and
  database right attribution + licence line.)

### 1.2 Site plan / block plan (national guidance, requested by most local lists)

- Identified standard metric scale, typically **1:100, 1:200 or 1:500**.
- Show the direction of north.
- Proposed development in relation to **site boundaries and other buildings
  on site, with written dimensions including distances to boundaries**.
- Unless irrelevant to the proposal: adjoining buildings/roads/footpaths and
  access, public rights of way, position of trees (site + adjacent), extent
  and type of hard surfacing, boundary treatment (walls/fences) where
  proposed.
- Uttlesford requires a block plan for **all** householder applications
  except pure window replacements/shopfronts/adverts — i.e. a roof material
  change application may still be asked for one. A composite roof plan with
  the red-line boundary underlay at 1:200/1:500 can double as it if it shows
  the items above.

### 1.3 General drawing standard (national wording)

"Any plans or drawings must be drawn to an identified metric scale, and in
the case of plans, must show the direction of north."

---

## 2. Common local validation list requirements (drawing-by-drawing)

Local lists vary, but the items below recur across the checklists reviewed
(Uttlesford, Oxford, Thurrock, South Oxfordshire, Bristol, Mid Devon, New
Forest, East Suffolk). Treat them as the de-facto standard.

### 2.1 Conventions required on every drawing

- **A title and a unique drawing number, with revision suffix** where amended
  (e.g. `D1`, `D1a`; or `PL-101 Rev A`). Revisions must get a new number and
  the revision date/details shown on the drawing.
- **The paper size**, and the **scale stated at that print size** — e.g.
  "**1:100 at A3**" (Uttlesford's exact wording). This matters because
  councils measure PDFs electronically.
- **A recognised scale** (1:50, 1:100, 1:200, 1:500, 1:1250, 1:2500) — no
  odd fitted ratios.
- **A scale bar on every drawing** ("A SCALE BAR MUST BE INCLUDED ON ALL
  DRAWINGS" — Uttlesford, caps theirs). Oxford: showing at least two
  measurements, ideally 0–5 m minimum.
- **"Do not scale" disclaimers must not be used** — or only in the form "do
  not scale, except for planning purposes" (Uttlesford). Oxford rejects "Not
  to Scale"/"Do Not Scale" outright.
- **Clear "Existing" / "Proposed" labelling.** For householder applications
  existing and proposed may share a sheet; the clearest convention is
  existing and proposed side by side at the same scale.
- **North point on all plans** (location, block, roof/floor plans).
- **Annotations** so drawings are self-explanatory (e.g. label a line
  "boundary fence").
- **Existing and proposed ground levels** shown for any extension/new
  building (evident from elevations for flat sites; sections needed on
  sloping sites or roof-level accommodation).
- **Neighbouring properties and their windows** shown on plans, elevations
  and sections (existing and proposed) — Uttlesford requires this always.
- Electronic submission: PDFs with **one embedded page size only**, suitable
  for scanning/display, **no personal details** (signatures, phone numbers,
  emails) on documents.
- Oxford also asks for a separate **schedule of drawings** (drawing numbers +
  titles) with the application.

### 2.2 Elevations (existing and proposed)

- Scale **1:50 or 1:100** for householder work.
- **All elevations affected — including blank ones**: if an elevation has no
  external changes, it should still be shown and **annotated clearly to say
  so** ("no external changes proposed").
- State **the direction each elevation faces** — e.g. "Rear (South)".
- Show the **full elevation of the building** (whole host dwelling, not just
  the altered part) so the relationship of new to existing reads clearly.
- Show **relationship to neighbouring buildings** (outline elevations of
  close neighbours) and the property boundary.
- Show **position and size of all windows and doors**, existing and proposed.
- **Indicate existing and proposed materials** — colour and type described in
  detail (e.g. "natural blue slate", "concrete tile to match existing"), not
  just a swatch.
- Identify anything to be demolished.

### 2.3 Floor plans and roof plans (existing and proposed)

- Scale **1:50 or 1:100**.
- All floors including unchanged ones; room uses labelled; windows/doors/
  walls shown; demolition identified.
- **Roof plan**: show the shape of the roof and the **position of all ridges,
  dormers, rooflights, chimneys, raised parapets** and similar features.
  **Roofing material and its location are typically specified on the roof
  plan** (Oxford) — the key sheet for a material-change application.
- Show proposals in relation to site boundary and neighbouring buildings.

### 2.4 Sections / levels

Required when roof-level accommodation, altered buildings on sloping sites,
or ground-level changes are involved; 1:50 or 1:100; show existing site
levels and finished floor levels. For simple flat-site householder work,
levels evident from plans + elevations usually suffice.

### 2.5 Supporting items commonly triggered by roof works

- **Schedule of materials**: a "clear and concise schedule of proposed
  materials … relating to annotated elevations, including details of any
  materials to be replaced" (Uttlesford — required for all applications with
  external materials). Directly applicable to a like-for-like re-roof.
- **Biodiversity/bat check**: Uttlesford requires a biodiversity checklist
  for all householder applications and **"a preliminary roost assessment for
  bats will be required for ANY works to a roof"** (also any demolition).
  Many councils have an equivalent trigger — a re-roofing tool should warn
  users about this.
- **Heritage statement / Design & Access Statement**: needed when the
  property is listed or in a conservation area (a common reason a roof
  material change needs permission at all). See example 4 below — a real
  heritage assessment for re-roofing stone slate → natural blue slate in a
  conservation area.
- **CIL Form 1**: many councils ask for it on all applications for new
  buildings/extensions (not usually a pure material change).

---

## 3. What real submitted drawings look like

Notes taken from four real householder application documents published on
council planning registers via the aggregator `docs.planning.org.uk`. The PDFs
themselves are **not kept in this repo** — they are third-party architects'
copyrighted drawings carrying applicant names and addresses, and redistributing
them isn't ours to do. Source URLs are given so you can read the originals; the
observations below are what mattered for the design of the output.

### Example 1 — extension, whole set on one sheet
Two-storey side + single-storey rear extension (South Gloucestershire). One
large sheet carrying the **entire set**:
existing + proposed ground/first floor plans (1:100), **all four existing and
all four proposed elevations** (1:100, compass-named: NE/SE/SW/NW), existing +
proposed site plans (1:200, each with its own north arrow), and an OS map at
1:1250. Notable:
- An "**Aesthetic Notes**" panel — a written materials schedule split into
  *Existing Building* and *Proposed Extension* (walls, roof "pitched roof
  with concrete tile finish **to match**", eaves/soffits, gutters/RWPs,
  windows/doors, with colours).
- Written dimensions on plans (mm).
- Notes panel: dimensions to be checked on site, not scaled from drawing;
  compliance and copyright lines.
- Title block: application title, applicant name, address, **Date, Rev,
  "Scale: As Shown", drawing number**.
- Source: <https://docs.planning.org.uk/20251009/15/T3T74COKJP000/s1ai41w1ikjc12kp.pdf>

### Example 2 — additional-storey extension, practice sheet
Additional-storey extension (Hampshire), drawn by a professional practice.
Notable:
- **Graphic scale bar** drawn 0–5 m and labelled "Scale Bar 1:100" next to
  each drawing title ("Proposed Rear Elevation - 1:100").
- **Leader-line material annotations on the elevations themselves**: "tiles
  to match existing", "grp chimney faced externally with matching brick
  slips", "new brickwork to replace rendered section", "brick detailing over
  openings".
- **Dashed "outline of existing roof"** overlaid on the proposed elevation so
  the change reads instantly — a strong convention for roof alterations.
- A block of standard practice notes (copyright, boundaries assumed, party
  wall, "contractor responsible for checking all scaled and stated
  dimensions").
- Full title block: **Project Title / Drawing Title ("Proposed Plans
  (Planning)") / Client / Date / "Scale: 1:100 at A1" / Drawing No. +
  Revision** / practice name and contact details.
- Source: <https://docs.planning.org.uk/20251013/62/T427LTBPN0500/0joze7get59rxaco.pdf>

### Example 3 — existing + proposed roof plans
Existing + proposed **roof plan sheet** for a loft/extension scheme,
CAD-produced. Notable:
- Existing and proposed roof plans **side by side on one sheet at the same
  scale**.
- **North sign / key plan** box; a **legend** (demolition / structural steel /
  new walls / existing walls hatching); graphic 0–100 mm scale check bar.
- Notes block: this drawing is copyright; do not scale dimensions; read in
  conjunction with all other relevant drawings; report discrepancies.
- Title block fields: **Client / Project / Drawing Title ("EXISTING AND
  PROPOSED ROOF PLAN") / Job Number (5034) / Drawing Originated Date /
  "Scale@A1 1:50" / Purpose: "PLANNING" / Drawing Number `PL(20)003` /
  Revision** — note the explicit *Purpose* field distinguishing planning
  issue from construction issue.
- Source: <https://docs.planning.org.uk/20210823/127/QXAY27PJHTB00/7jl54f09v1n6fwhq.pdf>

### Example 4 — re-roof heritage statement
Not a drawing — a real **heritage assessment** supporting a householder
application (Calderdale) whose works include re-roofing a property in natural
blue slate in lieu of existing stone slate, in a conservation area — i.e. this
tool's exact use case where it meets heritage controls. Shows the structure
such a statement takes (nature/extent/significance of the asset, proposed
works, impact).
- Source: <https://docs.planning.org.uk/20220502/73/R9T7NKDWGR800/q644i7jt0xd5j58c.pdf>

---

## 4. Gap analysis — Auto Plan's generated set vs the above

What the current output (per `src/pdf/DrawingKit.tsx` / `PdfBundle.tsx`:
title, address, scale bar, north arrow, border; scales snap to 1:100/1:200
via `fitDrawingScale`) would need to close, roughly in order of validation
risk / professional-appearance impact:

1. **Complete the title block.** Add: unique **drawing number per page +
   revision** (e.g. `AP-01 Rev -` … regenerate = new revision), **date**,
   **paper size and scale-at-size statement** ("1:100 at A4 landscape" — not
   just "Scale 1:100"), applicant/client, project address (present), drawing
   title (present), and a **"PLANNING" purpose** tag. Also emit a **drawing
   schedule** (list of drawing numbers + titles) — some councils (Oxford)
   ask for one, and it makes the pack look professional. Never print "do not
   scale" (or only as "do not scale, except for planning purposes").
2. **Openings on elevations** (already roadmap item 1). Local lists
   explicitly require "position and size of all windows and doors (existing
   and proposed)" — blank walls are the single most obvious tell that the
   set is auto-generated, and can make an application invalid. Chimneys and
   rooflights on the roof plan matter for the same reason ("position of all
   ridges, dormer windows, roof lights … chimneys").
3. **Materials annotation, in words, on the drawings.** A colour tint is not
   enough: elevations should carry leader-line/legend text ("existing: Kent
   peg clay tiles" / "proposed: natural grey slate"), the roof plan is the
   conventional place to specify roofing material and its extent, and a
   short **schedule of materials** panel (existing vs proposed, including
   what is being replaced — see example 1's "Aesthetic Notes") satisfies the
   common local-list "schedule of materials" item. For a material change,
   consider the example-2 convention of dashed "outline of existing" where
   geometry changes.
4. **Neighbouring context.** Elevations should show outline of adjoining/
   nearby buildings and the boundary; plans should show neighbouring
   buildings and their windows; the location plan must make the site
   findable (**at least two named roads** where possible — OS basemap
   usually provides this, but the capture extent should be checked for it).
   Blank-elevation pages must be annotated "no external changes proposed"
   rather than omitted.
5. **OS copyright / licence line on the location plan** ("© Crown copyright
   and database rights [year] Ordnance Survey [licence no.]"), and support
   for a **blue line** (other land owned by the applicant) alongside the red
   line. Red line must be drawable to include access land, not just the
   curtilage.
6. **Elevation direction naming**: label as e.g. "Rear (South) Elevation" —
   compass letter alone is fine, but pairing it with front/side/rear reads
   better to neighbours and officers (examples use compass or named forms).
7. **Site/block plan page**: many local lists want a 1:200/1:500 block plan
   with dimensions **to boundaries**, adjoining roads/footpaths, hard
   surfacing and boundary treatment. Auto Plan's composite roof plan over
   the traced boundary is close — adding written boundary-offset dimensions
   and adjoining-context would let it double as the block plan.
8. **Levels/sections**: out of scope for flat sites (levels "evident from
   floor plans and elevations"), but sloping-site cases will be asked for
   sections — worth a user-facing caveat.
9. **Workflow warnings, not drawings**: re-roofing commonly triggers a
   **bat/biodiversity checklist** ("preliminary roost assessment … for ANY
   works to a roof" — Uttlesford) and, in conservation areas, a **heritage
   statement** (example 4). Auto Plan should surface these so users aren't
   invalidated for a missing document the tool never claimed to produce.
10. **PDF hygiene**: keep one page size across the bundle (already A4
    landscape throughout), and avoid embedding personal details beyond
    what's needed.

---

## 5. Sources

National guidance:
- Planning Portal, *Maps, plans and planning applications: What to submit* —
  <https://ecab.planningportal.co.uk/uploads/1app/maps_plans_and_planning_apps.pdf>
  (location plan / site plan criteria, OS licensing rules; based on the
  Government's PPG "Making an application":
  <https://www.gov.uk/guidance/making-an-application>)

Local validation checklists / drawing standards reviewed:
- Uttlesford District Council, *Local Validation Checklist for Householder
  Applications* (current version March 2026) —
  <https://www.uttlesford.gov.uk/media/11352/001-Householder-Validation-Checklist/pdf/001_Householder_Validation_Checklist.pdf>
- Oxford City Council, *Drawing Standards — planning application guidance*
  (Aug 2021) —
  <https://www.oxford.gov.uk/downloads/file/1093/planning-application-drawing-standards>
- Also located (same recurring items): South Oxfordshire
  (<https://www.southoxon.gov.uk/wp-content/uploads/sites/2/2020/10/Householder-Application-Validation-Checklist_2-1.pdf>),
  Thurrock (<https://www.thurrock.gov.uk/householder-planning-applications/plans-and-drawings-%E2%80%93-elevations-and-sections>),
  Bristol (<https://www.bristol.gov.uk/files/documents/9-plans-and-drawings-checklist-for-planning-applications/file>),
  Mid Devon (<https://www.middevon.gov.uk/media/179452/submitting-plans-and-drawings-guidance.pdf>),
  New Forest (<https://www.newforest.gov.uk/article/1773/Plan-and-drawing-standards>),
  East Suffolk (<https://www.eastsuffolk.gov.uk/assets/Planning/Planning-Applications/Local-Validation-List/Chapter-01-Householder-Applications.pdf>).

Example documents (source URLs in §3 above; the PDFs are not redistributed here).
