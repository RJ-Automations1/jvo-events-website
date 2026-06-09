import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useReveal } from "@/lib/useReveal";
import { VIDEO, VIDEO_POSTER, PAGE_HERO_IMAGE } from "@/lib/media";

/** Vertical event reels shown below the main testimonial. */
const reels = [
  { src: VIDEO.outdoorReel, poster: VIDEO_POSTER.outdoorReel, title: "Outdoor Events", body: "Receptions and gatherings under the open-air pavilion." },
  { src: VIDEO.gameNight, poster: VIDEO_POSTER.gameNight, title: "Game Night", body: "The energy of a full house — food, friends, and fun." },
];

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

      {/* Event reels */}
      <section style={{ background: "#080808", padding: "80px 0" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="reveal text-white text-2xl sm:text-3xl font-bold text-center mb-12" style={{ fontFamily: "'Playfair Display', serif" }}>
            Moments at JVO
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 max-w-xl mx-auto">
            {reels.map((r) => (
              <div key={r.title} className="reveal">
                <div
                  className="overflow-hidden mx-auto"
                  style={{
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "#000",
                    borderRadius: "0.25rem",
                  }}
                >
                  <video
                    controls
                    playsInline
                    preload="none"
                    poster={r.poster}
                    className="w-full"
                    style={{ display: "block", aspectRatio: "9 / 16", background: "#000" }}
                  >
                    <source src={r.src} type="video/mp4" />
                  </video>
                </div>
                <h3 className="text-white text-base font-bold mt-4 text-center" style={{ fontFamily: "'Playfair Display', serif" }}>
                  {r.title}
                </h3>
                <p className="text-white/45 text-xs leading-relaxed text-center mt-1 px-2" style={{ fontFamily: "'Lato', sans-serif" }}>
                  {r.body}
                </p>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* Community / grand opening feature */}
      <section style={{ background: "#0b0b0b", padding: "80px 0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <p className="reveal text-white/40 text-xs tracking-[0.3em] uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
              Rooted In Community
            </p>
            <h2 className="reveal text-white text-3xl sm:text-4xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
              More than a venue
            </h2>
            <div className="reveal accent-divider mx-auto mt-5" />
          </div>
          <div className="reveal overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.10)", background: "#000" }}>
            <video
              controls
              playsInline
              preload="metadata"
              poster={VIDEO_POSTER.cookup}
              className="w-full"
              style={{ display: "block", aspectRatio: "16 / 9", background: "#000" }}
            >
              <source src={VIDEO.cookup} type="video/mp4" />
            </video>
          </div>

          <div className="text-center mt-14">
            <Link to="/book" className="reveal btn-white inline-block">
              Book Your Event
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
