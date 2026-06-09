import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useReveal } from "@/lib/useReveal";
import { VIDEO, VIDEO_POSTER } from "@/lib/media";

const perks = [
  { title: "Meetings & Trainings", body: "A focused, professional setting with room to present, collaborate, and host your team." },
  { title: "Mixers & Networking", body: "An inviting space for after-hours mixers, client events, and community gatherings." },
  { title: "Launches & Celebrations", body: "Product launches, company milestones, and holiday parties with the wow factor." },
];

export default function Corporate() {
  useReveal();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  const toggleSound = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted) v.play().catch(() => {});
    setMuted(v.muted);
  };

  return (
    <div style={{ background: "#080808", minHeight: "100vh" }}>
      <Navbar />

      {/* Video hero */}
      <section className="relative flex items-center overflow-hidden" style={{ minHeight: "82vh" }}>
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          poster={VIDEO_POSTER.cookup}
        >
          <source src={VIDEO.cookup} type="video/mp4" />
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
              Corporate Events
            </p>
            <h1 className="text-white text-5xl sm:text-6xl font-bold leading-[1.05]" style={{ fontFamily: "'Playfair Display', serif" }}>
              Host Your
              <br />
              Corporate Event
            </h1>
            <div className="accent-divider mt-6" />
            <p className="text-white/70 text-base sm:text-lg leading-relaxed mt-6 max-w-xl" style={{ fontFamily: "'Lato', sans-serif" }}>
              Meetings, mixers, product launches, and company celebrations — JVO gives your
              business a polished, flexible space with room to impress.
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-9">
              <Link to="/book" className="btn-white">
                Host Your Event
              </Link>
              <button type="button" onClick={toggleSound} className="btn-outline" style={{ cursor: "pointer" }}>
                {muted ? "🔊 Turn On Sound" : "🔇 Mute"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Perks */}
      <section style={{ background: "#080808", padding: "90px 0" }}>
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

      {/* Pricing */}
      <section style={{ background: "#0b0b0b", padding: "90px 0" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="reveal text-white/40 text-xs tracking-[0.3em] uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
            Corporate Packages
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
            Book Your Corporate Event
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
