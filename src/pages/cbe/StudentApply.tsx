import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import PublicShell from "@/components/cbe/PublicShell";
import Field from "@/components/cbe/Field";
import { SubmittedScreen } from "./VendorApply";
import { api, type Meta } from "@/lib/cbe/api";

/**
 * Public, no-login student application. A CBE program student submits their
 * info; it creates a record (applicantType "Student") on the staff dashboard,
 * tracked through the same onboarding process as everyone else.
 */
export default function StudentApply() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [done, setDone] = useState<string | null>(null);

  const [form, setForm] = useState({
    contactName: "",
    email: "",
    phone: "",
    program: "",
    school: "",
    classification: "",
    major: "",
    demographics: "",
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
    if (!form.contactName.trim()) return setError("Please enter your name.");
    if (!form.program) return setError("Please choose a program.");
    setBusy(true);
    try {
      const fd = new FormData();
      // Use the student's name as the record name too.
      fd.append("vendorName", form.contactName);
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      files.forEach((f) => fd.append("documents", f));
      const res = await api<{ reference: string }>("/public/student-application", { method: "POST", body: fd });
      setDone(res.reference);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your application.");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <SubmittedScreen reference={done} who="student" />;

  return (
    <PublicShell>
      <div className="cbe-page-head">
        <div>
          <h1>Student Application</h1>
          <p>Tell us about yourself so we can get you set up. Fields marked * are required.</p>
        </div>
      </div>

      {error && <div className="cbe-alert error">{error}</div>}

      <form onSubmit={onSubmit}>
        <div className="cbe-card" style={{ marginBottom: 18 }}>
          <h2 className="cbe-section-title">Your Information</h2>
          <div className="cbe-form-grid">
            <Field label="Full Name *">
              <input className="cbe-input" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
            </Field>
            <Field label="Email *">
              <input className="cbe-input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
            </Field>
            <Field label="Phone">
              <input className="cbe-input" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="CBE Program *">
              <select className="cbe-select" value={form.program} onChange={(e) => set("program", e.target.value)} required>
                <option value="">Select a program…</option>
                {meta?.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </div>
        </div>

        <div className="cbe-card" style={{ marginBottom: 18 }}>
          <h2 className="cbe-section-title">School Details</h2>
          <div className="cbe-form-grid">
            <Field label="School">
              <select className="cbe-select" value={form.school} onChange={(e) => set("school", e.target.value)}>
                <option value="">Select…</option>
                {meta?.studentSchools.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Classification">
              <select className="cbe-select" value={form.classification} onChange={(e) => set("classification", e.target.value)}>
                <option value="">Select…</option>
                {meta?.studentClassifications.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Major / Field of Study">
              <input className="cbe-input" value={form.major} onChange={(e) => set("major", e.target.value)} />
            </Field>
            <Field label="Demographic Information" hint="optional" full>
              <textarea className="cbe-textarea" value={form.demographics} onChange={(e) => set("demographics", e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="cbe-card" style={{ marginBottom: 18 }}>
          <h2 className="cbe-section-title">Documents</h2>
          <p className="cbe-muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
            Upload your resume, application, or any supporting files.
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
