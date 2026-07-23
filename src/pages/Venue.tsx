import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useReveal } from "@/lib/useReveal";
import { VENUE as photos, HERO_IMAGE } from "@/lib/media";

/**
 * The Space — professional photos of the venue itself (no event crowds), so
 * guests can see exactly what they're booking. Real event moments live on the
 * separate Gallery page.
 */
export default function Venue() {
  useReveal();

  return (
    <div style={{ background: "#080808", minHeight: "100vh" }}>
      <Navbar />

      {/* Hero */}
      <section className="relative flex items-end" style={{ height: "50vh", minHeight: "360px" }}>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_IMAGE})` }}
        />
        <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.72)" }} />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 w-full">
          <p
            className="text-white/40 text-xs tracking-[0.3em] uppercase mb-2"
            style={{ fontFamily: "'Lato', sans-serif" }}
          >
            Tour the Venue
          </p>
          <h1
            className="text-white text-4xl sm:text-5xl lg:text-6xl font-bold"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            The Space
          </h1>
          <div className="accent-divider mt-4" />
        </div>
      </section>

      {/* Venue photos */}
      <section style={{ background: "#080808", padding: "80px 0" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p
              className="reveal text-[#c9a96a] text-base sm:text-lg tracking-[0.3em] uppercase mb-3"
              style={{ fontFamily: "'Lato', sans-serif" }}
            >
              An Open Canvas
            </p>
            <h2
              className="reveal text-white text-3xl sm:text-4xl font-bold"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              See the venue for yourself
            </h2>
            <div className="reveal accent-divider mx-auto mt-5" />
            <p
              className="reveal text-white/55 text-base leading-relaxed mt-5 max-w-2xl mx-auto"
              style={{ fontFamily: "'Lato', sans-serif" }}
            >
              Warm wood, string lighting, and an open-air covered pavilion — here is the
              space exactly as you'll find it, ready to shape around your event.
            </p>
          </div>

          <div className="columns-2 lg:columns-3 gap-3" style={{ columnGap: "0.75rem" }}>
            {photos.map((p, i) => (
              <div
                key={i}
                className="reveal group relative overflow-hidden mb-3"
                style={{ border: "1px solid rgba(255,255,255,0.07)", background: "#111", breakInside: "avoid" }}
              >
                <img
                  src={p.src}
                  alt={p.alt}
                  loading="lazy"
                  className="w-full block transition-transform duration-700 group-hover:scale-105"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.opacity = "0";
                  }}
                />
                <div
                  className="absolute inset-0 flex items-end p-3 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.6))" }}
                >
                  <span className="text-white/80 text-[0.65rem] tracking-wide uppercase" style={{ fontFamily: "'Lato', sans-serif" }}>
                    {p.alt}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="text-center mt-16">
            <p
              className="reveal text-white/45 text-base mb-7"
              style={{ fontFamily: "'Lato', sans-serif" }}
            >
              Want to see real events here? Visit the gallery — or come walk the space in person.
            </p>
            <div className="reveal flex flex-wrap items-center justify-center gap-4">
              <Link to="/gallery" className="btn-outline">
                View Event Gallery
              </Link>
              <Link to="/tour" className="btn-outline">
                Book a Tour
              </Link>
              <Link to="/book" className="btn-white">
                Book Your Event
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
