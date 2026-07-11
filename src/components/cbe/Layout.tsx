/**
 * CBE platform shell: the top nav + the auth gate. Wraps every /cbe/* page.
 * Unauthenticated users are redirected to the login screen (preserving where
 * they were headed). Program Managers see the same nav as leadership minus the
 * program picker breadth — the API already scopes their data.
 */
import { NavLink, useLocation, Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useCbeAuth } from "@/lib/cbe/auth";

function TopNav() {
  const { user, logout } = useCbeAuth();
  return (
    <header className="cbe-nav">
      <div className="cbe-nav-inner">
        <div className="cbe-brand">
          CBE Vendors
          <span>Center for Black Entrepreneurship</span>
        </div>
        <nav className="cbe-nav-links">
          <NavLink to="/cbe" end className={({ isActive }) => (isActive ? "active" : "")}>
            Dashboard
          </NavLink>
          <NavLink to="/cbe/vendors/new" className={({ isActive }) => (isActive ? "active" : "")}>
            New Vendor
          </NavLink>
          <NavLink to="/cbe/returning" className={({ isActive }) => (isActive ? "active" : "")}>
            Returning Vendor
          </NavLink>
        </nav>
        {user && (
          <div className="cbe-nav-user">
            <div className="who">
              {user.name}
              <small>{user.role === "leadership" ? "Leadership" : "Program Manager"}</small>
            </div>
            <button className="cbe-btn ghost sm" onClick={logout}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

/** App-level frame — applies the `.cbe-app` theme scope to everything inside. */
export function CbeFrame({ children }: { children: ReactNode }) {
  return <div className="cbe-app">{children}</div>;
}

/** Guarded layout used by all authenticated pages. */
export default function CbeLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useCbeAuth();
  const location = useLocation();

  if (loading) {
    return (
      <CbeFrame>
        <div className="cbe-spinner">Loading…</div>
      </CbeFrame>
    );
  }
  if (!user) {
    return <Navigate to="/cbe/login" replace state={{ from: location.pathname }} />;
  }
  return (
    <CbeFrame>
      <TopNav />
      <main className="cbe-main">{children}</main>
    </CbeFrame>
  );
}
