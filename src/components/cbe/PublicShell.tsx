/**
 * Public shell for the self-service pages (landing + applications). Unlike the
 * admin CbeLayout it needs no login — just the CBE-branded frame, a simple
 * header with the logo, and a quiet "Staff login" link in the corner.
 */
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { CbeFrame } from "./Layout";

export default function PublicShell({ children }: { children: ReactNode }) {
  return (
    <CbeFrame>
      <header className="cbe-nav">
        <div className="cbe-nav-inner">
          <Link to="/cbe" className="cbe-brand" style={{ textDecoration: "none" }}>
            <img src="/cbe/cbe-mark.svg" alt="CBE" />
            <div>
              CBE Vendor &amp; Student Portal
              <span>Center for Black Entrepreneurship</span>
            </div>
          </Link>
          <div className="cbe-nav-links" />
          <div className="cbe-nav-user">
            <Link to="/cbe/login" className="cbe-btn ghost sm">
              Staff login
            </Link>
          </div>
        </div>
      </header>
      <main className="cbe-main">{children}</main>
    </CbeFrame>
  );
}
