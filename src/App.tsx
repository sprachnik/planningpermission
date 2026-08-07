import { useEffect, useRef, useState, type ReactNode } from "react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { repository } from "./data/localStorageRepository";
import type { CaseType, PlanningCase, Wing } from "./data/types";
import { CASE_TYPES, caseTypeLabel, describeProposal } from "./data/proposal";
import { LocationPlanStep } from "./components/LocationPlanStep";
import { RoofComposerStep } from "./components/composer/RoofComposerStep";
import { GuidePage } from "./components/GuidePage";
import { AuthPage } from "./components/AuthPage";
import { PdfBundle } from "./pdf/PdfBundle";
import { hasApiKey, hasPremiumTiles } from "./os/client";
import { getUser, signOut, type StubUser } from "./auth";
import { roofColorFor, colorForMaterial, variantRoofColor } from "./components/svgDraw";

const FREE_PLAN_DETAIL =
  "OS Data Hub free plan detected. Detailed close-up mapping is Premium Data, so the map draws the most detailed free data magnified — " +
  "boundary drawing and capture work fine, but building outlines are generalised. For full 1:1250 detail, upgrade the project to the " +
  "Premium plan in the OS Data Hub dashboard (the first £1,000/month of usage is free).";

/** Migrates pre-composer cases (single `roof`) to the wings model, and
 *  materialises per-block coverings: every block owns its material outright
 *  (the case-level `materials` only seed new blocks and label the schedule),
 *  so editing one block never changes another. */
function normaliseCase(c: PlanningCase): PlanningCase {
  const base: PlanningCase = c.wings
    ? c
    : { ...c, wings: c.roof ? [{ ...c.roof, id: crypto.randomUUID(), name: "Main house", x: 0, y: 0 }] : [] };
  // The seeded swatch follows the seeded *label* where we recognise it —
  // stamping the variant default instead once baked a grey slate colour onto
  // blocks labelled "Kent peg tile", so the drawings disagreed with the
  // schedule and a re-covering showed no visible change between the sets.
  const seed = (w: Wing, label: string, color: string): Wing =>
    w.material?.trim()
      ? w
      : { ...w, material: label.trim() || undefined, materialColor: w.materialColor ?? colorForMaterial(label) ?? color };
  return {
    ...base,
    wings: (base.wings ?? []).map((w) => seed(w, base.materials.existing, roofColorFor(base.materials, false))),
    proposedWings: base.proposedWings?.map((w) =>
      w.materialUnchanged ? w : seed(w, base.materials.proposed, roofColorFor(base.materials, true)),
    ),
  };
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
    // Proposed seeded identical to existing: the tool must not assume the
    // covering is changing — that's only true for re-roof cases.
    materials: { existing: "Concrete interlocking tile", proposed: "Concrete interlocking tile" },
  };
}

type Step = "list" | "location" | "model" | "download";

function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#101418" />
      <path d="M14 40 L32 20 L50 40" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 44 H42" fill="none" stroke="#0a84ff" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

interface ShellProps {
  onHome: () => void;
  onGuide: () => void;
  freePlan: boolean;
  user: StubUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
  children: ReactNode;
}

/** Top-right account dropdown: avatar → My cases / Guidance / Sign out. */
function AccountMenu({ user, onHome, onGuide, onSignOut }: { user: StubUser; onHome: () => void; onGuide: () => void; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = (label: string, action: () => void) => (
    <a
      href="#"
      className="menu-item"
      onClick={(e) => {
        e.preventDefault();
        setOpen(false);
        action();
      }}
    >
      {label}
    </a>
  );

  return (
    <div className="account-menu" ref={ref}>
      <button className="account-trigger" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="avatar">{user.email[0].toUpperCase()}</span>
        <span className="chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          <div className="menu-email">{user.email}</div>
          {item("My cases", onHome)}
          {item("Guidance", onGuide)}
          <div className="menu-divider" />
          {item("Sign out", onSignOut)}
        </div>
      )}
    </div>
  );
}

