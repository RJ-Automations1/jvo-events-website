import { useEffect, useId, useMemo, useState, cloneElement, isValidElement, type FormEvent, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import CbeLayout from "@/components/cbe/Layout";
import { useCbeAuth } from "@/lib/cbe/auth";
import { api, type Meta, type Vendor } from "@/lib/cbe/api";

/**
 * New-vendor onboarding form. Captures the permanent profile + demographics and
 * lets the PM attach onboarding documents (W-9, ACH, application…). Submits as
 * multipart so files ride along in one request.
 */
export default function NewVendor() {
  const { user, programs } = useCbeAuth();
  const navigate = useNavigate();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const myPrograms = useMemo(
    () => (user?.role === "leadership" ? programs : programs.filter((p) => user?.programs.includes(p.id))),
    [programs, user]
  );

  const [form, setForm] = useState({
    vendorName: "",
    contactName: "",
    email: "",
    phone: "",
    program: "",
    programManager: user?.name || "",
    vendorType: "",
    vendorRole: "",
    address: "",
    demographics: "",
    notes: "",
  });

  useEffect(() => {
    api<Meta>("/meta").then(setMeta).catch((e) => setError(e.message));
  }, []);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.vendorName.trim()) return setError("Vendor name is required.");
    if (!form.program) return setError("Please choose a program.");
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      files.forEach((f) => fd.append("documents", f));
      const { vendor } = await api<{ vendor: Vendor }>("/vendors", { method: "POST", body: fd });
      navigate(`/cbe/vendors/${vendor.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save vendor.");
      setBusy(false);
    }
  }

  return (
    <CbeLayout>
      <div className="cbe-page-head">
        <div>
          <h1>New Vendor Onboarding</h1>
          <p>Create a permanent vendor profile and start the onboarding checklist.</p>
        </div>
      </div>

      {error && <div className="cbe-alert error">{error}</div>}

      <form onSubmit={onSubmit}>
        <div className="cbe-card" style={{ marginBottom: 18 }}>
          <h2 className="cbe-section-title">Vendor &amp; Contact</h2>
          <div className="cbe-form-grid">
            <Field label="Vendor / Business Name *">
              <input className="cbe-input" value={form.vendorName} onChange={(e) => set("vendorName", e.target.value)} required />
            </Field>
            <Field label="Primary Contact Name">
              <input className="cbe-input" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
            </Field>
            <Field label="Email">
              <input className="cbe-input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Phone">
              <input className="cbe-input" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Mailing Address" full>
              <input className="cbe-input" value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="cbe-card" style={{ marginBottom: 18 }}>
          <h2 className="cbe-section-title">Program &amp; Classification</h2>
          <div className="cbe-form-grid">
            <Field label="Program *">
              <select className="cbe-select" value={form.program} onChange={(e) => set("program", e.target.value)} required>
                <option value="">Select a program…</option>
                {myPrograms.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Responsible Program Manager">
              <input className="cbe-input" value={form.programManager} onChange={(e) => set("programManager", e.target.value)} />
            </Field>
            <Field label="Vendor Type">
              <select className="cbe-select" value={form.vendorType} onChange={(e) => set("vendorType", e.target.value)}>
                <option value="">Select…</option>
                {meta?.vendorTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Vendor Role">
              <select className="cbe-select" value={form.vendorRole} onChange={(e) => set("vendorRole", e.target.value)}>
                <option value="">Select…</option>
                {meta?.vendorRoles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          </div>
        </div>

        <div className="cbe-card" style={{ marginBottom: 18 }}>
          <h2 className="cbe-section-title">Demographics &amp; Notes</h2>
          <div className="cbe-form-grid">
            <Field label="Demographic Information" hint="Retained on the permanent profile" full>
              <textarea className="cbe-textarea" value={form.demographics} onChange={(e) => set("demographics", e.target.value)} />
            </Field>
            <Field label="Notes" full>
              <textarea className="cbe-textarea" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="cbe-card" style={{ marginBottom: 18 }}>
          <h2 className="cbe-section-title">Onboarding Documents</h2>
          <p className="cbe-muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
            Attach the vendor application, W-9, ACH form, references, or any supporting files.
          </p>
          <input
            className="cbe-input"
            type="file"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
          />
          {files.length > 0 && (
            <p className="cbe-muted" style={{ fontSize: "0.82rem", marginBottom: 0 }}>
              {files.length} file{files.length > 1 ? "s" : ""} selected.
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button className="cbe-btn" disabled={busy}>
            {busy ? "Saving…" : "Create Vendor"}
          </button>
          <button type="button" className="cbe-btn ghost" onClick={() => navigate("/cbe")}>
            Cancel
          </button>
        </div>
      </form>
    </CbeLayout>
  );
}

function Field({
  label,
  hint,
  full,
  children,
}: {
  label: string;
  hint?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className={`cbe-field${full ? " full" : ""}`}>
      <label htmlFor={id}>
        {label} {hint && <span className="hint">— {hint}</span>}
      </label>
      {isValidElement(children) ? cloneElement(children as ReactElement, { id }) : children}
    </div>
  );
}
