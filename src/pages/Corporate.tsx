import { useRef } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useReveal } from "@/lib/useReveal";
import { useUnmuteOnInteraction } from "@/lib/useUnmuteOnInteraction";
import { VIDEO, VIDEO_POSTER } from "@/lib/media";

/** Core rental packages. */
const packages = [
  { label: "Half Day", sub: "5 hours", value: "$800" },
  { label: "Full Day", sub: "10 hours", value: "$1,300" },
];

export default function Corporate() {
  useReveal();
  const heroRef = useRef<HTMLVideoElement>(null);
  useUnmuteOnInteraction(heroRef);

  return (
    <div style={{ background: "#080808", minHeight: "100vh" }}>
      <Navbar />

      {/* Video hero — the outdoor reel: gate opens past the JVO Outdoor Events
          sign and walks straight into the space (no interior footage). */}
      <section className="relative flex items-center overflow-hidden" style={{ minHeight: "70vh" }}>
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
              Half Day · Full Day · Add-Ons
            </p>
            <h1 className="text-white text-5xl sm:text-6xl font-bold leading-[1.05]" style={{ fontFamily: "'Playfair Display', serif" }}>
              Pricing
            </h1>
            <div className="accent-divider mt-6" />
            <p className="text-white/70 text-base sm:text-lg leading-relaxed mt-6 max-w-xl" style={{ fontFamily: "'Lato', sans-serif" }}>
              Reserve a half or full day at JVO. A refundable security deposit secures your
              date — and you can add weather assurance for extra peace of mind.
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-9">
              <Link to="/book" className="btn-white">
                Book Your Event
              </Link>
              <Link to="/gallery" className="btn-outline">
                View Space
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section style={{ background: "#080808", padding: "90px 0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="reveal text-white/40 text-xs tracking-[0.3em] uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
              Event Packages
            </p>
            <h2 className="reveal text-white text-3xl sm:text-4xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
              Simple, transparent pricing
            </h2>
            <div className="reveal accent-divider mx-auto mt-5" />
          </div>

          {/* Half / Full day */}
          <div className="reveal grid gap-5 sm:grid-cols-2 max-w-3xl mx-auto">
            {packages.map((p) => (
              <div
                key={p.label}
                className="p-8 text-center"
                style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
              >
                <div className="text-white text-base font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>{p.label}</div>
                <div className="text-white/40 text-xs tracking-wide uppercase mt-1" style={{ fontFamily: "'Lato', sans-serif" }}>{p.sub}</div>
                <div className="text-white text-4xl font-bold mt-5" style={{ fontFamily: "'Lato', sans-serif" }}>{p.value}</div>
              </div>
            ))}
          </div>

          {/* Security deposit */}
          <div
            className="reveal max-w-3xl mx-auto mt-5 p-8"
            style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="text-[#c9a96a] text-[0.65rem] tracking-[0.25em] uppercase block mb-1" style={{ fontFamily: "'Lato', sans-serif" }}>
                  Separate · Refundable
                </span>
                <span className="text-white text-xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
                  Security Deposit
                </span>
              </div>
              <div className="text-white text-3xl font-bold" style={{ fontFamily: "'Lato', sans-serif" }}>$150</div>
            </div>
            <div className="accent-divider mt-4" />
            <p className="text-white/55 text-sm sm:text-base leading-relaxed mt-5" style={{ fontFamily: "'Lato', sans-serif" }}>
              The $150 security deposit is separate and <span className="text-white/80 font-semibold">not included</span> in the
              Half Day ($800) or Full Day ($1,300) rate. It's due at the time of booking to reserve your date,
              and is fully refunded to you after your event as long as the space is returned clean with no damage
              to the property.
            </p>
          </div>

          {/* Weather assurance add-on */}
          <div
            className="reveal max-w-3xl mx-auto mt-5 p-8"
            style={{ border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.045)" }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="text-[#c9a96a] text-[0.65rem] tracking-[0.25em] uppercase block mb-1" style={{ fontFamily: "'Lato', sans-serif" }}>
                  Optional Add-On
                </span>
                <span className="text-white text-xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
                  Weather Assurance
                </span>
              </div>
              <div className="text-white text-3xl font-bold" style={{ fontFamily: "'Lato', sans-serif" }}>$99</div>
            </div>
            <div className="accent-divider mt-4" />
            <p className="text-white/55 text-sm sm:text-base leading-relaxed mt-5" style={{ fontFamily: "'Lato', sans-serif" }}>
              Add weather assurance to your booking and, in the event of inclement weather,
              cancel for a full refund or reschedule your event for another date.
            </p>
          </div>

          <div className="text-center mt-12">
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
