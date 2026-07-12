import { useState, type FormEvent } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { CbeFrame } from "@/components/cbe/Layout";
import { useCbeAuth } from "@/lib/cbe/auth";

export default function CbeLogin() {
  const { user, loading, login } = useCbeAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string })?.from || "/cbe/dashboard";

  if (!loading && user) return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <CbeFrame>
      <div className="cbe-login">
        <div className="box">
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
            <div className="cbe-brand" style={{ fontSize: "1.3rem", alignItems: "center", textAlign: "center" }}>
              <img src="/cbe/cbe-mark.svg" alt="CBE" />
              <div>
                CBE Vendor Platform
                <span>Center for Black Entrepreneurship</span>
              </div>
            </div>
          </div>
          <div className="cbe-card">
            <h1 style={{ margin: "0 0 4px", fontSize: "1.25rem" }}>Sign in</h1>
            <p className="cbe-muted" style={{ margin: "0 0 20px", fontSize: "0.9rem" }}>
              Onboarding &amp; payment tracking for CBE vendors.
            </p>
            {error && <div className="cbe-alert error">{error}</div>}
            <form onSubmit={onSubmit}>
              <div className="cbe-field">
                <label htmlFor="cbe-email">Email</label>
                <input
                  id="cbe-email"
                  className="cbe-input"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="cbe-field">
                <label htmlFor="cbe-pass">Password</label>
                <input
                  id="cbe-pass"
                  className="cbe-input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button className="cbe-btn" style={{ width: "100%" }} disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
          <p className="cbe-muted" style={{ textAlign: "center", fontSize: "0.8rem", marginTop: 16 }}>
            Access is limited to CBE staff. Contact your administrator for an account.
          </p>
        </div>
      </div>
    </CbeFrame>
  );
}
