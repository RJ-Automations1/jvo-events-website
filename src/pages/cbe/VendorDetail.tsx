import { useCallback, useEffect, useId, useState, cloneElement, isValidElement, type ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import CbeLayout from "@/components/cbe/Layout";
import { StatusBadge, Progress, DocLink, programName } from "@/components/cbe/ui";
import { useCbeAuth } from "@/lib/cbe/auth";
import {
  api,
  money,
  type Engagement,
  type Meta,
  type StepDef,
  type StepState,
  type Vendor,
} from "@/lib/cbe/api";

export default function VendorDetail() {
  const { id } = useParams<{ id: string }>();
  const { programs } = useCbeAuth();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    const [{ vendor, engagements }, m] = await Promise.all([
      api<{ vendor: Vendor; engagements: Engagement[] }>(`/vendors/${id}`),
      api<Meta>("/meta"),
    ]);
    setVendor(vendor);
    setEngagements(engagements);
    setMeta(m);
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [load]);

  async function toggleOnboarding(key: string, done: boolean) {
    if (!vendor) return;
    const { vendor: updated } = await api<{ vendor: Vendor }>(`/vendors/${vendor.id}`, {
      method: "PATCH",
      body: { onboarding: { [key]: done } },
    });
    setVendor(updated);
  }

  if (loading) {
    return (
      <CbeLayout>
        <div className="cbe-spinner">Loading vendor…</div>
      </CbeLayout>
    );
  }
  if (error || !vendor || !meta) {
    return (
      <CbeLayout>
        <div className="cbe-alert error">{error || "Vendor not found."}</div>
        <Link to="/cbe" className="cbe-btn ghost">← Back to dashboard</Link>
      </CbeLayout>
    );
  }

  return (
    <CbeLayout>
      <div className="cbe-page-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0 }}>{vendor.vendorName}</h1>
            <StatusBadge status={vendor.status} />
          </div>
          <p>
            {programName(programs, vendor.program)} · {vendor.vendorRole || "No role set"} ·{" "}
            PM: {vendor.programManager || "—"}
          </p>
        </div>
        <Link className="cbe-btn" to={`/cbe/returning?vendor=${vendor.id}`}>
          + New Payment Request
        </Link>
      </div>

      {/* Payment summary tiles */}
      <div className="cbe-stats">
        <Tile label="Payment Requests" value={String(vendor.engagementCount)} />
        <Tile label="Dollars Requested" value={money(vendor.dollarsRequested)} />
        <Tile label="Dollars Paid" value={money(vendor.dollarsPaid)} />
        <Tile label="Outstanding" value={money(vendor.outstanding)} />
      </div>

      <div className="cbe-grid" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
        <ProfileCard vendor={vendor} meta={meta} onSaved={setVendor} />

        {/* Onboarding checklist */}
        <div className="cbe-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h2 className="cbe-section-title" style={{ margin: 0 }}>Onboarding Checklist</h2>
            <span className="cbe-muted" style={{ fontSize: "0.82rem" }}>
              {vendor.onboardingProgress.done}/{vendor.onboardingProgress.total} complete
            </span>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Progress pct={vendor.onboardingProgress.pct} />
          </div>
          <Checklist
            steps={meta.onboardingSteps}
            state={vendor.onboarding}
            onToggle={toggleOnboarding}
          />
        </div>

        {/* Documents */}
        <div className="cbe-card">
          <h2 className="cbe-section-title">Profile Documents</h2>
          {vendor.documents.length === 0 ? (
            <p className="cbe-muted" style={{ margin: 0, fontSize: "0.88rem" }}>No documents on file.</p>
          ) : (
            <div>{vendor.documents.map((d) => <DocLink key={d.id} doc={d} />)}</div>
          )}
          <UploadMore kind="vendors" id={vendor.id} onDone={load} />
        </div>

        {/* Engagements */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 className="cbe-section-title" style={{ margin: 0 }}>
              Engagements &amp; Payment Requests
            </h2>
          </div>
          {engagements.length === 0 ? (
            <div className="cbe-card cbe-muted" style={{ textAlign: "center", padding: 30 }}>
              No payment requests yet.{" "}
              <Link to={`/cbe/returning?vendor=${vendor.id}`}>Create one</Link>.
            </div>
          ) : (
            engagements.map((e) => (
              <EngagementCard key={e.id} engagement={e} meta={meta} onChanged={load} />
            ))
          )}
        </div>
      </div>
    </CbeLayout>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="cbe-stat">
      <div className="label">{label}</div>
      <div className="value" style={{ fontSize: "1.4rem" }}>{value}</div>
    </div>
  );
}

// --- Profile (editable) --------------------------------------------------

function ProfileCard({
  vendor,
  meta,
  onSaved,
}: {
  vendor: Vendor;
  meta: Meta;
  onSaved: (v: Vendor) => void;
}) {
  const { programs, user } = useCbeAuth();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(vendor);

  useEffect(() => setForm(vendor), [vendor]);

  function set<K extends keyof Vendor>(k: K, v: Vendor[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        vendorName: form.vendorName,
        contactName: form.contactName,
        email: form.email,
        phone: form.phone,
        programManager: form.programManager,
        vendorType: form.vendorType,
        vendorRole: form.vendorRole,
        status: form.status,
        address: form.address,
        demographics: form.demographics,
        notes: form.notes,
      };
      if (user?.role === "leadership") body.program = form.program;
      const { vendor: updated } = await api<{ vendor: Vendor }>(`/vendors/${vendor.id}`, {
        method: "PATCH",
        body,
      });
      onSaved(updated);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cbe-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 className="cbe-section-title" style={{ margin: 0 }}>Vendor Profile</h2>
        {editing ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="cbe-btn sm" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button className="cbe-btn ghost sm" onClick={() => { setForm(vendor); setEditing(false); }}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="cbe-btn ghost sm" onClick={() => setEditing(true)}>Edit</button>
        )}
      </div>

      {editing ? (
        <div className="cbe-form-grid">
          <FieldEdit label="Vendor Name"><input className="cbe-input" value={form.vendorName} onChange={(e) => set("vendorName", e.target.value)} /></FieldEdit>
          <FieldEdit label="Contact Name"><input className="cbe-input" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} /></FieldEdit>
          <FieldEdit label="Email"><input className="cbe-input" value={form.email} onChange={(e) => set("email", e.target.value)} /></FieldEdit>
          <FieldEdit label="Phone"><input className="cbe-input" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></FieldEdit>
          <FieldEdit label="Status">
            <select className="cbe-select" value={form.status} onChange={(e) => set("status", e.target.value)}>
              {meta.vendorStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </FieldEdit>
          <FieldEdit label="Program Manager"><input className="cbe-input" value={form.programManager} onChange={(e) => set("programManager", e.target.value)} /></FieldEdit>
          <FieldEdit label="Vendor Type">
            <select className="cbe-select" value={form.vendorType} onChange={(e) => set("vendorType", e.target.value)}>
              <option value="">—</option>
              {meta.vendorTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </FieldEdit>
          <FieldEdit label="Vendor Role">
            <select className="cbe-select" value={form.vendorRole} onChange={(e) => set("vendorRole", e.target.value)}>
              <option value="">—</option>
              {meta.vendorRoles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </FieldEdit>
          {user?.role === "leadership" && (
            <FieldEdit label="Program">
              <select className="cbe-select" value={form.program} onChange={(e) => set("program", e.target.value)}>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </FieldEdit>
          )}
          <FieldEdit label="Address" full><input className="cbe-input" value={form.address} onChange={(e) => set("address", e.target.value)} /></FieldEdit>
          <FieldEdit label="Demographics" full><textarea className="cbe-textarea" value={form.demographics} onChange={(e) => set("demographics", e.target.value)} /></FieldEdit>
          <FieldEdit label="Notes" full><textarea className="cbe-textarea" value={form.notes} onChange={(e) => set("notes", e.target.value)} /></FieldEdit>
        </div>
      ) : (
        <div className="cbe-form-grid">
          <ReadRow label="Contact" value={vendor.contactName} />
          <ReadRow label="Email" value={vendor.email} />
          <ReadRow label="Phone" value={vendor.phone} />
          <ReadRow label="Vendor Type" value={vendor.vendorType} />
          <ReadRow label="Vendor Role" value={vendor.vendorRole} />
          <ReadRow label="Program" value={programName(programs, vendor.program)} />
          <ReadRow label="Address" value={vendor.address} full />
          <ReadRow label="Demographics" value={vendor.demographics} full />
          <ReadRow label="Notes" value={vendor.notes} full />
        </div>
      )}
    </div>
  );
}

function ReadRow({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={`cbe-field${full ? " full" : ""}`} style={{ marginBottom: 10 }}>
      <label style={{ marginBottom: 2 }}>{label}</label>
      <div style={{ fontSize: "0.92rem" }}>{value || <span className="cbe-muted">—</span>}</div>
    </div>
  );
}

function FieldEdit({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  const id = useId();
  return (
    <div className={`cbe-field${full ? " full" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {isValidElement(children) ? cloneElement(children as ReactElement, { id }) : children}
    </div>
  );
}

// --- Shared checklist ----------------------------------------------------

function Checklist({
  steps,
  state,
  onToggle,
}: {
  steps: StepDef[];
  state: Record<string, StepState>;
  onToggle: (key: string, done: boolean) => Promise<void>;
}) {
  const [pending, setPending] = useState<string | null>(null);
  return (
    <div className="cbe-checklist">
      {steps.map((s) => {
        const done = !!state?.[s.key]?.done;
        const at = state?.[s.key]?.at;
        return (
          <label key={s.key} className={`cbe-check${done ? " done" : ""}`}>
            <input
              type="checkbox"
              checked={done}
              disabled={pending === s.key}
              onChange={async (e) => {
                setPending(s.key);
                try {
                  await onToggle(s.key, e.target.checked);
                } finally {
                  setPending(null);
                }
              }}
            />
            <span className="lbl">{s.label}</span>
            {at && <span className="at">{new Date(at).toLocaleDateString()}</span>}
          </label>
        );
      })}
    </div>
  );
}

// --- Engagement card -----------------------------------------------------

function EngagementCard({
  engagement,
  meta,
  onChanged,
}: {
  engagement: Engagement;
  meta: Meta;
  onChanged: () => Promise<void>;
}) {
  const [e, setE] = useState(engagement);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(engagement);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setE(engagement); setForm(engagement); }, [engagement]);

  async function toggleStep(key: string, done: boolean) {
    const { engagement: updated } = await api<{ engagement: Engagement }>(`/engagements/${e.id}`, {
      method: "PATCH",
      body: { workflow: { [key]: done } },
    });
    setE(updated);
    onChanged();
  }

  async function saveFields() {
    setBusy(true);
    try {
      const { engagement: updated } = await api<{ engagement: Engagement }>(`/engagements/${e.id}`, {
        method: "PATCH",
        body: {
          paymentReason: form.paymentReason,
          paymentType: form.paymentType,
          paymentFrequency: form.paymentFrequency,
          paymentAmount: form.paymentAmount,
          amountPaid: form.amountPaid,
          paymentDueDate: form.paymentDueDate,
          paymentDate: form.paymentDate,
          requisitionNumber: form.requisitionNumber,
          purchaseOrderNumber: form.purchaseOrderNumber,
          sqNumber: form.sqNumber,
          boNumber: form.boNumber,
          notes: form.notes,
        },
      });
      setE(updated);
      setEditing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  function set<K extends keyof Engagement>(k: K, v: Engagement[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <div className="cbe-card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <strong>{e.paymentReason || "Payment request"}</strong>
            {e.isComplete ? (
              <span className="cbe-badge green">Paid</span>
            ) : (
              <span className="cbe-badge amber">In progress</span>
            )}
          </div>
          <div className="cbe-muted" style={{ fontSize: "0.83rem", marginTop: 3 }}>
            {money(e.paymentAmount)} · {e.paymentType || "type n/a"}
            {e.paymentDueDate && ` · due ${e.paymentDueDate}`} · opened{" "}
            {new Date(e.createdAt).toLocaleDateString()}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Progress pct={e.workflowProgress.pct} />
            <span className="cbe-muted" style={{ fontSize: "0.78rem" }}>
              {e.workflowProgress.done}/{e.workflowProgress.total}
            </span>
          </div>
          <button className="cbe-btn ghost sm" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : "Details"}
          </button>
        </div>
      </div>

      {!open && e.nextAction && (
        <div className="cbe-muted" style={{ fontSize: "0.82rem", marginTop: 8 }}>
          Next: {e.nextAction}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 16, borderTop: "1px solid var(--cbe-border)", paddingTop: 16 }}>
          <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0,1fr)" }}>
            {/* Payment + reference fields */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <h3 className="cbe-section-title" style={{ margin: 0 }}>Payment Details</h3>
                {editing ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="cbe-btn sm" onClick={saveFields} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
                    <button className="cbe-btn ghost sm" onClick={() => { setForm(e); setEditing(false); }}>Cancel</button>
                  </div>
                ) : (
                  <button className="cbe-btn ghost sm" onClick={() => setEditing(true)}>Edit</button>
                )}
              </div>
              {editing ? (
                <div className="cbe-form-grid">
                  <FieldEdit label="Payment Reason"><input className="cbe-input" value={form.paymentReason} onChange={(ev) => set("paymentReason", ev.target.value)} /></FieldEdit>
                  <FieldEdit label="Payment Type">
                    <select className="cbe-select" value={form.paymentType} onChange={(ev) => set("paymentType", ev.target.value)}>
                      <option value="">—</option>
                      {meta.paymentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </FieldEdit>
                  <FieldEdit label="Frequency">
                    <select className="cbe-select" value={form.paymentFrequency} onChange={(ev) => set("paymentFrequency", ev.target.value)}>
                      <option value="">—</option>
                      {meta.paymentFrequencies.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </FieldEdit>
                  <FieldEdit label="Amount ($)"><input className="cbe-input" inputMode="decimal" value={String(form.paymentAmount)} onChange={(ev) => set("paymentAmount", Number(ev.target.value) as Engagement["paymentAmount"])} /></FieldEdit>
                  <FieldEdit label="Amount Paid ($)"><input className="cbe-input" inputMode="decimal" value={String(form.amountPaid)} onChange={(ev) => set("amountPaid", Number(ev.target.value) as Engagement["amountPaid"])} /></FieldEdit>
                  <FieldEdit label="Due Date"><input className="cbe-input" type="date" value={form.paymentDueDate} onChange={(ev) => set("paymentDueDate", ev.target.value)} /></FieldEdit>
                  <FieldEdit label="Payment Date"><input className="cbe-input" type="date" value={form.paymentDate} onChange={(ev) => set("paymentDate", ev.target.value)} /></FieldEdit>
                  <FieldEdit label="Requisition #"><input className="cbe-input" value={form.requisitionNumber} onChange={(ev) => set("requisitionNumber", ev.target.value)} /></FieldEdit>
                  <FieldEdit label="Purchase Order #"><input className="cbe-input" value={form.purchaseOrderNumber} onChange={(ev) => set("purchaseOrderNumber", ev.target.value)} /></FieldEdit>
                  <FieldEdit label="SQ #"><input className="cbe-input" value={form.sqNumber} onChange={(ev) => set("sqNumber", ev.target.value)} /></FieldEdit>
                  <FieldEdit label="BO #"><input className="cbe-input" value={form.boNumber} onChange={(ev) => set("boNumber", ev.target.value)} /></FieldEdit>
                  <FieldEdit label="Notes" full><textarea className="cbe-textarea" value={form.notes} onChange={(ev) => set("notes", ev.target.value)} /></FieldEdit>
                </div>
              ) : (
                <div className="cbe-form-grid">
                  <ReadRow label="Amount Requested" value={money(e.paymentAmount)} />
                  <ReadRow label="Amount Paid" value={money(e.amountPaid)} />
                  <ReadRow label="Frequency" value={e.paymentFrequency} />
                  <ReadRow label="Due Date" value={e.paymentDueDate} />
                  <ReadRow label="Payment Date" value={e.paymentDate} />
                  <ReadRow label="Requisition #" value={e.requisitionNumber} />
                  <ReadRow label="Purchase Order #" value={e.purchaseOrderNumber} />
                  <ReadRow label="SQ #" value={e.sqNumber} />
                  <ReadRow label="BO #" value={e.boNumber} />
                  <ReadRow label="Notes" value={e.notes} full />
                </div>
              )}
            </div>

            {/* Workflow checklist */}
            <div>
              <h3 className="cbe-section-title">Engagement Workflow</h3>
              <Checklist steps={meta.engagementSteps} state={e.workflow} onToggle={toggleStep} />
            </div>

            {/* Documents */}
            <div>
              <h3 className="cbe-section-title">Documents</h3>
              {e.documents.length === 0 ? (
                <p className="cbe-muted" style={{ margin: 0, fontSize: "0.88rem" }}>No documents.</p>
              ) : (
                <div>{e.documents.map((d) => <DocLink key={d.id} doc={d} />)}</div>
              )}
              <UploadMore kind="engagements" id={e.id} onDone={onChanged} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Add-document control ------------------------------------------------

function UploadMore({
  kind,
  id,
  onDone,
}: {
  kind: "vendors" | "engagements";
  id: string;
  onDone: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("documents", f));
      await api(`/${kind}/${id}/documents`, { method: "POST", body: fd });
      await onDone();
    } finally {
      setBusy(false);
    }
  }
  return (
    <label className="cbe-btn ghost sm" style={{ marginTop: 10, cursor: "pointer" }}>
      {busy ? "Uploading…" : "+ Add document"}
      <input type="file" multiple hidden disabled={busy} onChange={(e) => upload(e.target.files)} />
    </label>
  );
}
