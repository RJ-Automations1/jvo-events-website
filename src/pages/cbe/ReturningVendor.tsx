import { useEffect, useId, useState, cloneElement, isValidElement, type FormEvent, type ReactElement } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import CbeLayout from "@/components/cbe/Layout";
import { useCbeAuth } from "@/lib/cbe/auth";
import { api, type Meta } from "@/lib/cbe/api";
import { programName } from "@/components/cbe/ui";

interface VendorLite {
  id: string;
  vendorName: string;
  contactName: string;
  email: string;
  program: string;
  programManager: string;
  vendorRole: string;
}

/**
 * Returning-vendor flow: search an existing vendor profile, then log a NEW
 * payment request against it (no duplicate onboarding). Mirrors Tiera's
 * "separate Cognito Form for returning vendors" — the profile is preserved and
 * only the engagement/payment details are captured.
 */
export default function ReturningVendor() {
  const { user, programs } = useCbeAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VendorLite[]>([]);
  const [selected, setSelected] = useState<VendorLite | null>(null);

  const [form, setForm] = useState({
    program: "",
    programManager: user?.name || "",
    vendorRole: "",
    paymentReason: "",
    paymentType: "",
    paymentFrequency: "",
    paymentAmount: "",
    paymentDueDate: "",
    notes: "",
  });

  useEffect(() => {
    api<Meta>("/meta").then(setMeta).catch((e) => setError(e.message));
  }, []);

  // Pre-select a vendor if arriving from a vendor page (?vendor=<id>).
  useEffect(() => {
    const preId = params.get("vendor");
    if (!preId) return;
    api<{ vendor: VendorLite }>(`/vendors/${preId}`)
      .then(({ vendor }) => selectVendor(vendor))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced typeahead search.
  useEffect(() => {
    if (selected) return;
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => {
      api<{ vendors: VendorLite[] }>(`/vendors/search?q=${encodeURIComponent(term)}`)
        .then((r) => setResults(r.vendors))
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(id);
  }, [query, selected]);

  function selectVendor(v: VendorLite) {
    setSelected(v);
    setResults([]);
    setForm((f) => ({
      ...f,
      program: v.program || f.program,
      programManager: v.programManager || f.programManager,
      vendorRole: v.vendorRole || f.vendorRole,
    }));
  }

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!selected) return setError("Please select a returning vendor.");
    if (!form.paymentReason.trim()) return setError("Payment reason is required.");
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      files.forEach((f) => fd.append("documents", f));
      await api(`/vendors/${selected.id}/engagements`, { method: "POST", body: fd });
      navigate(`/cbe/vendors/${selected.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit payment request.");
      setBusy(false);
    }
  }

  return (
    <CbeLayout>
      <div className="cbe-page-head">
        <div>
          <h1>Returning Vendor — Payment Request</h1>
          <p>Find an existing vendor and log a new engagement without re-onboarding.</p>
        </div>
      </div>

      {error && <div className="cbe-alert error">{error}</div>}

      <form onSubmit={onSubmit}>
        {/* Vendor picker */}
        <div className="cbe-card" style={{ marginBottom: 18 }}>
          <h2 className="cbe-section-title">Vendor</h2>
          {selected ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong>{selected.vendorName}</strong>
                <div className="cbe-muted" style={{ fontSize: "0.85rem" }}>
                  {selected.contactName} {selected.email && `· ${selected.email}`} ·{" "}
                  {programName(programs, selected.program)}
                </div>
              </div>
              <button type="button" className="cbe-btn ghost sm" onClick={() => setSelected(null)}>
                Change
              </button>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <input
                className="cbe-input"
                placeholder="Search by vendor name, contact, or email…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              {results.length > 0 && (
                <div
                  className="cbe-card"
                  style={{ position: "absolute", zIndex: 10, left: 0, right: 0, marginTop: 4, padding: 6 }}
                >
                  {results.map((v) => (
                    <div
                      key={v.id}
                      onClick={() => selectVendor(v)}
                      style={{ padding: "8px 10px", borderRadius: 7, cursor: "pointer" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f2f5fa")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <strong>{v.vendorName}</strong>
                      <span className="cbe-muted" style={{ fontSize: "0.82rem" }}>
                        {" "}
                        — {v.contactName} {v.email && `· ${v.email}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {query.trim().length >= 2 && results.length === 0 && (
                <p className="cbe-muted" style={{ fontSize: "0.85rem" }}>
                  No match. Is this a first-time vendor?{" "}
                  <Link to="/cbe/vendors/new">Onboard a new vendor</Link>.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Payment request details */}
        <div className="cbe-card" style={{ marginBottom: 18, opacity: selected ? 1 : 0.55 }}>
          <h2 className="cbe-section-title">New Engagement / Payment</h2>
          <div className="cbe-form-grid">
            <Field label="Program">
              <select className="cbe-select" value={form.program} onChange={(e) => set("program", e.target.value)}>
                <option value="">Select…</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Responsible Program Manager">
              <input className="cbe-input" value={form.programManager} onChange={(e) => set("programManager", e.target.value)} />
            </Field>
            <Field label="Vendor Role">
              <select className="cbe-select" value={form.vendorRole} onChange={(e) => set("vendorRole", e.target.value)}>
                <option value="">Select…</option>
                {meta?.vendorRoles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Payment Reason *">
              <input className="cbe-input" value={form.paymentReason} onChange={(e) => set("paymentReason", e.target.value)} />
            </Field>
            <Field label="Payment Type">
              <select className="cbe-select" value={form.paymentType} onChange={(e) => set("paymentType", e.target.value)}>
                <option value="">Select…</option>
                {meta?.paymentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Payment Frequency">
              <select className="cbe-select" value={form.paymentFrequency} onChange={(e) => set("paymentFrequency", e.target.value)}>
                <option value="">Select…</option>
                {meta?.paymentFrequencies.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Payment Amount ($)">
              <input className="cbe-input" inputMode="decimal" value={form.paymentAmount} onChange={(e) => set("paymentAmount", e.target.value)} />
            </Field>
            <Field label="Payment Due Date">
              <input className="cbe-input" type="date" value={form.paymentDueDate} onChange={(e) => set("paymentDueDate", e.target.value)} />
            </Field>
            <Field label="Notes" full>
              <textarea className="cbe-textarea" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="cbe-card" style={{ marginBottom: 18 }}>
          <h2 className="cbe-section-title">Supporting Documents</h2>
          <p className="cbe-muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
            Invitation letter, ICA, scope of work, invoice, or updated W-9 / ACH.
          </p>
          <input className="cbe-input" type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} />
          {files.length > 0 && (
            <p className="cbe-muted" style={{ fontSize: "0.82rem", marginBottom: 0 }}>
              {files.length} file{files.length > 1 ? "s" : ""} selected.
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button className="cbe-btn" disabled={busy || !selected}>
            {busy ? "Submitting…" : "Submit Payment Request"}
          </button>
          <button type="button" className="cbe-btn ghost" onClick={() => navigate("/cbe")}>
            Cancel
          </button>
        </div>
      </form>
    </CbeLayout>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  const id = useId();
  return (
    <div className={`cbe-field${full ? " full" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {isValidElement(children) ? cloneElement(children as ReactElement, { id }) : children}
    </div>
  );
}
