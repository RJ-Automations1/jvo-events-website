import { useRef } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useReveal } from "@/lib/useReveal";
import { useUnmuteOnInteraction } from "@/lib/useUnmuteOnInteraction";
import { VIDEO, VIDEO_POSTER } from "@/lib/media";

const perks = [
  { title: "Weddings & Receptions", body: "A refined backdrop for your ceremony and celebration, with room to make the day entirely your own." },
  { title: "Celebrations & Socials", body: "Birthdays, milestones, game nights, and mixers — an inviting space built for good food and good company." },
  { title: "Corporate & Launches", body: "Meetings, trainings, product launches, and company celebrations with a polished, professional setting." },
];

/** The three signature event films shown on the Host page. */
const films = [
  { src: VIDEO.cookup, poster: VIDEO_POSTER.cookup, title: "Corporate & Cook Ups" },
  { src: VIDEO.gameNight, poster: VIDEO_POSTER.gameNight, title: "Game Nights & Socials" },
  { src: VIDEO.wedding, poster: VIDEO_POSTER.wedding, title: "Weddings & Receptions" },
];

export default function Corporate() {
  useReveal();
  const heroRef = useRef<HTMLVideoElement>(null);
  useUnmuteOnInteraction(heroRef);

  return (
    <div style={{ background: "#080808", minHeight: "100vh" }}>
      <Navbar />

      {/* Video hero */}
      <section className="relative flex items-center overflow-hidden" style={{ minHeight: "82vh" }}>
        <video
          ref={heroRef}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          poster={VIDEO_POSTER.outdoorReel}
        >
          <source src={VIDEO.outdoorReel} type="video/mp4" />
        </video>
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,8,8,0.72) 0%, rgba(8,8,8,0.55) 45%, rgba(8,8,8,0.9) 100%)",
          }}
        />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="max-w-2xl">
            <p className="text-white/55 text-xs sm:text-sm tracking-[0.3em] uppercase mb-4" style={{ fontFamily: "'Lato', sans-serif" }}>
              Weddings · Celebrations · Corporate
            </p>
            <h1 className="text-white text-5xl sm:text-6xl font-bold leading-[1.05]" style={{ fontFamily: "'Playfair Display', serif" }}>
              Host Your Event
            </h1>
            <div className="accent-divider mt-6" />
            <p className="text-white/70 text-base sm:text-lg leading-relaxed mt-6 max-w-xl" style={{ fontFamily: "'Lato', sans-serif" }}>
              Weddings, celebrations, game nights, mixers, and corporate gatherings — JVO
              gives every kind of event a polished, flexible space with room to impress.
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-9">
              <Link to="/book" className="btn-white">
                Host Your Event
              </Link>
              <Link to="/gallery" className="btn-outline">
                View Space
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing — moved up, right under the hero */}
      <section style={{ background: "#080808", padding: "90px 0" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="reveal text-white/40 text-xs tracking-[0.3em] uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
            Event Packages
          </p>
          <h2 className="reveal text-white text-3xl sm:text-4xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
            Simple, transparent pricing
          </h2>
          <div className="reveal accent-divider mx-auto mt-5" />
          <div className="reveal grid sm:grid-cols-3 gap-4 mt-10">
            {[
              { label: "Half Day", sub: "5 hours", value: "$800" },
              { label: "Full Day", sub: "10 hours", value: "$1,300" },
              { label: "Deposit", sub: "To reserve", value: "$150" },
            ].map((p) => (
              <div key={p.label} className="p-6" style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.02)" }}>
                <div className="text-white text-2xl font-bold" style={{ fontFamily: "'Lato', sans-serif" }}>{p.value}</div>
                <div className="text-white text-base font-bold mt-2" style={{ fontFamily: "'Playfair Display', serif" }}>{p.label}</div>
                <div className="text-white/40 text-xs tracking-wide uppercase mt-1" style={{ fontFamily: "'Lato', sans-serif" }}>{p.sub}</div>
              </div>
            ))}
          </div>
          <Link to="/book" className="reveal btn-white mt-10 inline-block">
            Book Your Event
          </Link>
        </div>
      </section>

      {/* Event films — the three signature event types */}
      <section style={{ background: "#080808", padding: "90px 0" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="reveal text-white/40 text-xs tracking-[0.3em] uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
              Every Kind Of Event
            </p>
            <h2 className="reveal text-white text-3xl sm:text-4xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
              One space, every occasion
            </h2>
            <div className="reveal accent-divider mx-auto mt-5" />
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {films.map((f) => (
              <div key={f.title} className="reveal">
                <div
                  className="overflow-hidden"
                  style={{ border: "1px solid rgba(255,255,255,0.10)", background: "#000", borderRadius: "0.25rem" }}
                >
                  <video
                    controls
                    playsInline
                    preload="none"
                    poster={f.poster}
                    className="w-full"
                    style={{ display: "block", aspectRatio: "16 / 9", background: "#000" }}
                  >
                    <source src={f.src} type="video/mp4" />
                  </video>
                </div>
                <h3 className="text-white text-base font-bold mt-4 text-center" style={{ fontFamily: "'Playfair Display', serif" }}>
                  {f.title}
                </h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Perks */}
      <section style={{ background: "#0b0b0b", padding: "90px 0" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-3">
            {perks.map((p) => (
              <div
                key={p.title}
                className="reveal p-8"
                style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}
              >
                <h3 className="text-white text-xl font-bold mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>
                  {p.title}
                </h3>
                <p className="text-white/45 text-sm leading-relaxed" style={{ fontFamily: "'Lato', sans-serif" }}>
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
