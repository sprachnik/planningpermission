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
        Everything a valid householder submission needs, in the order you'll do it. Ten minutes of reading that saves a
        four-week validation bounce.
      </p>

      <section className="guide-step">
        <h3>
          <span className="step-num">1</span> Check you actually need permission
        </h3>
        <p>
          A like-for-like re-roof usually needs <strong>no permission at all</strong> — it's a repair. Permission is
          normally triggered when the material or its appearance changes <em>and</em> your permitted development rights
          are restricted: a <strong>conservation area</strong>, an <strong>Article 4 direction</strong>, or planning
          conditions on the house. Check your council's website (search "<em>your council</em> conservation area map") or
          call their duty planner — it's free.
        </p>
        <div className="guide-warn">
          <strong>Listed buildings are different.</strong> Any roof change to a listed building needs Listed Building
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
          <span className="step-num">4</span> Model the house honestly
        </h3>
        <p>
          Trace the footprint as blocks over the boundary underlay, then set <strong>pitch and eaves</strong> — "Prefill
          from OS data" reads real building heights where OS has confident data. Most UK homes are 2–3 blocks: main house
          plus a rear wing or garage. Drawings must <em>fairly represent</em> the real house; a wrong roof shape is
          grounds for refusal or invalidation, a slightly-off dimension isn't.
        </p>
        <p>
          For a pure material change, <strong>don't touch the Proposed geometry</strong> — the whole point is that
          existing and proposed are identical except the roof covering.
        </p>
      </section>

      <section className="guide-step">
        <h3>
          <span className="step-num">5</span> Name the materials properly
        </h3>
        <p>
          Councils validate materials <strong>in words</strong>, not colours. Write the real specification: "Kent peg
          clay tile" → "Natural blue-grey Welsh slate", not "brown" → "grey". In a conservation area the material choice
          is usually the entire case — natural slate is treated very differently from fibre-cement lookalikes, so say
          exactly what product you mean. The swatch colour only tints the drawings.
        </p>
      </section>

      <section className="guide-step">
        <h3>
          <span className="step-num">6</span> Download and sense-check the set
        </h3>
        <p>
          The bundle gives you the location plan, existing/proposed roof plans, and all four elevations both ways — every
          page scaled and scale-barred. Before submitting, check the set against your council's{" "}
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
          <strong>Building Regulations are separate from planning</strong>: re-covering more than a quarter of a roof
          usually needs building regs sign-off too (thermal upgrade rules), via council building control or an approved
          inspector — your roofer will know. Two more things that catch roof applications out:
        </p>
        <ul>
          <li>
            <strong>Bats.</strong> Some councils require a preliminary bat roost assessment for <em>any</em> works to a
            roof — older roofs especially. Check the validation list before paying the fee; a bat survey has a season
            (roughly May–September).
          </li>
          <li>
            <strong>Heritage statement.</strong> In a conservation area, expect to submit a short statement explaining
            why the new material preserves or enhances the area's character. One page is often enough: what's there, why
            it's failing, why the replacement is appropriate.
          </li>
        </ul>
      </section>

      <div className="guide-warn">
        <strong>Current limits of the generated set.</strong> Elevations don't yet show windows, doors or chimneys, and
        title blocks don't carry drawing numbers/revisions. Straightforward applications are routinely validated without
        perfection, but conservation officers are the pickiest audience — for a sensitive site, treat the output as a
        strong draft and check your council's list before relying on it.
      </div>

      <div className="step-footer">
        <button onClick={onBack}>Got it — back to my case</button>
      </div>
    </div>
  );
}