function Shell({ onHome, onGuide, freePlan, user, onSignIn, onSignOut, children }: ShellProps) {
  return (
    <div className="shell">
      <header className="site-header">
        <div className="inner">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onHome();
            }}
          >
            <BrandMark />
            Auto-Planning UK
          </a>
          <nav className="header-nav">
            <a
              className="header-link"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onGuide();
              }}
            >
              Guidance
            </a>
            {user ? (
              <AccountMenu user={user} onHome={onHome} onGuide={onGuide} onSignOut={onSignOut} />
            ) : (
              <a
                className="header-cta"
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  onSignIn();
                }}
              >
                Sign in
              </a>
            )}
          </nav>
        </div>
      </header>
      <main className="container page">{children}</main>
      <footer className="site-footer">
        <div className="inner">
          <span>
            <strong>Auto-Planning UK</strong> — drawings for UK householder planning applications.
            {freePlan && (
              <span className="pill-warn" title={FREE_PLAN_DETAIL}>
                Free OS plan — generalised mapping
              </span>
            )}
          </span>
          <span>
            Built by{" "}
            <a href="https://www.linkedin.com/in/jamesmoores/" target="_blank" rel="noreferrer">
              James Moores
            </a>{" "}
            · Private tool, not open source · © 2026
          </span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  const [cases, setCases] = useState<PlanningCase[]>([]);
  const [active, setActive] = useState<PlanningCase | null>(null);
  const [step, setStep] = useState<Step>("list");
  const [freePlan, setFreePlan] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<PlanningCase | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [user, setUser] = useState<StubUser | null>(() => getUser());
  /** Draft for the "Edit details" modal; null = closed */
  const [draft, setDraft] = useState<{
    caseType: CaseType | "";
    name: string;
    address: string;
    applicant: string;
    agent: string;
    joinery: string;
    rainwater: string;
  } | null>(null);
  /** True while the details modal is collecting a brand-new case's basics */
  const [draftIsNew, setDraftIsNew] = useState(false);

  const draftFor = (c: PlanningCase) => ({
    caseType: c.caseType ?? ("" as const),
    name: c.name ?? "",
    address: c.address,
    applicant: c.applicant ?? "",
    agent: c.agent ?? "",
    joinery: c.joineryMaterial ?? "",
    rainwater: c.rainwaterMaterial ?? "",
  });

  useEffect(() => {
    repository.listCases().then(setCases);
    // Same cached probe LocationPlanStep's style selection uses — no extra tile spend.
    if (hasApiKey()) hasPremiumTiles().then((premium) => setFreePlan(!premium));
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

  function openCase(c: PlanningCase, isNew = false) {
    // Planning pages are gated behind the (stubbed) account.
    if (!user) {
      setShowAuth(true);
      return;
    }
    setActive(normaliseCase(c));
    setStep("location");
    // A new case asks what it's for up front: the project type shapes the
    // generated statement and schedule, so it's worth one question.
    if (isNew) {
      setDraft(draftFor(c));
      setDraftIsNew(true);
    }
  }

  async function removeCase(id: string) {
    await repository.deleteCase(id);
    await refreshList();
    setConfirmDelete(null);
    if (active?.id === id) {
      setActive(null);
      setStep("list");
    }
  }

  const deleteModal = confirmDelete && (
    <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Confirm deletion" onClick={(e) => e.stopPropagation()}>
        <h3>Delete this case?</h3>
        <p>
          <strong>{confirmDelete.name || confirmDelete.address || "(no postcode yet)"}</strong> and its boundary, captured map and building model will be
          permanently removed.
        </p>
        <div className="modal-actions">
          <button className="secondary outline" onClick={() => setConfirmDelete(null)} autoFocus>
            Cancel
          </button>
          <button className="danger" onClick={() => removeCase(confirmDelete.id)}>
            Delete case
          </button>
        </div>
      </div>
    </div>
  );

  const goHome = () => {
    setShowGuide(false);
    setShowAuth(false);
    setStep("list");
  };
  const openGuide = () => {
    setShowAuth(false);
    setShowGuide(true);
  };
  const caseLabel = (c: PlanningCase) => c.name || c.address || "(no postcode yet)";

  const shellProps = {
    onHome: goHome,
    onGuide: openGuide,
    freePlan,
    user,
    onSignIn: () => setShowAuth(true),
    onSignOut: () => {
      signOut();
      setUser(null);
      goHome();
    },
  };

  if (showAuth && !user) {
    return (
      <Shell {...shellProps}>
        <AuthPage
          onSignedIn={(u) => {
            setUser(u);
            setShowAuth(false);
          }}
        />
      </Shell>
    );
  }

  if (showGuide) {
    return (
      <Shell {...shellProps}>
        <GuidePage onBack={() => setShowGuide(false)} />
      </Shell>
    );
  }

  if (step === "list" || !active) {
    return (
      <Shell {...shellProps}>
        <div className="hero">
          <h1>The drawing set, without the drawing.</h1>
          <p>
            Location plan, block plan, roof plans and all four elevations — existing and proposed — at true
            scale, bundled as one Planning Portal-ready PDF. For extensions, loft conversions, outbuildings, re-roofs and
            other external alterations.
          </p>
          <button
            className="pill"
            onClick={() => openCase(newCase(), true)}
            data-tooltip={user ? "Saved in this browser — come back to it any time" : "Sign in to start — free while in preview"}
            data-placement="bottom"
          >
            Start a new case
          </button>
        </div>

        {user && cases.length > 0 ? (
          <section>
            <p className="section-label">Your cases</p>
            {cases.map((c) => (
              <article key={c.id} className="case-row">
                <div>
                  <strong>{caseLabel(c)}</strong>
                  <br />
                  <small className="muted">
                    {caseTypeLabel(c.caseType) ? <>{caseTypeLabel(c.caseType)} · </> : null}
                    {c.name && c.address ? <>{c.address} · </> : null}updated {new Date(c.updatedAt).toLocaleString()}
                  </small>
                </div>
                <div className="actions">
                  <button onClick={() => openCase(c)}>Open</button>
                  <button className="secondary outline" onClick={() => setConfirmDelete(c)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section>
            <p className="section-label">How it works</p>
            <div className="how-it-works">
              <div className="step-card">
                <span className="step-num">1</span>
                <h3>Find the property</h3>
                <p>Search the postcode, draw the red-line boundary on Ordnance Survey mapping, and capture the location plan at 1:1250 or 1:2500.</p>
              </div>
              <div className="step-card">
                <span className="step-num">2</span>
                <h3>Model the building</h3>
                <p>
                  Place simple blocks over the site boundary, add windows, doors and rooflights, then set pitch and
                  eaves. Plans and elevations draw themselves.
                </p>
              </div>
              <div className="step-card">
                <span className="step-num">3</span>
                <h3>Download the set</h3>
                <p>
                  One PDF: location and block plans, existing and proposed roof plans, four elevations each
                  way, a schedule of materials and a planning statement — every drawing with an accurate scale bar.
                </p>
              </div>
            </div>
          </section>
        )}
        {deleteModal}
      </Shell>
    );
  }

  const steps: { key: Step; label: string }[] = [
    { key: "location", label: "1 · Location Plan" },
    { key: "model", label: "2 · Building & Elevations" },
    { key: "download", label: "3 · Download" },
  ];

  const hasBoundary = active.boundary.length >= 3;
  const hasCapture = !!active.locationPlanImage;
  const hasBlocks = (active.wings?.length ?? 0) > 0;
  // The stated project type isn't borne out by the model — the PDF words itself
  // from the diff instead, so flag it here rather than letting the mismatch pass
  // silently into a submitted application.
  const typeMismatch = hasBlocks && describeProposal(active).typeMismatch;
  // A re-covering whose two variants draw the same colour produces existing and
  // proposed sheets that look identical — on an application whose whole subject
  // is the change of material, the drawings would show no change at all.
  const coveringChanges = hasBlocks && describeProposal(active).coveringChanges;
  const swatchesMatch =
    coveringChanges &&
    variantRoofColor(active.materials, false, true) === variantRoofColor(active.materials, true, true);
  // Blank elevations get queried — but not on a pure re-covering, where the
  // roof is the subject and the walls are explicitly unaltered. Nagging there
  // would be asking for work the application doesn't need.
  const pureRecovering = active.caseType === "re-roof" && !describeProposal(active).geometryChanged;
  const noOpenings =
    hasBlocks &&
    !pureRecovering &&
    ![...(active.wings ?? []), ...(active.proposedWings ?? [])].some((w) => (w.openings?.length ?? 0) > 0);

  return (
    <Shell {...shellProps}>
      <div className="wizard-head">
        <h2>
          {active.name || active.address || "New case"}
          {caseTypeLabel(active.caseType) && <span className="case-type-badge">{caseTypeLabel(active.caseType)}</span>}
          <button
            className="edit-details"
            onClick={() => {
              setDraft(draftFor(active));
              setDraftIsNew(false);
            }}
            data-tooltip="Project type, case name, property address, applicant and schedule materials for the drawings"
          >
            Edit details
          </button>
        </h2>
        <a
          href="#"
          className="back"
          onClick={(e) => {
            e.preventDefault();
            goHome();
          }}
        >
          ← All cases
        </a>
      </div>

      {draft && (
        <div
          className="modal-overlay"
          onClick={() => {
            setDraft(null);
            setDraftIsNew(false);
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label="Edit case details" onClick={(e) => e.stopPropagation()}>
            <h3>{draftIsNew ? "What's this application for?" : "Case details"}</h3>
            {draftIsNew && (
              <p>
                <small className="muted">Everything here is optional and editable later — the project type is the useful one.</small>
              </p>
            )}
            <label>
              Project type
              <select
                value={draft.caseType}
                onChange={(e) => setDraft({ ...draft, caseType: e.target.value as CaseType | "" })}
                autoFocus={draftIsNew}
              >
                <option value="">Not stated — describe from the drawings</option>
                {CASE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <p>
              <small className="muted">
                {CASE_TYPES.find((t) => t.value === draft.caseType)?.hint ??
                  "Names the application on the Planning Statement. Leave unset and the statement is written from what differs between your existing and proposed models."}
              </small>
            </p>
            <label>
              Case name
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Mrs Smith — rear extension"
                autoFocus={!draftIsNew}
              />
            </label>
            <label>
              Full property address
              <input
                value={draft.address}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                placeholder="12 Example Road, Ramsgate CT11 1AA"
              />
            </label>
            <p>The address prints in the title block of every drawing. Keep the postcode in it — it drives the map search.</p>
            <div className="two-col">
              <label>
                Applicant
                <input value={draft.applicant} onChange={(e) => setDraft({ ...draft, applicant: e.target.value })} placeholder="e.g. Mr & Mrs Smith" />
              </label>
              <label>
                Agent (optional)
                <input value={draft.agent} onChange={(e) => setDraft({ ...draft, agent: e.target.value })} placeholder="e.g. Jones Building Design" />
              </label>
              <label>
                Windows &amp; doors
                <input value={draft.joinery} onChange={(e) => setDraft({ ...draft, joinery: e.target.value })} placeholder="e.g. White uPVC (unchanged)" />
              </label>
              <label>
                Rainwater goods
                <input value={draft.rainwater} onChange={(e) => setDraft({ ...draft, rainwater: e.target.value })} placeholder="e.g. Black uPVC (unchanged)" />
              </label>
            </div>
            <p>
              <small className="muted">
                Applicant and agent print in every title block; joinery and rainwater descriptions fill the Schedule of Materials. All optional.
              </small>
            </p>
            <div className="modal-actions">
              <button
                className="secondary outline"
                onClick={() => {
                  setDraft(null);
                  setDraftIsNew(false);
                }}
              >
                {draftIsNew ? "Skip for now" : "Cancel"}
              </button>
              <button
                onClick={() => {
                  setDraftIsNew(false);
                  persist({
                    ...active,
                    caseType: draft.caseType || undefined,
                    name: draft.name.trim() || undefined,
                    address: draft.address.trim(),
                    applicant: draft.applicant.trim() || undefined,
                    agent: draft.agent.trim() || undefined,
                    joineryMaterial: draft.joinery.trim() || undefined,
                    rainwaterMaterial: draft.rainwater.trim() || undefined,
                  });
                  setDraft(null);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      <nav className="steps">
        {steps.map((s) => (
          <button key={s.key} className={step === s.key ? "seg active" : "seg"} onClick={() => setStep(s.key)}>
            {s.label}
          </button>
        ))}
      </nav>

      {step === "location" && (
        <>
          <div className="step-intro">
            <h3>Location Plan</h3>
            <p>
              Search the postcode, draw the red line around the <strong>whole plot</strong> — garden and drive included, not just the house — then
              capture the map for the PDF.
            </p>
          </div>
          <LocationPlanStep
            address={active.address}
            boundary={active.boundary}
            blueLine={active.blueLine}
            mapCentre={active.mapCentre}
            locationPlanImage={active.locationPlanImage}
            locationPlanScale={active.locationPlanScale}
            onChange={(updates) => persist({ ...active, ...updates })}
          />
        </>
      )}

      {step === "model" && (
        <>
          <div className="step-intro">
            <h3>Building &amp; Elevations</h3>
            <p>
              Trace the building as blocks over the site boundary, then switch to <strong>Proposed</strong> and make the
              changes you're applying for. Leave the proposed model as-is if nothing about the building's shape changes.
            </p>
          </div>
          <RoofComposerStep
            wings={active.wings ?? []}
            proposedWings={active.proposedWings}
            materials={active.materials}
            boundary={active.boundary}
            boundaryRotationDeg={active.composerBoundaryRotationDeg}
            northBearingDeg={active.northBearingDeg}
            onChange={(updates) => persist({ ...active, ...updates })}
          />
        </>
      )}

      {step === "download" && (
        <>
          <div className="step-intro">
            <h3>Download</h3>
            <p>One PDF with a page per drawing, ready for the Planning Portal.</p>
          </div>
          <article style={{ padding: "1.25rem 1.5rem" }}>
            <ul className="checklist">
              <li className={hasBoundary ? undefined : "todo-item"}>
                <span className={`tick ${hasBoundary ? "done" : "todo"}`}>✓</span>
                Red-line boundary drawn{hasBoundary ? "" : " — go to Location Plan and click around the property"}
              </li>
              <li className={hasCapture ? undefined : "todo-item"}>
                <span className={`tick ${hasCapture ? "done" : "todo"}`}>✓</span>
                Basemap captured{hasCapture ? ` at 1:${active.locationPlanScale}` : " — capture on the Location Plan step so the map prints behind the red line"}
              </li>
              <li className={hasBlocks ? undefined : "todo-item"}>
                <span className={`tick ${hasBlocks ? "done" : "todo"}`}>✓</span>
                Building modelled{hasBlocks ? ` (${active.wings!.length} block${active.wings!.length === 1 ? "" : "s"})` : " — add at least one block on Building & Elevations"}
              </li>
              {hasBlocks && typeMismatch && (
                <li className="todo-item">
                  <span className="tick todo">✓</span>
                  Project type matches the model — you chose &ldquo;{caseTypeLabel(active.caseType)}&rdquo;, but the drawings don&rsquo;t
                  show it. The documents describe what you actually modelled instead; change the type via &ldquo;Edit details&rdquo;
                  or finish the changes on Building &amp; Elevations.
                </li>
              )}
              {swatchesMatch && (
                <li className="todo-item">
                  <span className="tick todo">✓</span>
                  Roof change is visible on the drawings — the existing and proposed coverings are drawn in the same colour, so
                  the elevations show no change. Give one of them a different swatch on Building &amp; Elevations.
                </li>
              )}
              {noOpenings && (
                <li className="todo-item">
                  <span className="tick todo">✓</span>
                  Windows and doors added — the elevations are currently blank walls, which councils routinely query. Add
                  openings on Building &amp; Elevations.
                </li>
              )}
            </ul>
            {(hasBoundary || hasBlocks) && (
              // PDFDownloadLink renders its document to a blob once on mount and
              // ignores prop changes — key it by updatedAt so edits remount it
              // and the download reflects the latest case.
              <PDFDownloadLink key={active.updatedAt} document={<PdfBundle planningCase={active} />} fileName={`${active.name || active.address || "auto-planning-uk"}-drawings.pdf`}>
                {({ loading }) => (
                  <button className="pill" aria-busy={loading} data-tooltip="Rebuilt from your latest edits — one page per drawing">
                    {loading ? "Preparing PDF…" : "Download drawing set (PDF)"}
                  </button>
                )}
              </PDFDownloadLink>
            )}
            <br />
            <small className="muted">
              One PDF with a page per drawing (Location Plan, Block Plan, Existing/Proposed Roof Plans and Elevations,
              plus a Schedule of Materials and Planning Statement). Split into separate files before
              uploading if your planning portal requires one document per drawing.
            </small>
          </article>
        </>
      )}
    </Shell>
  );
}
