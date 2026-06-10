import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useReveal } from "@/lib/useReveal";
import { VIDEO, VIDEO_POSTER, PAGE_HERO_IMAGE } from "@/lib/media";

export default function Testimonials() {
  useReveal();

  return (
    <div style={{ background: "#080808", minHeight: "100vh" }}>
      <Navbar />

      {/* Hero */}
      <section className="relative flex items-end" style={{ height: "50vh", minHeight: "360px" }}>
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${PAGE_HERO_IMAGE})` }} />
        <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.72)" }} />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 w-full">
          <p className="text-white/40 text-xs tracking-[0.3em] uppercase mb-2" style={{ fontFamily: "'Lato', sans-serif" }}>
            In Their Words
          </p>
          <h1 className="text-white text-4xl sm:text-5xl lg:text-6xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
            Testimonials
          </h1>
          <div className="accent-divider mt-4" />
        </div>
      </section>

      {/* Main testimonial video */}
      <section style={{ background: "#080808", padding: "80px 0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="reveal text-white text-3xl sm:text-4xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
              Hear from our guests
            </h2>
            <div className="reveal accent-divider mx-auto mt-5" />
            <p className="reveal text-white/50 text-base mt-6 max-w-2xl mx-auto" style={{ fontFamily: "'Lato', sans-serif" }}>
              Real stories from the people who've celebrated, gathered, and worked at JVO.
            </p>
          </div>

          <div
            className="reveal overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.10)", background: "#000" }}
          >
            <video
              controls
              playsInline
              preload="metadata"
              poster={VIDEO_POSTER.testimonyMain}
              className="w-full"
              style={{ display: "block", aspectRatio: "16 / 9", background: "#000" }}
            >
              <source src={VIDEO.testimonyMain} type="video/mp4" />
            </video>
          </div>
        </div>
      </section>

      {/* Voices from JVO — short clips from the community */}
      <section style={{ background: "#0b0b0b", padding: "80px 0" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="reveal text-white text-2xl sm:text-3xl font-bold text-center mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>
            More voices from JVO
          </h2>
          <p className="reveal text-white/45 text-sm text-center mb-12" style={{ fontFamily: "'Lato', sans-serif" }}>
            A few words from the people who make JVO special.
          </p>
          <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 max-w-3xl mx-auto">
            {[
              { src: VIDEO.igTestimonial1, poster: VIDEO_POSTER.igTestimonial1 },
              { src: VIDEO.igTestimonial2, poster: VIDEO_POSTER.igTestimonial2 },
              { src: VIDEO.igTestimonial3, poster: VIDEO_POSTER.igTestimonial3 },
            ].map((v, i) => (
              <div
                key={i}
                className="reveal overflow-hidden"
                style={{ border: "1px solid rgba(255,255,255,0.10)", background: "#000", borderRadius: "0.25rem" }}
              >
                <video
                  controls
                  playsInline
                  preload="none"
                  poster={v.poster}
                  className="w-full"
                  style={{ display: "block", aspectRatio: "9 / 16", background: "#000" }}
                >
                  <source src={v.src} type="video/mp4" />
                </video>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
