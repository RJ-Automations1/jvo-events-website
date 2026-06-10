import { useRef } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useReveal } from "@/lib/useReveal";
import { useUnmuteOnInteraction } from "@/lib/useUnmuteOnInteraction";
import { VIDEO } from "@/lib/media";

/**
 * More of what JVO hosts — shown as picture cards beneath the featured highlights.
 * Photos are real venue moments where we have them; the rest are styled to match
 * the open-air pavilion look.
 */
const hostedEvents = [
  {
    title: "Family Reunions",
    body: "Bring every generation together for a warm, memorable reunion with room to eat, play, and reconnect.",
    img: "/manus-storage/event-family-reunion.jpg",
  },
  {
    title: "Graduation Celebrations",
    body: "Honor the grad with a celebration as big as the achievement — decorate, gather, and toast to what's next.",
    img: "/manus-storage/event-graduation.jpg",
  },
  {
    title: "Corporate Events",
    body: "A polished setting for mixers, meetings, and team gatherings, with the flexibility your agenda needs.",
    img: "/manus-storage/event-corporate.jpg",
  },
  {
    title: "Pop-Up Shops & Vendors",
    body: "Host a pop-up market or vendor showcase with space for tables, browsing, and a steady flow of guests.",
    img: "/manus-storage/event-popup-vendors.jpg",
  },
  {
    title: "Anniversary Celebrations",
    body: "Mark the milestone in style with an elegant, intimate setting made for the people who matter most.",
    img: "/manus-storage/outdoor-decorated.jpg",
  },
  {
    title: "Taste Testings",
    body: "Showcase your menu or sample new flavors in a clean, inviting space built for food and conversation.",
    img: "/manus-storage/event-taste-testing.jpg",
  },
  {
    title: "Quinceañeras",
    body: "Celebrate her big day with a beautiful, photo-ready space to dance, dine, and make lasting memories.",
    img: "/manus-storage/event-quinceanera.jpg",
  },
  {
    title: "Retirement Parties",
    body: "Send them off in style with a relaxed, celebratory space to gather friends, family, and colleagues.",
    img: "/manus-storage/event-retirement.jpg",
  },
  {
    title: "Holiday Parties",
    body: "Gather your team or your loved ones for a festive holiday celebration under warm, twinkling lights.",
    img: "/manus-storage/event-holiday.jpg",
  },
  {
    title: "Networking Events",
    body: "Connect over good food and great company in a comfortable, professional setting made for mingling.",
    img: "/manus-storage/people-food.jpg",
  },
];

const highlights = [
  {
    title: "Weddings & Receptions",
    body: "A refined backdrop for your ceremony and celebration, with room to make the day entirely your own.",
    img: "/manus-storage/wedding-couple.jpg",
  },
  {
    title: "Game Nights & Socials",
    body: "Bring everyone together for game nights, mixers, and good food in a space built for fun.",
    img: "/manus-storage/people-jenga.jpg",
  },
  {
    title: "Birthday Parties",
    body: "From milestone birthdays to low-key celebrations, set the scene for the people who matter most.",
    img: "/manus-storage/birthday-happy.jpg",
  },
  {
    title: "Gender Reveals",
    body: "Share the big moment with family and friends in a bright, photo-ready space made for it.",
    img: "/manus-storage/event-gender-reveal.png",
  },
  {
    title: "Baby Showers",
    body: "An intimate, polished setting to celebrate what's coming next, with room to decorate your way.",
    img: "/manus-storage/event-baby-shower.png",
  },
  {
    title: "Private Celebrations",
    body: "Graduations, anniversaries, and milestones — a versatile space that shapes around your vision.",
    img: "/manus-storage/people-food.jpg",
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
        {/* Video background — the outdoor reel, played straight as the hero (no poster,
            black until the first frame). */}
        <video
          ref={heroRef}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ background: "#080808" }}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        >
          <source src={VIDEO.outdoorReel} type="video/mp4" />
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
              Create Your
              <br />
              Vibe at JVO
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

      {/* What we host — every event as a picture card, flowing right under the
          intro so the highlights and the full list read as one continuous set. */}
      <section style={{ background: "#0b0b0b", padding: "90px 0" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-3">
            {[...highlights, ...hostedEvents].map((h) => (
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

      {/* Our story */}
      <section style={{ background: "#080808", padding: "90px 0" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <div className="reveal overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <img
                src="/manus-storage/people-ribbon.jpg"
                alt="JVO Events ribbon-cutting celebration with the owners and community"
                loading="lazy"
                className="w-full h-full object-cover"
                style={{ minHeight: "340px" }}
              />
            </div>
            <div>
              <p className="reveal text-white/40 text-xs tracking-[0.3em] uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
                Who We Are
              </p>
              <h2
                className="reveal text-white text-3xl sm:text-4xl font-bold leading-tight"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Our story
              </h2>
              <div className="reveal accent-divider mt-5" />
              <div
                className="reveal text-white/55 text-base sm:text-lg leading-relaxed mt-7 space-y-5"
                style={{ fontFamily: "'Lato', sans-serif" }}
              >
                <p>
                  JVO Events is a Jonesboro, Georgia venue built around a simple idea: your
                  celebration should feel effortless. We provide a clean, elegant, and flexible
                  space — and the freedom to make it your own.
                </p>
                <p>
                  Whether you're planning a wedding, a milestone birthday, or a corporate
                  gathering, our half-day and full-day packages give you the time and the canvas
                  to bring your event to life.
                </p>
              </div>
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
