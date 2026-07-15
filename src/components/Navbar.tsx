import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

const links = [
  { to: "/", label: "Home" },
  { to: "/events", label: "Pricing" },
  { to: "/gallery", label: "Gallery" },
  { to: "/testimonials", label: "Testimonials" },
  { to: "/contact", label: "Contact" },
];

/**
 * Weddings is its own destination — set apart at the far end of the nav.
 * Defaults to the in-app page; set VITE_WEDDINGS_URL to the standalone
 * Weddings site's URL (e.g. the jvo-weddings Render service or a custom
 * wedding domain) to send visitors there instead — no code change needed.
 */
const WEDDINGS_URL = import.meta.env.VITE_WEDDINGS_URL || "/weddings";
const WEDDINGS_EXTERNAL = /^https?:\/\//i.test(WEDDINGS_URL);

/** Renders the Weddings link as an external <a> or an in-app <Link> as configured. */
function WeddingsLink({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return WEDDINGS_EXTERNAL ? (
    <a href={WEDDINGS_URL} className={className} style={style}>
      {children}
    </a>
  ) : (
    <Link to={WEDDINGS_URL} className={className} style={style}>
      {children}
    </Link>
  );
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu whenever the route changes
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-colors duration-300"
      style={{
        background: scrolled ? "rgba(8,8,8,0.85)" : "transparent",
        backdropFilter: scrolled ? "blur(10px)" : "none",
        borderBottom: scrolled
          ? "1px solid rgba(255,255,255,0.08)"
          : "1px solid transparent",
      }}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo / wordmark */}
          <Link to="/" className="flex items-baseline gap-2 group">
            <span
              className="text-white text-2xl font-bold tracking-tight"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              JVO
            </span>
            <span
              className="text-white/45 text-xs tracking-[0.3em] uppercase group-hover:text-white/70 transition-colors"
              style={{ fontFamily: "'Lato', sans-serif" }}
            >
              Events
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-9">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/"}
                className="text-xs tracking-[0.18em] uppercase transition-colors"
                style={({ isActive }) => ({
                  fontFamily: "'Lato', sans-serif",
                  fontWeight: 700,
                  color: isActive ? "#ffffff" : "rgba(255,255,255,0.5)",
                })}
              >
                {l.label}
              </NavLink>
            ))}

            {/* Weddings — its own destination, right after Contact */}
            <WeddingsLink className="flex items-baseline gap-1 group">
              <span
                className="text-xs font-bold tracking-[0.18em] uppercase transition-colors"
                style={{ fontFamily: "'Lato', sans-serif", color: "#c9a96a" }}
              >
                Weddings
              </span>
              <span
                className="text-[#c9a96a]/70 text-xs transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              >
                ↗
              </span>
            </WeddingsLink>

            <Link to="/tour" className="btn-outline" style={{ padding: "0.7rem 1.6rem" }}>
              Book a Tour
            </Link>
            <Link to="/book" className="btn-white" style={{ padding: "0.7rem 1.6rem" }}>
              Book Now
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            type="button"
            aria-label="Toggle menu"
            className="md:hidden flex flex-col gap-[5px] p-2"
            onClick={() => setOpen((v) => !v)}
          >
            <span
              className="block h-[1.5px] w-6 bg-white transition-transform"
              style={{ transform: open ? "translateY(6.5px) rotate(45deg)" : "none" }}
            />
            <span
              className="block h-[1.5px] w-6 bg-white transition-opacity"
              style={{ opacity: open ? 0 : 1 }}
            />
            <span
              className="block h-[1.5px] w-6 bg-white transition-transform"
              style={{ transform: open ? "translateY(-6.5px) rotate(-45deg)" : "none" }}
            />
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      <div
        className="md:hidden overflow-hidden transition-all duration-300"
        style={{
          maxHeight: open ? "420px" : "0px",
          background: "rgba(8,8,8,0.97)",
          borderBottom: open ? "1px solid rgba(255,255,255,0.08)" : "none",
        }}
      >
        <div className="px-6 py-5 flex flex-col gap-5">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === "/"}
              className="text-sm tracking-[0.15em] uppercase"
              style={({ isActive }) => ({
                fontFamily: "'Lato', sans-serif",
                fontWeight: 700,
                color: isActive ? "#ffffff" : "rgba(255,255,255,0.55)",
              })}
            >
              {l.label}
            </NavLink>
          ))}

          {/* Weddings — its own destination, right after Contact */}
          <WeddingsLink className="flex items-center gap-1.5">
            <span
              className="text-sm font-bold tracking-[0.15em] uppercase"
              style={{ fontFamily: "'Lato', sans-serif", color: "#c9a96a" }}
            >
              Weddings
            </span>
            <span className="text-[#c9a96a]/70 text-sm" aria-hidden="true">
              ↗
            </span>
          </WeddingsLink>

          <Link to="/tour" className="btn-outline text-center mt-1">
            Book a Tour
          </Link>
          <Link to="/book" className="btn-white text-center">
            Book Now
          </Link>
        </div>
      </div>
    </header>
  );
}
