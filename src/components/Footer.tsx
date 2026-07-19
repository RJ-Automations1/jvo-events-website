import { Link } from "react-router-dom";
import { LOGO } from "@/lib/media";
import { IS_WEDDINGS_SITE } from "@/lib/siteMode";

const year = new Date().getFullYear();

/** Where visitors can reach the main events site from the weddings deployment. */
const EVENTS_SITE_URL = import.meta.env.VITE_EVENTS_URL || "https://www.jvoevents.com";

export default function Footer() {
  if (IS_WEDDINGS_SITE) return <WeddingsFooter />;
  return <EventsFooter />;
}

/**
 * Footer for the standalone JVO Weddings site — wedding links only, plus one
 * small "JVO Events" link for visitors who want non-wedding events.
 */
function WeddingsFooter() {
  return (
    <footer style={{ background: "#050505", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid gap-12 md:grid-cols-3">
          {/* Brand */}
          <div>
            <div className="flex items-baseline gap-2 mb-5">
              <span
                className="text-3xl font-bold tracking-tight"
                style={{ fontFamily: "'Playfair Display', serif", color: "#c9a96a" }}
              >
                JVO
              </span>
              <span
                className="text-white/55 text-xs tracking-[0.3em] uppercase"
                style={{ fontFamily: "'Lato', sans-serif" }}
              >
                Weddings
              </span>
            </div>
            <p
              className="text-white/40 text-sm leading-relaxed max-w-xs"
              style={{ fontFamily: "'Lato', sans-serif" }}
            >
              An elegant indoor &amp; outdoor wedding venue in Jonesboro, Georgia — minutes
              from Atlanta. All-inclusive wedding packages with professional event staff.
            </p>
            <a
              href="https://www.instagram.com/jvoevents/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="JVO on Instagram"
              className="inline-flex items-center gap-2 mt-5 text-white/50 hover:text-white transition-colors"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="2" width="20" height="20" rx="5.5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
              </svg>
              <span className="text-sm" style={{ fontFamily: "'Lato', sans-serif" }}>@jvoevents</span>
            </a>
          </div>

          {/* Weddings links */}
          <div>
            <div className="text-white/30 text-xs tracking-widest uppercase mb-4" style={{ fontFamily: "'Lato', sans-serif" }}>
              Weddings
            </div>
            <ul className="space-y-3">
              <li>
                <a href="/#included" className="text-white/50 text-sm hover:text-white/85 transition-colors" style={{ fontFamily: "'Lato', sans-serif" }}>
                  What's Included
                </a>
              </li>
              <li>
                <a href="/#estimate" className="text-white/50 text-sm hover:text-white/85 transition-colors" style={{ fontFamily: "'Lato', sans-serif" }}>
                  Build Your Estimate
                </a>
              </li>
              <li>
                <Link to="/tour" className="text-white/50 text-sm hover:text-white/85 transition-colors" style={{ fontFamily: "'Lato', sans-serif" }}>
                  Book a Tour
                </Link>
              </li>
              <li>
                <Link to="/book" className="text-white/50 text-sm hover:text-white/85 transition-colors" style={{ fontFamily: "'Lato', sans-serif" }}>
                  Book Your Wedding
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-white/50 text-sm hover:text-white/85 transition-colors" style={{ fontFamily: "'Lato', sans-serif" }}>
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <div className="text-white/30 text-xs tracking-widest uppercase mb-4" style={{ fontFamily: "'Lato', sans-serif" }}>
              Contact
            </div>
            <ul className="space-y-3" style={{ fontFamily: "'Lato', sans-serif" }}>
              <li>
                <a href="tel:+16785194723" className="text-white/50 text-sm hover:text-white/85 transition-colors">
                  678-519-4723
                </a>
              </li>
              <li>
                <a href="mailto:eventsjvo@gmail.com" className="text-white/50 text-sm hover:text-white/85 transition-colors">
                  eventsjvo@gmail.com
                </a>
              </li>
              <li className="text-white/50 text-sm">Jonesboro, Georgia</li>
            </ul>
          </div>
        </div>

        <div
          className="mt-14 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <p className="text-white/30 text-xs" style={{ fontFamily: "'Lato', sans-serif" }}>
            © {year} JVO Weddings. All rights reserved.
          </p>
          {/* The one link back to the main events site */}
          <a
            href={EVENTS_SITE_URL}
            className="text-white/35 text-xs hover:text-white/70 transition-colors"
            style={{ fontFamily: "'Lato', sans-serif" }}
          >
            Planning a non-wedding event? Visit JVO Events ↗
          </a>
        </div>
      </div>
    </footer>
  );
}

function EventsFooter() {
  return (
    <footer style={{ background: "#050505", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid gap-12 md:grid-cols-3">
          {/* Brand */}
          <div>
            <img
              src={LOGO}
              alt="JVO — Jonesboro Virtual Offices & Suites"
              className="h-28 w-auto mb-5 opacity-80"
              style={{ filter: "brightness(1.6)" }}
            />
            <p
              className="text-white/40 text-sm leading-relaxed max-w-xs"
              style={{ fontFamily: "'Lato', sans-serif" }}
            >
              An elegant event space for weddings, celebrations, and gatherings in
              Jonesboro, Georgia.
            </p>
            <a
              href="https://www.instagram.com/jvoevents/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="JVO Events on Instagram"
              className="inline-flex items-center gap-2 mt-5 text-white/50 hover:text-white transition-colors"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="2" width="20" height="20" rx="5.5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
              </svg>
              <span className="text-sm" style={{ fontFamily: "'Lato', sans-serif" }}>@jvoevents</span>
            </a>
          </div>

          {/* Explore */}
          <div>
            <div
              className="text-white/30 text-xs tracking-widest uppercase mb-4"
              style={{ fontFamily: "'Lato', sans-serif" }}
            >
              Explore
            </div>
            <ul className="space-y-3">
              {[
                { to: "/", label: "Home" },
                { to: "/gallery", label: "Gallery" },
                { to: "/events", label: "Pricing" },
                { to: "/contact", label: "Contact" },
                { to: "/book", label: "Book Now" },
              ].map((l) => (
                <li key={l.to}>
                  <Link
                    to={l.to}
                    className="text-white/50 text-sm hover:text-white/85 transition-colors"
                    style={{ fontFamily: "'Lato', sans-serif" }}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <div
              className="text-white/30 text-xs tracking-widest uppercase mb-4"
              style={{ fontFamily: "'Lato', sans-serif" }}
            >
              Contact
            </div>
            <ul className="space-y-3" style={{ fontFamily: "'Lato', sans-serif" }}>
              <li>
                <a
                  href="https://www.jvoevents.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/50 text-sm hover:text-white/85 transition-colors"
                >
                  www.jvoevents.com
                </a>
              </li>
              <li>
                <a
                  href="mailto:eventsjvo@gmail.com"
                  className="text-white/50 text-sm hover:text-white/85 transition-colors"
                >
                  eventsjvo@gmail.com
                </a>
              </li>
              <li className="text-white/50 text-sm">Jonesboro, Georgia</li>
            </ul>
          </div>
        </div>

        <div
          className="mt-14 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <p className="text-white/30 text-xs" style={{ fontFamily: "'Lato', sans-serif" }}>
            © {year} JVO Events. All rights reserved.
          </p>
          <Link to="/book" className="btn-outline" style={{ padding: "0.6rem 1.5rem" }}>
            Reserve Your Date
          </Link>
        </div>
      </div>
    </footer>
  );
}
