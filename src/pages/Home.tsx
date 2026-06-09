import { useRef } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useReveal } from "@/lib/useReveal";
import { useUnmuteOnInteraction } from "@/lib/useUnmuteOnInteraction";
import { HERO_IMAGE, HERO_VIDEO, VIDEO, VIDEO_POSTER } from "@/lib/media";

const highlights = [
  {
    title: "Weddings & Receptions",
    body: "A refined backdrop for your ceremony and celebration, with room to make the day entirely your own.",
    img: "/manus-storage/wedding-couple.jpg",
  },
  {
    title: "Private Celebrations",
    body: "Birthdays, graduations, and milestones — an intimate, polished setting for the people who matter.",
    img: "/manus-storage/people-celebration.jpg",
  },
  {
    title: "Game Nights & Socials",
    body: "Bring everyone together for game nights, mixers, and good food in a space built for fun.",
    img: "/manus-storage/people-jenga.jpg",
  },
];

export default function Home() {
  useReveal();
  const heroRef = useRef<HTMLVideoElement>(null);
  useUnmuteOnInteraction(heroRef);

  return (
    <div style={{ background: "#080808", minHeight: "100vh" }}>
      <Navbar />

      {/* Hero */}
      <section className="relative flex items-center overflow-hidden" style={{ height: "100vh", minHeight: "620px" }}>
        {/* Video background (drops in at HERO_VIDEO); poster shows until/if absent */}
        <video
          ref={heroRef}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          poster={HERO_IMAGE}
        >
          <source src={HERO_VIDEO} type="video/mp4" />
        </video>
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.65) 55%, rgba(8,8,8,0.95) 100%)",
          }}
        />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="max-w-2xl">
            <p
              className="text-white/50 text-xs sm:text-sm tracking-[0.3em] uppercase mb-4"
              style={{ fontFamily: "'Lato', sans-serif" }}
            >
              Jonesboro, Georgia
            </p>
            <h1
              className="text-white text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.05]"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Where Your
              <br />
              Moments Become
              <br />
              Memories
            </h1>
            <div className="accent-divider mt-6" />
            <p
              className="text-white/55 text-base sm:text-lg leading-relaxed mt-6 max-w-xl"
              style={{ fontFamily: "'Lato', sans-serif" }}
            >
              An elegant, versatile event space for weddings, celebrations, and
              gatherings — designed to feel effortless from your first visit to your
              last dance.
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-9">
              <Link to="/book" className="btn-white">
                Book Event
              </Link>
              <Link to="/gallery" className="btn-outline">
                View Space
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Intro */}
      <section style={{ background: "#080808", padding: "100px 0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p
            className="reveal text-white/40 text-xs tracking-[0.3em] uppercase mb-4"
            style={{ fontFamily: "'Lato', sans-serif" }}
          >
            Welcome to JVO Events
          </p>
          <h2
            className="reveal text-white text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            A space designed for the moments that matter
          </h2>
          <div className="reveal accent-divider mx-auto mt-6" />
          <p
            className="reveal text-white/50 text-base sm:text-lg leading-relaxed mt-7 max-w-3xl mx-auto"
            style={{ fontFamily: "'Lato', sans-serif" }}
          >
            From intimate gatherings to full celebrations, our venue gives you a clean,
            beautiful canvas and the flexibility to shape the day your way. Half-day and
            full-day packages make it simple to book the time you need.
          </p>
        </div>
      </section>

      {/* Highlights */}
      <section style={{ background: "#0b0b0b", padding: "90px 0" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-3">
            {highlights.map((h) => (
              <div
                key={h.title}
                className="reveal group overflow-hidden"
                style={{
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div className="h-56 overflow-hidden">
                  <img
                    src={h.img}
                    alt={h.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <div className="p-8">
                  <h3
                    className="text-white text-xl font-bold mb-3"
                    style={{ fontFamily: "'Playfair Display', serif" }}
                  >
                    {h.title}
                  </h3>
                  <p
                    className="text-white/45 text-sm leading-relaxed"
                    style={{ fontFamily: "'Lato', sans-serif" }}
                  >
                    {h.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Video in motion — large reels front and center */}
      <section style={{ background: "#080808", padding: "90px 0" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="reveal text-center max-w-2xl mx-auto mb-12">
            <p className="text-white/40 text-xs tracking-[0.3em] uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
              See It In Motion
            </p>
            <h2 className="text-white text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
              The energy of a full house
            </h2>
            <div className="accent-divider mx-auto mt-5" />
            <p className="text-white/50 text-base leading-relaxed mt-6" style={{ fontFamily: "'Lato', sans-serif" }}>
              From game nights to receptions, JVO comes alive when your people fill the
              room. Take a look — then picture your own event here.
            </p>
          </div>
          <div className="reveal grid grid-cols-2 gap-5 sm:gap-8 max-w-3xl mx-auto">
            {[
              { src: VIDEO.outdoorReel, poster: VIDEO_POSTER.outdoorReel },
              { src: VIDEO.gameNight, poster: VIDEO_POSTER.gameNight },
            ].map((v, i) => (
              <div
                key={i}
                className="overflow-hidden"
                style={{ border: "1px solid rgba(255,255,255,0.10)", background: "#000", borderRadius: "0.25rem" }}
              >
                <video
                  autoPlay
                  muted
                  loop
                  playsInline
                  poster={v.poster}
                  className="w-full"
                  style={{ display: "block", aspectRatio: "9 / 16", objectFit: "cover" }}
                >
                  <source src={v.src} type="video/mp4" />
                </video>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link to="/testimonials" className="reveal btn-white inline-block">
              Watch Testimonials
            </Link>
          </div>
        </div>
      </section>

      {/* Full-bleed showcase band */}
      <section
        className="relative bg-fixed bg-cover bg-center"
        style={{ backgroundImage: `url(/manus-storage/DSC00327-HDR.jpg)`, height: "60vh", minHeight: "420px" }}
      >
        <div className="absolute inset-0" style={{ background: "rgba(8,8,8,0.55)" }} />
        <div className="relative z-10 h-full flex items-center justify-center text-center px-6">
          <div className="max-w-2xl">
            <h2
              className="reveal text-white text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Your event, your way
            </h2>
            <div className="reveal accent-divider mx-auto mt-5" />
            <p
              className="reveal text-white/70 text-base sm:text-lg mt-6"
              style={{ fontFamily: "'Lato', sans-serif" }}
            >
              An open canvas with warm wood, natural light, and room to bring your vision to life.
            </p>
          </div>
        </div>
      </section>

      {/* Corporate events — video background */}
      <section className="relative overflow-hidden" style={{ minHeight: "640px" }}>
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          poster={VIDEO_POSTER.cookup}
        >
          <source src={VIDEO.cookupBg} type="video/mp4" />
        </video>
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,8,8,0.78) 0%, rgba(8,8,8,0.62) 45%, rgba(8,8,8,0.85) 100%)",
          }}
        />
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <div className="reveal">
              <p
                className="text-white/55 text-xs tracking-[0.3em] uppercase mb-4"
                style={{ fontFamily: "'Lato', sans-serif" }}
              >
                Corporate Events
              </p>
              <h2
                className="text-white text-4xl sm:text-5xl font-bold leading-[1.1]"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Host Your
                <br />
                Corporate Event
              </h2>
              <div className="accent-divider mt-6" />
              <p
                className="text-white/70 text-base sm:text-lg leading-relaxed mt-6 max-w-lg"
                style={{ fontFamily: "'Lato', sans-serif" }}
              >
                Meetings, mixers, team gatherings, product launches, and company
                celebrations — JVO gives your business a polished, flexible space with
                room to impress. Bring your own catering and vendors, or keep it simple.
              </p>
              <Link to="/book" className="btn-white mt-9 inline-block">
                Host Your Event
              </Link>
            </div>

            {/* Pricing card */}
            <div
              className="reveal lg:ml-auto w-full max-w-md p-8"
              style={{
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(8,8,8,0.45)",
                backdropFilter: "blur(6px)",
              }}
            >
              <div
                className="text-white/50 text-xs tracking-[0.25em] uppercase mb-6"
                style={{ fontFamily: "'Lato', sans-serif" }}
              >
                Corporate Packages
              </div>
              {[
                { label: "Half Day", sub: "5 hours", value: "$800" },
                { label: "Full Day", sub: "10 hours", value: "$1,300" },
                { label: "Deposit to Reserve", sub: "Applied to your total", value: "$150" },
              ].map((p) => (
                <div
                  key={p.label}
                  className="flex items-center justify-between py-4"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.10)" }}
                >
                  <div>
                    <div
                      className="text-white text-base font-bold"
                      style={{ fontFamily: "'Playfair Display', serif" }}
                    >
                      {p.label}
                    </div>
                    <div
                      className="text-white/40 text-xs tracking-wide uppercase mt-0.5"
                      style={{ fontFamily: "'Lato', sans-serif" }}
                    >
                      {p.sub}
                    </div>
                  </div>
                  <div
                    className="text-white text-xl font-bold"
                    style={{ fontFamily: "'Lato', sans-serif" }}
                  >
                    {p.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section style={{ background: "#080808", padding: "90px 0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2 items-center">
            <div className="reveal">
              <p
                className="text-white/40 text-xs tracking-[0.3em] uppercase mb-3"
                style={{ fontFamily: "'Lato', sans-serif" }}
              >
                Simple, Transparent Pricing
              </p>
              <h2
                className="text-white text-3xl sm:text-4xl font-bold leading-tight"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Book the time you need
              </h2>
              <div className="accent-divider mt-5" />
              <p
                className="text-white/50 text-base leading-relaxed mt-6"
                style={{ fontFamily: "'Lato', sans-serif" }}
              >
                Reserve a half or full day. A $150 deposit secures your date — the rest
                is due closer to your event.
              </p>
              <Link to="/book" className="btn-white mt-8 inline-block">
                Check Availability
              </Link>
            </div>

            <div className="reveal space-y-4">
              {[
                { label: "Half Day", sub: "5 hours", value: "$800" },
                { label: "Full Day", sub: "10 hours", value: "$1,300" },
                { label: "Deposit to Reserve", sub: "Applied to your total", value: "$150" },
              ].map((p) => (
                <div
                  key={p.label}
                  className="flex items-center justify-between p-6"
                  style={{
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div>
                    <div
                      className="text-white text-lg font-bold"
                      style={{ fontFamily: "'Playfair Display', serif" }}
                    >
                      {p.label}
                    </div>
                    <div
                      className="text-white/40 text-xs tracking-wide uppercase mt-1"
                      style={{ fontFamily: "'Lato', sans-serif" }}
                    >
                      {p.sub}
                    </div>
                  </div>
                  <div
                    className="text-white text-2xl font-bold"
                    style={{ fontFamily: "'Lato', sans-serif" }}
                  >
                    {p.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section style={{ background: "#0b0b0b", padding: "80px 0" }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2
            className="reveal text-white text-3xl sm:text-4xl lg:text-5xl font-bold"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Ready to reserve your date?
          </h2>
          <p
            className="reveal text-white/50 text-base mt-5 max-w-xl mx-auto"
            style={{ fontFamily: "'Lato', sans-serif" }}
          >
            Tell us about your event and we'll confirm availability within 24 hours.
          </p>
          <Link to="/book" className="reveal btn-white mt-8 inline-block">
            Book Now
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
