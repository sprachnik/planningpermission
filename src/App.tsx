import { useEffect, useState } from "react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { repository } from "./data/localStorageRepository";
import type { PlanningCase, Wing } from "./data/types";
import { LocationPlanStep } from "./components/LocationPlanStep";
import { RoofComposerStep } from "./components/composer/RoofComposerStep";
import { PdfBundle } from "./pdf/PdfBundle";

/** Migrates pre-composer cases (single `roof`) to the wings model. */
function normaliseCase(c: PlanningCase): PlanningCase {
  if (c.wings) return c;
  const wings: Wing[] = c.roof ? [{ ...c.roof, id: crypto.randomUUID(), name: "Main house", x: 0, y: 0 }] : [];
  return { ...c, wings };
}

function newCase(): PlanningCase {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    address: "",
    createdAt: now,
    updatedAt: now,
    boundary: [],
    wings: [{ id: crypto.randomUUID(), name: "Main house", x: 0, y: 0, widthM: 8, depthM: 6, roofType: "gable", pitchDegrees: 40, eaveHeightM: 5 }],
    materials: { existing: "Kent peg tile", proposed: "Grey slate" },
  };
}

type Step = "list" | "details" | "location" | "roof" | "download";

export default function App() {
  const [cases, setCases] = useState<PlanningCase[]>([]);
  const [active, setActive] = useState<PlanningCase | null>(null);
  const [step, setStep] = useState<Step>("list");

  useEffect(() => {
    repository.listCases().then(setCases);
  }, []);

  async function refreshList() {
    setCases(await repository.listCases());
  }

  async function persist(updated: PlanningCase) {
    const withTimestamp = { ...updated, updatedAt: new Date().toISOString() };
    setActive(withTimestamp);
    await repository.saveCase(withTimestamp);
    await refreshList();
  }

  function openCase(c: PlanningCase) {
    setActive(normaliseCase(c));
    setStep("details");
  }

  async function removeCase(id: string) {
    await repository.deleteCase(id);
    await refreshList();
    if (active?.id === id) {
      setActive(null);
      setStep("list");
    }
  }

  if (step === "list" || !active) {
    return (
      <main className="container">
        <hgroup style={{ marginTop: "2rem" }}>
          <h1>roofplan</h1>
          <p>Generate Location Plan, Roof Plan, and Elevation drawings for a UK planning application.</p>
        </hgroup>
        <button onClick={() => openCase(newCase())}>+ New case</button>
        {cases.length > 0 && (
          <section style={{ marginTop: "1.5rem" }}>
            {cases.map((c) => (
              <article key={c.id} className="case-row">
                <div>
                  <strong>{c.address || "(no address yet)"}</strong>
                  <br />
                  <small className="muted">updated {new Date(c.updatedAt).toLocaleString()}</small>
                </div>
                <div className="actions">
                  <button onClick={() => openCase(c)}>Open</button>
                  <button className="secondary outline" onClick={() => removeCase(c.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
    );
  }

  const steps: { key: Step; label: string }[] = [
    { key: "details", label: "1. Details" },
    { key: "location", label: "2. Location Plan" },
    { key: "roof", label: "3. Roof & Elevations" },
    { key: "download", label: "4. Download" },
  ];

  return (
    <main className="container">
      <nav style={{ marginTop: "1rem" }}>
        <ul>
          <li>
            <a href="#" onClick={(e) => { e.preventDefault(); setStep("list"); }}>
              ← All cases
            </a>
          </li>
        </ul>
      </nav>
      <hgroup>
        <h2>{active.address || "New case"}</h2>
        <p>Planning drawing set</p>
      </hgroup>
      <nav className="steps">
        {steps.map((s) => (
          <button key={s.key} className={step === s.key ? undefined : "secondary outline"} onClick={() => setStep(s.key)}>
            {s.label}
          </button>
        ))}
      </nav>

      {step === "details" && (
        <article>
          <label>
            Address
            <input
              value={active.address}
              onChange={(e) => persist({ ...active, address: e.target.value })}
              placeholder="123 Example Road, Ramsgate, CT11 1AA"
            />
          </label>
        </article>
      )}

      {step === "location" && (
        <LocationPlanStep
          address={active.address}
          boundary={active.boundary}
          mapCentre={active.mapCentre}
          locationPlanImage={active.locationPlanImage}
          locationPlanScale={active.locationPlanScale}
          onChange={(updates) => persist({ ...active, ...updates })}
        />
      )}

      {step === "roof" && (
        <RoofComposerStep
          wings={active.wings ?? []}
          materials={active.materials}
          boundary={active.boundary}
          onChange={(updates) => persist({ ...active, ...updates })}
        />
      )}

      {step === "download" && (
        <article>
          {active.boundary.length < 3 && <p>Draw a boundary on the Location Plan step first.</p>}
          {(active.wings?.length ?? 0) === 0 && <p>Add at least one block on the Roof &amp; Elevations step first.</p>}
          {(active.boundary.length >= 3 || (active.wings?.length ?? 0) > 0) && (
            <PDFDownloadLink document={<PdfBundle planningCase={active} />} fileName={`${active.address || "roofplan"}-drawings.pdf`}>
              {({ loading }) => <button aria-busy={loading}>{loading ? "Preparing PDF…" : "Download drawing bundle (PDF)"}</button>}
            </PDFDownloadLink>
          )}
          <small className="muted">
            One PDF with a page per drawing (Location Plan, Existing/Proposed Roof Plan, Existing/Proposed Elevations). Split into separate files before
            uploading if your planning portal requires one document per drawing.
          </small>
        </article>
      )}
    </main>
  );
}
