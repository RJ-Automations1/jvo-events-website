import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import PublicShell from "@/components/cbe/PublicShell";
import Field from "@/components/cbe/Field";
import { api, type Meta } from "@/lib/cbe/api";

/**
 * Public, no-login vendor application. A vendor enters their profile, optional
 * first payment/engagement details, and documents; on submit it creates a
 * vendor record that appears on the staff master dashboard.
 */
export default function VendorApply() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [done, setDone] = useState<string | null>(null);

  const [form, setForm] = useState({
    vendorName: "",
    contactName: "",
    email: "",
    phone: "",
    address: "",
    program: "",
    vendorType: "",
    vendorRole: "",
    demographics: "",
    paymentReason: "",
    paymentType: "",
    paymentAmount: "",
    notes: "",
  });

  useEffect(() => {
    api<Meta>("/meta").then(setMeta).catch((e) => setError(e.message));
  }, []);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.vendorName.trim() && !form.contactName.trim()) return setError("Please enter your name.");
    if (!form.program) return setError("Please choose a program.");
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      files.forEach((f) => fd.append("documents", f));
      const res = await api<{ reference: string }>("/public/vendor-application", { method: "POST", body: fd });
      setDone(res.reference);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your application.");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <SubmittedScreen reference={done} who="vendor" />;

  return (
    <PublicShell>
      <div className="cbe-page-head">
        <div>
          <h1>Vendor Application</h1>
          <p>Tell us about you and your services. Fields marked * are required.</p>
        </div>
      </div>

      {error && <div className="cbe-alert error">{error}</div>}

      <form onSubmit={onSubmit}>
        <div className="cbe-card" style={{ marginBottom: 18 }}>
          <h2 className="cbe-section-title">Your Information</h2>
          <div className="cbe-form-grid">
            <Field label="Vendor / Business Name *">
              <input className="cbe-input" value={form.vendorName} onChange={(e) => set("vendorName", e.target.value)} />
            </Field>
            <Field label="Your Name (contact)">
              <input className="cbe-input" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
            </Field>
            <Field label="Email *">
              <input className="cbe-input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
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
          <h2 className="cbe-section-title">Program &amp; Services</h2>
          <div className="cbe-form-grid">
            <Field label="Program you're working with *">
              <select className="cbe-select" value={form.program} onChange={(e) => set("program", e.target.value)} required>
                <option value="">Select a program…</option>
                {meta?.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Vendor Type">
              <select className="cbe-select" value={form.vendorType} onChange={(e) => set("vendorType", e.target.value)}>
                <option value="">Select…</option>
                {meta?.vendorTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="What do you do for CBE?">
              <select className="cbe-select" value={form.vendorRole} onChange={(e) => set("vendorRole", e.target.value)}>
                <option value="">Select…</option>
                {meta?.vendorRoles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Demographic Information" hint="optional" full>
              <textarea className="cbe-textarea" value={form.demographics} onChange={(e) => set("demographics", e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="cbe-card" style={{ marginBottom: 18 }}>
          <h2 className="cbe-section-title">Payment Request <span className="cbe-muted" style={{ fontWeight: 500 }}>(optional — if you already have work to bill)</span></h2>
          <div className="cbe-form-grid">
            <Field label="Reason for Payment">
              <input className="cbe-input" value={form.paymentReason} onChange={(e) => set("paymentReason", e.target.value)} />
            </Field>
            <Field label="Payment Type">
              <select className="cbe-select" value={form.paymentType} onChange={(e) => set("paymentType", e.target.value)}>
                <option value="">Select…</option>
                {meta?.paymentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Amount ($)">
              <input className="cbe-input" inputMode="decimal" value={form.paymentAmount} onChange={(e) => set("paymentAmount", e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="cbe-card" style={{ marginBottom: 18 }}>
          <h2 className="cbe-section-title">Documents</h2>
          <p className="cbe-muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
            Upload your W-9, ACH form, resume/bio, or any supporting files.
          </p>
          <input className="cbe-input" type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} />
          {files.length > 0 && <p className="cbe-muted" style={{ fontSize: "0.82rem", marginBottom: 0 }}>{files.length} file(s) selected.</p>}
          <Field label="Anything else we should know?" full>
            <textarea className="cbe-textarea" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button className="cbe-btn" disabled={busy}>{busy ? "Submitting…" : "Submit Application"}</button>
          <Link to="/cbe" className="cbe-btn ghost">Cancel</Link>
        </div>
      </form>
    </PublicShell>
  );
}

export function SubmittedScreen({ reference, who }: { reference: string; who: "vendor" | "student" }) {
  return (
    <PublicShell>
      <div style={{ maxWidth: 560, margin: "40px auto" }}>
        <div className="cbe-card" style={{ textAlign: "center", padding: 36 }}>
          <div style={{ fontSize: "2.6rem", marginBottom: 8 }}>✅</div>
          <h1 style={{ margin: "0 0 8px", fontSize: "1.5rem" }}>Application received!</h1>
          <p className="cbe-muted" style={{ fontSize: "0.95rem", lineHeight: 1.6 }}>
            Thank you — your {who} application has been sent to the CBE team. They'll review it and
            follow up. You can track your progress with them from here on.
          </p>
          <p style={{ margin: "16px 0 0" }}>
            Your reference number: <strong>{reference}</strong>
          </p>
          <div style={{ marginTop: 22 }}>
            <Link to="/cbe" className="cbe-btn">Back to portal</Link>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
