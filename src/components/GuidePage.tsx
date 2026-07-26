/** Step-by-step guidance distilled from docs/planning-requirements.md,
 *  docs/value-research.md and the national validation requirements —
 *  the nuance the wizard's one-liners can't carry. Content only; no state. */
export function GuidePage({ onBack }: { onBack: () => void }) {
  return (
    <div className="guide">
      <div className="wizard-head">
        <h2>How to prepare your application</h2>
        <a
          href="#"
          className="back"
          onClick={(e) => {
            e.preventDefault();
            onBack();
          }}
        >
          ← Back
        </a>
      </div>
      <p className="guide-lead">
        Everything a valid householder submission needs — extension, loft conversion, outbuilding, re-roof or any other
        external alteration — in the order you'll do it. Ten minutes of reading that saves a four-week validation bounce.
      </p>

      <section className="guide-step">
        <h3>
          <span className="step-num">1</span> Check you actually need permission
        </h3>
        <p>
          Most householder work falls under <strong>permitted development</strong> (PD) — you can just build it. You need
          a planning application when the work exceeds those limits, <em>or</em> when your PD rights are restricted: a{" "}
          <strong>conservation area</strong>, an <strong>Article 4 direction</strong>, a new-build estate with planning
          conditions attached, or a flat/maisonette (which has no PD rights at all). The rough England limits:
        </p>
        <ul>
          <li>
            <strong>Re-roofing.</strong> A like-for-like re-covering is a repair and needs nothing. It's the{" "}
            <em>change of material or appearance</em> in a restricted area that triggers an application.
          </li>
          <li>
            <strong>Extensions.</strong> Single-storey rear: up to 4 m deep detached, 3 m semi/terraced (double that
            under the prior-approval Larger Home Extension scheme), 4 m max height. Side extensions must be single
            storey, max 4 m high and no wider than half the original house — and aren't PD in a conservation area.
            Nothing forward of the principal elevation.
          </li>
          <li>
            <strong>Loft conversions and dormers.</strong> A volume allowance of 40 m³ for terraced houses, 50 m³ for
            semi-detached and detached. No dormer on the roof slope facing a highway, nothing above the existing ridge,
            and dormers set back at least 20 cm from the eaves.
          </li>
          <li>
            <strong>Outbuildings and garages.</strong> Single storey, eaves no higher than 2.5 m, overall 4 m
            dual-pitched or 3 m otherwise — dropping to 2.5 m total within 2 m of a boundary. Buildings must not cover
            more than half the land around the original house, and can't go forward of the principal elevation.
          </li>
        </ul>
        <p>
          These are summaries of the England rules and they have real exceptions — Scotland, Wales and Northern Ireland
          differ. Check your council's website (search "<em>your council</em> conservation area map") or ring their duty
          planner; it's free. If you're close to a limit, a <strong>Lawful Development Certificate</strong> is worth more
          than a guess.
        </p>
        <div className="guide-warn">
          <strong>Listed buildings are different.</strong> Any external change to a listed building needs Listed Building
          Consent with heritage-grade drawings — beyond what this tool produces. Get a conservation specialist.
        </div>
      </section>

      <section className="guide-step">
        <h3>
          <span className="step-num">2</span> Draw the red line — around the plot, not the house
        </h3>
        <p>
          The red line is the <strong>application site boundary</strong>: your whole curtilage — house, garden, drive and
          outbuildings — following the fences, hedges and walls the OS map already shows. Include any land needed to
          access the works (e.g. a shared drive you'll scaffold from). Don't include a neighbour's land.
        </p>
        <p>
          <strong>Accuracy:</strong> at 1:1250, one millimetre on paper is 1.25 metres on the ground — a metre of wobble
          is invisible. Officers check the line is <em>unambiguous</em>, not survey-grade. Unsure where your legal
          boundary runs? Your HM Land Registry title plan is £7 from gov.uk, or look up a neighbour's application on the
          council planning register and copy where their red line ran.
        </p>
      </section>

      <section className="guide-step">
        <h3>
          <span className="step-num">3</span> Capture the location plan
        </h3>
        <p>
          <strong>1:1250 for a normal urban/suburban plot; 1:2500 for large or rural plots.</strong> The plan must show
          enough named roads and surrounding buildings for an officer to find the site — if your capture is all garden
          and one anonymous close, zoom to include the road junction. North must be identifiable (the drawing set adds
          the north arrow and scale bar for you) and the base must be up-to-date Ordnance Survey mapping — which is what
          you're capturing.
        </p>
      </section>

      <section className="guide-step">
        <h3>
          <span className="step-num">4</span> Model the building honestly
        </h3>
        <p>
          Trace the footprint as blocks over the boundary underlay, then set <strong>pitch and eaves</strong> — "Prefill
          from OS data" reads real building heights where OS has confident data. Most UK homes are 2–3 blocks: main house
          plus a rear wing or garage. Add the windows and doors on each wall: officers compare elevations against street
          view. Drawings must <em>fairly represent</em> the real building; a wrong roof shape or a missing window is
          grounds for refusal or invalidation, a slightly-off dimension isn't.
        </p>
        <p>
          Then switch to <strong>Proposed</strong> and make only the changes you're applying for. Adding an extension or
          outbuilding means adding a block; a dormer or a raised ridge means editing one. If nothing about the building's
          shape changes — a re-covering, new windows in the same openings, render or cladding — leave the proposed model
          identical and the drawings will say so.
        </p>
      </section>

      <section className="guide-step">
        <h3>
          <span className="step-num">5</span> Name the materials properly
        </h3>
        <p>
          Councils validate materials <strong>in words</strong>, not colours. Write the real specification for every
          element the schedule asks about — roof covering, walls, windows and doors, rainwater goods: "Kent peg clay
          tile" → "Natural blue-grey Welsh slate", not "brown" → "grey". For an extension, "brick and tile to match the
          existing house" is a perfectly good answer, and a common condition anyway. In a conservation area the material
          choice is often the entire case — natural slate is treated very differently from fibre-cement lookalikes, so
          say exactly what product you mean. The swatch colour only tints the drawings.
        </p>
      </section>

      <section className="guide-step">
        <h3>
          <span className="step-num">6</span> Download and sense-check the set
        </h3>
        <p>
          The bundle gives you the location plan, a block plan with boundary clearances, existing/proposed roof plans,
          outline floor plans, all four elevations both ways, a schedule of materials and a short planning statement —
          every drawing scaled and scale-barred. Before submitting, check the set against your council's{" "}
          <strong>local validation checklist</strong> (on their website). Common extras they ask for: materials described
          on the drawings, unchanged elevations annotated "no external changes proposed", and one document per drawing —
          split the PDF if your portal requires it.
        </p>
      </section>

      <section className="guide-step">
        <h3>
          <span className="step-num">7</span> Submit — and the two surprise requirements
        </h3>
        <p>
          The decision is always made by your <strong>local planning authority</strong> (your council's planning
          department). You can hand your application to them two ways: through the{" "}
          <a href="https://www.planningportal.co.uk" target="_blank" rel="noreferrer">Planning Portal</a> — the national
          online service for England and Wales, which forwards everything to your council — or directly to the council
          itself (most accept email or their own forms; some prefer it). Either way it's a{" "}
          <strong>householder application</strong>; check the current fee when you apply. Note that{" "}
          <strong>Building Regulations are separate from planning</strong> and almost always apply as well: any
          extension, loft conversion or structural opening needs sign-off, as does re-covering more than a quarter of a
          roof (thermal upgrade rules). That goes through council building control or an approved inspector, and getting
          planning permission tells you nothing about whether the build passes. Three more things that catch householder
          applications out:
        </p>
        <ul>
          <li>
            <strong>Bats.</strong> Some councils require a preliminary bat roost assessment for <em>any</em> roof works —
            older roofs and loft conversions especially. Check the validation list before paying the fee; a bat survey
            has a season (roughly May–September).
          </li>
          <li>
            <strong>Party Wall Act.</strong> Separate again from both of the above. Building on or near a shared boundary
            — most side extensions, many loft conversions — means serving notice on your neighbours two months before
            work starts. It doesn't affect the application, but it does affect your dates.
          </li>
          <li>
            <strong>Heritage statement.</strong> In a conservation area, expect to submit a short statement explaining
            why the proposal preserves or enhances the area's character. One page is often enough: what's there now, what
            changes, and why the design and materials are appropriate.
          </li>
        </ul>
      </section>

      <div className="guide-warn">
        <strong>Current limits of the generated set.</strong> Buildings are modelled as rectangular blocks at
        quarter-turn angles, so an angled wing or a curved bay can't be drawn faithfully. There's no true valley line
        where two blocks meet, rooflights can't sit on hip slopes, and floor plans are outline-level — footprints and
        room labels, not internal walls, which most councils accept for external-works applications but not all.
        Straightforward applications are routinely validated without perfection, but conservation officers are the
        pickiest audience — for a sensitive site, treat the output as a strong draft and check your council's list before
        relying on it.
      </div>

      <div className="step-footer">
        <button onClick={onBack}>Got it — back to my case</button>
      </div>
    </div>
  );
}
