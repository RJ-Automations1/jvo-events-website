import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useReveal } from "@/lib/useReveal";
import { GALLERY as photos, PAGE_HERO_IMAGE } from "@/lib/media";

export default function Gallery() {
  useReveal();

  return (
    <div style={{ background: "#080808", minHeight: "100vh" }}>
      <Navbar />

      {/* Hero */}
      <section className="relative flex items-end" style={{ height: "50vh", minHeight: "360px" }}>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${PAGE_HERO_IMAGE})` }}
        />
        <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.72)" }} />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 w-full">
          <p
            className="text-white/40 text-xs tracking-[0.3em] uppercase mb-2"
            style={{ fontFamily: "'Lato', sans-serif" }}
          >
            A Look Inside
          </p>
          <h1
            className="text-white text-4xl sm:text-5xl lg:text-6xl font-bold"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Gallery
          </h1>
          <div className="accent-divider mt-4" />
        </div>
      </section>

      {/* Grid */}
      <section style={{ background: "#080808", padding: "80px 0" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-[220px]">
            {photos.map((p, i) => (
              <div
                key={i}
                className={`reveal group relative overflow-hidden ${p.span ?? ""}`}
                style={{ border: "1px solid rgba(255,255,255,0.07)", background: "#111" }}
              >
                <img
                  src={p.src}
                  alt={p.alt}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  onError={(e) => {
                    // Graceful placeholder until real images are added
                    (e.currentTarget as HTMLImageElement).style.opacity = "0";
                  }}
                />
                <div
                  className="absolute inset-0 flex items-end p-4 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.6))" }}
                >
                  <span
                    className="text-white/80 text-xs tracking-wide uppercase"
                    style={{ fontFamily: "'Lato', sans-serif" }}
                  >
                    {p.alt}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-16">
            <p
              className="reveal text-white/45 text-base mb-7"
              style={{ fontFamily: "'Lato', sans-serif" }}
            >
              Picture your event here.
            </p>
            <Link to="/book" className="reveal btn-white inline-block">
              Reserve Your Date
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
