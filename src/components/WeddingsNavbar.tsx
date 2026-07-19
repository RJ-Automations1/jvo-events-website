import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

/**
 * Navigation for the standalone JVO Weddings site (VITE_SITE_MODE=weddings).
 * Deliberately wedding-only — no Pricing/Gallery/Testimonials from the events
 * site — so this deployment reads as its own website.
 */
const GOLD = "#c9a96a";

/** Section anchors live on the weddings page (the root of this site). */
const sections = [
  { hash: "#included", label: "What's Included" },
  { hash: "#estimate", label: "Build Your Estimate" },
  { hash: "#reserve", label: "Reserve" },
];

export default function WeddingsNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const onHome = pathname === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  // On the weddings page anchors work in-page; elsewhere send them home first.
  const sectionHref = (hash: string) => (onHome ? hash : `/${hash}`);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-colors duration-300"
      style={{
        background: scrolled ? "rgba(8,8,8,0.88)" : "transparent",
        backdropFilter: scrolled ? "blur(10px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
      }}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Wordmark */}
          <Link to="/" className="flex items-baseline gap-2 group">
            <span
              className="text-2xl font-bold tracking-tight"
              style={{ fontFamily: "'Playfair Display', serif", color: GOLD }}
            >
              JVO
            </span>
            <span
              className="text-white/60 text-xs tracking-[0.3em] uppercase group-hover:text-white/85 transition-colors"
              style={{ fontFamily: "'Lato', sans-serif" }}
            >
              Weddings
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {sections.map((s) => (
              <a
                key={s.hash}
                href={sectionHref(s.hash)}
                className="text-xs tracking-[0.18em] uppercase text-white/55 hover:text-white transition-colors"
                style={{ fontFamily: "'Lato', sans-serif", fontWeight: 700 }}
              >
                {s.label}
              </a>
            ))}
            <Link
              to="/contact"
              className="text-xs tracking-[0.18em] uppercase text-white/55 hover:text-white transition-colors"
              style={{ fontFamily: "'Lato', sans-serif", fontWeight: 700 }}
            >
              Contact
            </Link>
            <Link to="/tour" className="btn-outline" style={{ padding: "0.7rem 1.6rem" }}>
              Book a Tour
            </Link>
            <Link to="/book" className="btn-white" style={{ padding: "0.7rem 1.6rem" }}>
              Book Your Wedding
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
          {sections.map((s) => (
            <a
              key={s.hash}
              href={sectionHref(s.hash)}
              onClick={() => setOpen(false)}
              className="text-sm tracking-[0.15em] uppercase text-white/60"
              style={{ fontFamily: "'Lato', sans-serif", fontWeight: 700 }}
            >
              {s.label}
            </a>
          ))}
          <Link
            to="/contact"
            className="text-sm tracking-[0.15em] uppercase text-white/60"
            style={{ fontFamily: "'Lato', sans-serif", fontWeight: 700 }}
          >
            Contact
          </Link>
          <Link to="/tour" className="btn-outline text-center mt-1">
            Book a Tour
          </Link>
          <Link to="/book" className="btn-white text-center">
            Book Your Wedding
          </Link>
        </div>
      </div>
    </header>
  );
}
