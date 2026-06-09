import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useReveal } from "@/lib/useReveal";

const services = [
  { title: "Weddings & Receptions", body: "Ceremony and reception space with the flexibility to bring in your own vendors and vision." },
  { title: "Birthday Parties", body: "From milestone birthdays to intimate gatherings, a polished setting for any celebration." },
  { title: "Corporate Events", body: "Meetings, mixers, trainings, and company celebrations in a professional environment." },
  { title: "Graduation Parties", body: "Celebrate the achievement with friends and family in a space that feels special." },
];

const included = [
  "Flexible, open floor plan",
  "Tables and seating",
  "Ambient lighting",
  "On-site parking",
  "Restroom facilities",
  "Setup & teardown windows",
];

export default function About() {
  useReveal();

  return (
    <div style={{ background: "#080808", minHeight: "100vh" }}>
      <Navbar />

      {/* Hero */}
      <section className="relative flex items-end" style={{ height: "50vh", minHeight: "360px" }}>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(/manus-storage/DSC00294-HDR.jpg)` }}
        />
        <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.72)" }} />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 w-full">
          <p
            className="text-white/40 text-xs tracking-[0.3em] uppercase mb-2"
            style={{ fontFamily: "'Lato', sans-serif" }}
          >
            Who We Are
          </p>
          <h1
            className="text-white text-4xl sm:text-5xl lg:text-6xl font-bold"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            About & Services
          </h1>
          <div className="accent-divider mt-4" />
        </div>
      </section>

      {/* Story */}
      <section style={{ background: "#080808", padding: "90px 0" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <div className="reveal overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <img
                src="/manus-storage/DSC00277-HDR.jpg"
                alt="The walkway and grounds at JVO Events"
                loading="lazy"
                className="w-full h-full object-cover"
                style={{ minHeight: "340px" }}
              />
            </div>
            <div>
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

      {/* Services */}
      <section style={{ background: "#0b0b0b", padding: "90px 0" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p
            className="reveal text-white/40 text-xs tracking-[0.3em] uppercase mb-3 text-center"
            style={{ fontFamily: "'Lato', sans-serif" }}
          >
            What We Host
          </p>
          <h2
            className="reveal text-white text-3xl sm:text-4xl font-bold text-center"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Events we love to host
          </h2>
          <div className="grid gap-6 md:grid-cols-2 mt-12">
            {services.map((s) => (
              <div
                key={s.title}
                className="reveal p-8"
                style={{
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <h3
                  className="text-white text-xl font-bold mb-3"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  {s.title}
                </h3>
                <p
                  className="text-white/45 text-sm leading-relaxed"
                  style={{ fontFamily: "'Lato', sans-serif" }}
                >
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Packages + What's included */}
      <section style={{ background: "#080808", padding: "90px 0" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2">
            {/* Packages */}
            <div className="reveal">
              <h2
                className="text-white text-2xl sm:text-3xl font-bold mb-6"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Packages
              </h2>
              <div className="space-y-4">
                {[
                  { label: "Half Day", sub: "5 hours", value: "$800" },
                  { label: "Full Day", sub: "10 hours", value: "$1,300" },
                  { label: "Deposit to Reserve", sub: "Applied to your total", value: "$150" },
                ].map((p) => (
                  <div
                    key={p.label}
                    className="flex items-center justify-between p-5"
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
                      className="text-white text-xl font-bold"
                      style={{ fontFamily: "'Lato', sans-serif" }}
                    >
                      {p.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Included */}
            <div className="reveal">
              <h2
                className="text-white text-2xl sm:text-3xl font-bold mb-6"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                What's included
              </h2>
              <ul className="space-y-4">
                {included.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-3 py-2"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <span className="text-white/70">—</span>
                    <span
                      className="text-white/55 text-sm"
                      style={{ fontFamily: "'Lato', sans-serif" }}
                    >
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
              <Link to="/book" className="btn-white mt-8 inline-block">
                Reserve Your Date
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
