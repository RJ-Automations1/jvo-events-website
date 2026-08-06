import { useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Lightbox from "@/components/Lightbox";
import { useReveal } from "@/lib/useReveal";
import { GALLERY as photos, REELS as reels, PAGE_HERO_IMAGE } from "@/lib/media";

export default function Gallery() {
  useReveal();
  /** Index of the photo showing full-screen, or null when the viewer is closed. */
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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

      {/* Split: Photos (left) · Videos (right) */}
      <section style={{ background: "#080808", padding: "80px 0" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12">
            {/* Photos */}
            <div>
              <h2 className="reveal text-white text-xl font-bold mb-6 tracking-[0.1em] uppercase" style={{ fontFamily: "'Lato', sans-serif" }}>
                Photos
              </h2>
              <div className="columns-2 gap-3" style={{ columnGap: "0.75rem" }}>
                {photos.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setLightboxIndex(i)}
                    aria-label={`View ${p.alt} full screen`}
                    className="reveal group relative overflow-hidden mb-3 block w-full p-0"
                    style={{
                      border: "1px solid rgba(255,255,255,0.07)",
                      background: "#111",
                      breakInside: "avoid",
                      cursor: "zoom-in",
                    }}
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
                      <span className="text-white/80 text-[0.65rem] tracking-wide uppercase text-left" style={{ fontFamily: "'Lato', sans-serif" }}>
                        {p.alt}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Videos */}
            <div>
              <h2 className="reveal text-white text-xl font-bold mb-6 tracking-[0.1em] uppercase" style={{ fontFamily: "'Lato', sans-serif" }}>
                Videos
              </h2>
              <div className="columns-2 gap-3" style={{ columnGap: "0.75rem" }}>
                {reels.map((r, i) => (
                  <div
                    key={i}
                    className="reveal overflow-hidden mb-3"
                    style={{ border: "1px solid rgba(255,255,255,0.10)", background: "#000", breakInside: "avoid", borderRadius: "0.125rem" }}
                  >
                    <video
                      controls
                      playsInline
                      preload="none"
                      poster={r.poster}
                      className="w-full block"
                      style={{ background: "#000" }}
                    >
                      <source src={r.src} type="video/mp4" />
                    </video>
                  </div>
                ))}
              </div>
            </div>
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

      <Lightbox
        items={photos}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />

      <Footer />
    </div>
  );
}
