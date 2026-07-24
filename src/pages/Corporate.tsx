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

/** House rules — transcribed from the venue's posted Event Rules & Conditions sign. */
const rules = [
  {
    title: "No loitering in parking lot",
    body: "Guests must enter the venue upon arrival and may not congregate or linger in parking areas.",
  },
  {
    title: "No access inside building including kitchen",
    body: "Access is limited to designated rental areas only. Entry into any other part of the building is prohibited.",
  },
  {
    title: "No confetti or popped balloons",
    body: "Use of confetti or balloons that may pop is prohibited. Violations will result in loss of security deposit.",
  },
  {
    title: "No animals unless pre-approved",
    body: "No animals are permitted unless prior written approval is obtained.",
  },
  {
    title: "Return space exactly how it was found",
    body: "All decorations, trash, and event items must be removed. All furniture must be returned to its original placement.",
  },
  {
    title: "Only pre-approved outside items & vendors",
    body: "All outside items (tables, chairs, bounce houses, merchandise vendors, DJs, photo booths, food trucks, etc.) require prior written approval.",
  },
  {
    title: "No selling alcohol without a city permit",
    body: "Alcohol sales are prohibited unless a valid city permit and required documentation are provided.",
  },
  {
    title: "Speakers must face Jonesboro Rd.",
    body: "All sound equipment must be positioned to minimize noise impact on neighboring properties.",
  },
  {
    title: "Adhere to DJ rules",
    body: "All DJs must comply with venue-provided guidelines regarding volume, operating times, and equipment.",
  },
  {
    title: "45 car limit in parking area",
    body: "Parking is limited to 45 vehicles maximum.",
  },
];

export default function Corporate() {
  useReveal();
  const heroRef = useRef<HTMLVideoElement>(null);
  useUnmuteOnInteraction(heroRef);

  return (
    <div style={{ background: "#080808", minHeight: "100vh" }}>
      <Navbar />

      {/* Video hero — the outdoor clip that opens on the entrance door. */}
      <section className="relative flex items-center overflow-hidden" style={{ minHeight: "70vh" }}>
        <video
          ref={heroRef}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          poster={VIDEO_POSTER.cookupBgOutdoor}
        >
          <source src={VIDEO.cookupBg} type="video/mp4" />
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
              date — and you can add weather insurance for extra peace of mind.
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-9">
              <Link to="/book" className="btn-white">
                Book Your Event
              </Link>
              <Link to="/venue" className="btn-outline">
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
              to the property. If you cancel your event within <span className="text-white/80 font-semibold">30 days</span> of
              the event date, the deposit is <span className="text-white/80 font-semibold">forfeited</span>.
            </p>
          </div>

          {/* Weather insurance add-on */}
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
                  Weather Insurance
                </span>
              </div>
              <div className="text-white text-3xl font-bold" style={{ fontFamily: "'Lato', sans-serif" }}>$99</div>
            </div>
            <div className="accent-divider mt-4" />
            <p className="text-white/55 text-sm sm:text-base leading-relaxed mt-5" style={{ fontFamily: "'Lato', sans-serif" }}>
              Weather insurance is an <span className="text-white font-semibold">optional</span> add-on. Add it to your booking and,
              in the event of inclement weather, cancel for a full refund or reschedule your
              event for another date.
            </p>
          </div>

          {/* Balances & payment policy */}
          <div
            className="reveal max-w-3xl mx-auto mt-5 p-8"
            style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
          >
            <div>
              <span className="text-[#c9a96a] text-[0.65rem] tracking-[0.25em] uppercase block mb-1" style={{ fontFamily: "'Lato', sans-serif" }}>
                Payment Policy
              </span>
              <span className="text-white text-xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
                Balances &amp; Payment
              </span>
            </div>
            <div className="accent-divider mt-4" />
            <ul className="text-white/55 text-sm sm:text-base leading-relaxed mt-5 space-y-3" style={{ fontFamily: "'Lato', sans-serif" }}>
              <li>
                Your full balance is due no later than <span className="text-white/80 font-semibold">14 days before</span> your
                event. If the balance is not paid in full by then, the event will be
                <span className="text-white/80 font-semibold"> canceled with no refund</span>.
              </li>
              <li>
                If you book your event within <span className="text-white/80 font-semibold">14 days</span> of the event date, the
                <span className="text-white/80 font-semibold"> full balance is required up front</span> at the time of booking.
              </li>
            </ul>
          </div>

          <div className="text-center mt-12">
            <Link to="/book" className="reveal btn-white inline-block">
              Book Your Event
            </Link>
          </div>
        </div>
      </section>

      {/* Event rules & conditions */}
      <section style={{ background: "#0b0b0b", padding: "90px 0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="reveal text-white/40 text-xs tracking-[0.3em] uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
              Please Review Before Booking
            </p>
            <h2 className="reveal text-white text-3xl sm:text-4xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
              Event Rules &amp; Conditions
            </h2>
            <div className="reveal accent-divider mx-auto mt-5" />
          </div>

          <div className="reveal grid gap-px sm:grid-cols-2" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {rules.map((r, i) => (
              <div key={r.title} className="flex gap-5 p-7" style={{ background: "#0b0b0b" }}>
                <span
                  className="shrink-0 text-2xl font-bold leading-none"
                  style={{ fontFamily: "'Playfair Display', serif", color: "#c9a96a" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-white text-base font-bold leading-snug" style={{ fontFamily: "'Playfair Display', serif" }}>
                    {r.title}
                  </h3>
                  <p className="text-white/50 text-sm leading-relaxed mt-2" style={{ fontFamily: "'Lato', sans-serif" }}>
                    {r.body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Respect + emergency contacts */}
          <div
            className="reveal text-center mt-10 px-6 py-9"
            style={{ border: "1px solid rgba(201,169,106,0.35)", background: "rgba(201,169,106,0.06)" }}
          >
            <p className="text-white text-lg sm:text-xl font-bold tracking-wide" style={{ fontFamily: "'Playfair Display', serif" }}>
              Respect the space and yourself
            </p>
            <div className="accent-divider mx-auto mt-4 mb-5" />
            <p className="text-[#c9a96a] text-xs tracking-[0.3em] uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
              Emergency Contacts
            </p>
            <p className="text-white/80 text-base sm:text-lg" style={{ fontFamily: "'Lato', sans-serif" }}>
              <a href="tel:+14047482055" className="hover:text-white transition-colors">404-748-2055</a>
              <span className="text-white/30 mx-3">&amp;</span>
              <a href="tel:+14042070953" className="hover:text-white transition-colors">404-207-0953</a>
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
