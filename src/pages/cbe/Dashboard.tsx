import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import CbeLayout from "@/components/cbe/Layout";
import { StatusBadge, Progress, programName } from "@/components/cbe/ui";
import { useCbeAuth } from "@/lib/cbe/auth";
import { api, money, type Metrics, type Vendor } from "@/lib/cbe/api";

export default function CbeDashboard() {
  const { user, programs } = useCbeAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const program = params.get("program") || "";
  const q = params.get("q") || "";

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(q);

  // Programs this user can filter by (leadership → all; PM → assigned only).
  const myPrograms = useMemo(
    () => (user?.role === "leadership" ? programs : programs.filter((p) => user?.programs.includes(p.id))),
    [programs, user]
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const qs = new URLSearchParams();
    if (program) qs.set("program", program);
    if (q) qs.set("q", q);
    Promise.all([
      api<Metrics>("/metrics"),
      api<{ vendors: Vendor[] }>(`/vendors?${qs.toString()}`),
    ])
      .then(([m, v]) => {
        if (!alive) return;
        setMetrics(m);
        setVendors(v.vendors);
        setError("");
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [program, q]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  const t = metrics?.totals;

  return (
    <CbeLayout>
      <div className="cbe-page-head">
        <div>
          <h1>Master Dashboard</h1>
          <p>
            {program ? programName(programs, program) : "All programs"} — vendor onboarding &amp;
            payment status across CBE.
          </p>
        </div>
        <Link className="cbe-btn" to="/cbe/vendors/new">
          + New Vendor
        </Link>
      </div>

      {error && <div className="cbe-alert error">{error}</div>}

      {/* Metric tiles */}
      <div className="cbe-stats">
        <Stat label="Vendors" value={t ? String(t.vendors) : "—"} />
        <Stat label="Payment Requests" value={t ? String(t.engagements) : "—"} />
        <Stat label="Dollars Requested" value={t ? money(t.dollarsRequested) : "—"} />
        <Stat label="Dollars Paid" value={t ? money(t.dollarsPaid) : "—"} />
        <Stat label="Outstanding" value={t ? money(t.outstanding) : "—"} />
        <Stat label="Onboarding Complete" value={t ? String(t.onboardingComplete) : "—"} />
      </div>

      {/* Filters */}
      <div
        className="cbe-card"
        style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 20 }}
      >
        <div className="cbe-field" style={{ margin: 0, minWidth: 220, flex: 1 }}>
          <label>Search vendors</label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateParam("q", search.trim());
            }}
          >
            <input
              className="cbe-input"
              placeholder="Name, contact, email, role…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
        </div>
        <div className="cbe-field" style={{ margin: 0, minWidth: 200 }}>
          <label>Program</label>
          <select
            className="cbe-select"
            value={program}
            onChange={(e) => updateParam("program", e.target.value)}
          >
            <option value="">All my programs</option>
            {myPrograms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {(program || q) && (
          <button
            className="cbe-btn ghost"
            onClick={() => setParams(new URLSearchParams(), { replace: true })}
          >
            Clear
          </button>
        )}
      </div>

      {/* Vendor table */}
      {loading ? (
        <div className="cbe-spinner">Loading vendors…</div>
      ) : vendors.length === 0 ? (
        <div className="cbe-card cbe-muted" style={{ textAlign: "center", padding: 40 }}>
          No vendors yet. <Link to="/cbe/vendors/new">Add your first vendor</Link> or wire up the
          Cognito Forms webhook.
        </div>
      ) : (
        <div className="cbe-table-wrap">
          <table className="cbe-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Program</th>
                <th>Program Manager</th>
                <th>Status</th>
                <th>Onboarding</th>
                <th>Requested</th>
                <th>Outstanding</th>
                <th>Next Action</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id} onClick={() => navigate(`/cbe/vendors/${v.id}`)}>
                  <td>
                    <strong>{v.vendorName || "(unnamed)"}</strong>
                    {v.contactName && v.contactName !== v.vendorName && (
                      <div className="cbe-muted" style={{ fontSize: "0.8rem" }}>{v.contactName}</div>
                    )}
                    <div className="cbe-muted" style={{ fontSize: "0.72rem" }}>
                      Started {new Date(v.createdAt).toLocaleDateString()}
                    </div>
                  </td>
                  <td>{programName(programs, v.program)}</td>
                  <td>{v.programManager || "—"}</td>
                  <td>
                    <StatusBadge status={v.status} />
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Progress pct={v.onboardingProgress.pct} />
                      <span className="cbe-muted" style={{ fontSize: "0.78rem" }}>
                        {v.onboardingProgress.done}/{v.onboardingProgress.total}
                      </span>
                    </div>
                  </td>
                  <td>{money(v.dollarsRequested)}</td>
                  <td>
                    {v.outstanding > 0 ? (
                      <span className="cbe-badge amber">{money(v.outstanding)}</span>
                    ) : (
                      <span className="cbe-muted">{money(0)}</span>
                    )}
                  </td>
                  <td className="cbe-muted" style={{ fontSize: "0.82rem" }}>
                    {v.onboardingNextAction || (v.openEngagements ? "Payment in progress" : "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-program roll-up (leadership + multi-program PMs) */}
      {metrics && metrics.byProgram.length > 1 && (
        <div style={{ marginTop: 28 }}>
          <h2 className="cbe-section-title">By Program</h2>
          <div className="cbe-table-wrap">
            <table className="cbe-table">
              <thead>
                <tr>
                  <th>Program</th>
                  <th>Vendors</th>
                  <th>Requested</th>
                  <th>Paid</th>
                  <th>Outstanding</th>
                  <th>Onboarding Complete</th>
                </tr>
              </thead>
              <tbody>
                {metrics.byProgram.map((p) => (
                  <tr key={p.program} onClick={() => updateParam("program", p.program)}>
                    <td>
                      <strong>{programName(programs, p.program)}</strong>
                    </td>
                    <td>{p.vendors}</td>
                    <td>{money(p.dollarsRequested)}</td>
                    <td>{money(p.dollarsPaid)}</td>
                    <td>{money(p.outstanding)}</td>
                    <td>
                      {p.onboardingComplete}/{p.vendors}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </CbeLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="cbe-stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
