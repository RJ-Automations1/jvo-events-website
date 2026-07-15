import { useRef } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useReveal } from "@/lib/useReveal";
import { VIDEO, VIDEO_POSTER } from "@/lib/media";

/** What's included in the Signature Wedding Package — straight from the package sheet. */
const included: { title: string; items: string[] }[] = [
  {
    title: "Venue Access",
    items: [
      "Indoor private bridal & groom preparation area",
      "Outdoor ceremony garden",
      "Outdoor kitchen with bar area",
      "Decorative pergola ceremony area",
    ],
  },
  {
    title: "Furniture & Equipment",
    items: [
      "100 white chair covers (included)",
      "4 60-inch banquet tables",
      "25 folding chairs",
      "2 6ft tables · 2 6ft rectangle tables",
      "2 highboy tables",
      "6 steam tables",
      "20 cocktail bar stools",
      "Bluetooth sound system",
      "Wireless microphone",
      "Complete setup & breakdown",
    ],
  },
  {
    title: "Professional Event Staffing",
    items: [
      "6 professional event staff members",
      "10-hour service day",
      "Chair & table setup",
      "Ceremony setup",
      "Indoor & outdoor ceremony preparation",
      "Event-day support",
      "Post-event breakdown & cleanup",
    ],
  },
];

/** Enhancements with a fixed price. */
const pricedEnhancements: { label: string; value: string }[] = [
  { label: "20×40 Premium Event Tent Package", value: "$1,500" },
  { label: "Luxury Flower Wall & Pergola Décor", value: "$850" },
  { label: "Wedding Rehearsal Coordination (5 hrs)", value: "$800" },
  { label: "Licensed Wedding Officiant", value: "$450" },
  { label: "Additional 100 Chairs with Chair Covers", value: "$250" },
  { label: "Additional 50 Chairs with Chair Covers", value: "$150" },
];

/** Enhancements quoted per event. */
const customQuoteEnhancements: string[] = [
  "Wedding Coordinator",
  "Day-of Coordinator",
  "Ceremony / Reception Decorator",
  "Luxury Floral Design",
  "Balloon Décor & Custom Backdrops",
  "Luxury Table Linens & Specialty Rentals",
];

/** Trusted preferred vendors we can connect you with. */
const preferredVendors: string[] = [
  "Professional Wedding Photography",
  "Wedding Videography",
  "DJ & Master of Ceremonies",
  "Live Music & Entertainment",
  "Full-Service Catering Coordination",
  "Bartending Services",
  "Licensed Bartenders",
  "Photo Booth Experience",
  "Custom Wedding",
];

/** Why couples choose JVO. */
const reasons: string[] = [
  "Elegant indoor and outdoor ceremony spaces",
  "100 premium covered chairs included",
  "Professional event staff included",
  "Beautiful pergola ceremony setting",
  "Outdoor kitchen",
  "Affordable luxury venue",
  "Access to trusted preferred vendors",
  "Stress-free setup and breakdown",
];

