import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

const links = [
  { to: "/", label: "Home" },
  { to: "/gallery", label: "Gallery" },
  { to: "/about", label: "About" },
  { to: "/testimonials", label: "Testimonials" },
  { to: "/contact", label: "Contact" },
];

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
          maxHeight: open ? "360px" : "0px",
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
          <Link to="/book" className="btn-white text-center mt-1">
            Book Now
          </Link>
        </div>
      </div>
    </header>
  );
}