export default function Weddings() {
  useReveal();
  const heroRef = useRef<HTMLVideoElement>(null);

  return (
    <div style={{ background: "#080808", minHeight: "100vh" }}>
      <Navbar />

      {/* Video hero — a real JVO pergola wedding. */}
      <section className="relative flex items-center overflow-hidden" style={{ minHeight: "82vh" }}>
        <video
          ref={heroRef}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          poster={VIDEO_POSTER.wedding}
        >
          <source src={VIDEO.wedding} type="video/mp4" />
        </video>
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,8,8,0.7) 0%, rgba(8,8,8,0.5) 45%, rgba(8,8,8,0.92) 100%)",
          }}
        />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="max-w-2xl">
            <p className="text-white/55 text-xs sm:text-sm tracking-[0.3em] uppercase mb-4" style={{ fontFamily: "'Lato', sans-serif" }}>
              The JVO Signature Wedding Experience
            </p>
            <h1 className="text-white text-5xl sm:text-6xl font-bold leading-[1.05]" style={{ fontFamily: "'Playfair Display', serif" }}>
              Say “I do” at JVO
            </h1>
            <div className="accent-divider mt-6" />
            <p className="text-white/70 text-base sm:text-lg leading-relaxed mt-6 max-w-xl" style={{ fontFamily: "'Lato', sans-serif" }}>
              An elegant indoor & outdoor venue, professional event staffing, and premium
              amenities — a seamless celebration from setup through breakdown, so you can
              focus on making memories.
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-9">
              <Link to="/book" className="btn-white">
                Book Your Wedding
              </Link>
              <Link to="/gallery" className="btn-outline">
                View the Venue
              </Link>
            </div>
            <p className="text-[#c9a96a] text-sm tracking-[0.25em] uppercase mt-8" style={{ fontFamily: "'Lato', sans-serif" }}>
              Packages starting at $4,000
            </p>
          </div>
        </div>
      </section>

      {/* Intro */}
      <section style={{ background: "#080808", padding: "90px 0" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="reveal text-white/40 text-xs tracking-[0.3em] uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
            One Venue · Ceremony &amp; Reception
          </p>
          <h2 className="reveal text-white text-3xl sm:text-4xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
            Celebrate your special day, all in one place
          </h2>
          <div className="reveal accent-divider mx-auto mt-5" />
          <p className="reveal text-white/60 text-base sm:text-lg leading-relaxed mt-6" style={{ fontFamily: "'Lato', sans-serif" }}>
            Our Signature Wedding Package combines a beautiful indoor and outdoor venue,
            professional event staffing, premium amenities, and personalized service from
            setup through breakdown. Whether you're planning an intimate ceremony or a grand
            celebration, JVO Event Space provides a seamless experience while allowing you to
            focus on making memories.
          </p>
        </div>
      </section>

      {/* What's included */}
      <section style={{ background: "#0b0b0b", padding: "90px 0" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="reveal text-white/40 text-xs tracking-[0.3em] uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
              Included in Every Package
            </p>
            <h2 className="reveal text-white text-3xl sm:text-4xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
              What's included
            </h2>
            <div className="reveal accent-divider mx-auto mt-5" />
          </div>

          <div className="reveal grid gap-px md:grid-cols-3" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {included.map((group) => (
              <div key={group.title} className="p-8" style={{ background: "#0b0b0b" }}>
                <h3 className="text-white text-lg font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
                  {group.title}
                </h3>
                <div className="accent-divider mt-4 mb-5" />
                <ul className="space-y-3">
                  {group.items.map((item) => (
                    <li key={item} className="flex gap-3 text-white/60 text-sm leading-relaxed" style={{ fontFamily: "'Lato', sans-serif" }}>
                      <span className="text-[#c9a96a] shrink-0">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Optional enhancements */}
      <section style={{ background: "#080808", padding: "90px 0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="reveal text-white/40 text-xs tracking-[0.3em] uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
              Make It Yours
            </p>
            <h2 className="reveal text-white text-3xl sm:text-4xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
              Optional wedding enhancements
            </h2>
            <div className="reveal accent-divider mx-auto mt-5" />
          </div>

          <div className="reveal grid gap-4 sm:grid-cols-2">
            {pricedEnhancements.map((e) => (
              <div
                key={e.label}
                className="flex items-baseline justify-between gap-4 p-6"
                style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
              >
                <span className="text-white/80 text-sm sm:text-base" style={{ fontFamily: "'Lato', sans-serif" }}>{e.label}</span>
                <span className="text-white text-xl font-bold shrink-0" style={{ fontFamily: "'Lato', sans-serif" }}>{e.value}</span>
              </div>
            ))}
          </div>

          {/* Custom-quote enhancements */}
          <div
            className="reveal mt-6 p-8"
            style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
          >
            <span className="text-[#c9a96a] text-[0.65rem] tracking-[0.25em] uppercase block mb-1" style={{ fontFamily: "'Lato', sans-serif" }}>
              Tailored to Your Day · Custom Quote
            </span>
            <h3 className="text-white text-xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
              Design &amp; décor services
            </h3>
            <div className="accent-divider mt-4 mb-5" />
            <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {customQuoteEnhancements.map((c) => (
                <div key={c} className="flex gap-3 text-white/60 text-sm leading-relaxed" style={{ fontFamily: "'Lato', sans-serif" }}>
                  <span className="text-[#c9a96a] shrink-0">•</span>
                  <span>{c}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Preferred vendors */}
      <section style={{ background: "#0b0b0b", padding: "90px 0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="reveal text-white/40 text-xs tracking-[0.3em] uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
              Trusted Partners
            </p>
            <h2 className="reveal text-white text-3xl sm:text-4xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
              Preferred vendor services
            </h2>
            <div className="reveal accent-divider mx-auto mt-5" />
            <p className="reveal text-white/55 text-sm sm:text-base leading-relaxed mt-5 max-w-2xl mx-auto" style={{ fontFamily: "'Lato', sans-serif" }}>
              We'll connect you with the trusted professionals we work with, so every detail
              of your day is covered.
            </p>
          </div>

          <div className="reveal grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {preferredVendors.map((v) => (
              <div
                key={v}
                className="flex items-center gap-3 px-5 py-4 text-white/75 text-sm"
                style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.025)", fontFamily: "'Lato', sans-serif" }}
              >
                <span className="text-[#c9a96a] shrink-0">✓</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why couples choose JVO */}
      <section style={{ background: "#080808", padding: "90px 0" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            {/* Image */}
            <div
              className="reveal w-full"
              style={{
                minHeight: "420px",
                backgroundImage: "url(/manus-storage/wedding-couple.jpg)",
                backgroundSize: "cover",
                backgroundPosition: "center",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
            {/* Reasons */}
            <div className="reveal">
              <p className="text-white/40 text-xs tracking-[0.3em] uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
                Why Couples Choose JVO
              </p>
              <h2 className="text-white text-3xl sm:text-4xl font-bold leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
                One-stop shop for outdoor weddings
              </h2>
              <div className="accent-divider mt-5" />
              <p className="text-white/60 text-base leading-relaxed mt-5" style={{ fontFamily: "'Lato', sans-serif" }}>
                Host your wedding and reception at the same venue — at an affordable price.
              </p>
              <ul className="mt-7 space-y-3">
                {reasons.map((r) => (
                  <li key={r} className="flex gap-3 text-white/70 text-sm sm:text-base" style={{ fontFamily: "'Lato', sans-serif" }}>
                    <span className="text-[#c9a96a] shrink-0">✓</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Imagine your wedding — closing CTA */}
      <section style={{ background: "#0b0b0b", padding: "100px 0" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="reveal text-white/40 text-xs tracking-[0.3em] uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
            Imagine Your Wedding at JVO
          </p>
          <h2 className="reveal text-white text-3xl sm:text-4xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
            A refined, worry-free celebration
          </h2>
          <div className="reveal accent-divider mx-auto mt-5" />
          <p className="reveal text-white/60 text-base sm:text-lg leading-relaxed mt-6" style={{ fontFamily: "'Lato', sans-serif" }}>
            Picture your guests arriving to a beautifully decorated pergola ceremony surrounded
            by elegant seating and luxurious floral décor. After exchanging vows, family and
            friends continue celebrating in our stylish venue while our professional team
            manages every detail behind the scenes. From setup to final cleanup, JVO Event Space
            makes your wedding unforgettable.
          </p>
          <div className="reveal flex flex-wrap items-center justify-center gap-4 mt-9">
            <Link to="/book" className="btn-white">
              Book Your Wedding
            </Link>
            <Link to="/contact" className="btn-outline">
              Ask a Question
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
