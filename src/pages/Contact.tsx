import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useReveal } from "@/lib/useReveal";

export default function Contact() {
  useReveal();

  return (
    <div style={{ background: "#080808", minHeight: "100vh" }}>
      <Navbar />

      {/* Hero */}
      <section className="relative flex items-end" style={{ height: "50vh", minHeight: "360px" }}>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(/manus-storage/DSC00252-HDR.jpg)` }}
        />
        <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.72)" }} />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 w-full">
          <p
            className="text-white/40 text-xs tracking-[0.3em] uppercase mb-2"
            style={{ fontFamily: "'Lato', sans-serif" }}
          >
            Get In Touch
          </p>
          <h1
            className="text-white text-4xl sm:text-5xl lg:text-6xl font-bold"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Contact
          </h1>
          <div className="accent-divider mt-4" />
        </div>
      </section>

      {/* Content */}
      <section style={{ background: "#080808", padding: "80px 0" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2">
            {/* Details */}
            <div className="reveal">
              <h2
                className="text-white text-2xl sm:text-3xl font-bold mb-4"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                We'd love to hear from you
              </h2>
              <p
                className="text-white/50 text-base leading-relaxed mb-10 max-w-lg"
                style={{ fontFamily: "'Lato', sans-serif" }}
              >
                Questions about availability, packages, or planning your event? Reach out —
                or start a booking inquiry and we'll respond within 24 hours.
              </p>

              <div className="space-y-7">
                <div>
                  <div
                    className="text-white/30 text-xs tracking-widest uppercase mb-2"
                    style={{ fontFamily: "'Lato', sans-serif" }}
                  >
                    Phone
                  </div>
                  <a
                    href="tel:+16785194723"
                    className="text-white/70 text-lg hover:text-white transition-colors"
                    style={{ fontFamily: "'Lato', sans-serif" }}
                  >
                    678-519-4723
                  </a>
                </div>

                <div>
                  <div
                    className="text-white/30 text-xs tracking-widest uppercase mb-2"
                    style={{ fontFamily: "'Lato', sans-serif" }}
                  >
                    Email
                  </div>
                  <a
                    href="mailto:jonesborovirtualoffice@gmail.com"
                    className="text-white/70 text-lg hover:text-white transition-colors"
                    style={{ fontFamily: "'Lato', sans-serif" }}
                  >
                    jonesborovirtualoffice@gmail.com
                  </a>
                </div>

                <div>
                  <div
                    className="text-white/30 text-xs tracking-widest uppercase mb-2"
                    style={{ fontFamily: "'Lato', sans-serif" }}
                  >
                    Website
                  </div>
                  <a
                    href="https://www.jvoevents.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/70 text-lg hover:text-white transition-colors"
                    style={{ fontFamily: "'Lato', sans-serif" }}
                  >
                    www.jvoevents.com
                  </a>
                </div>

                <div>
                  <div
                    className="text-white/30 text-xs tracking-widest uppercase mb-2"
                    style={{ fontFamily: "'Lato', sans-serif" }}
                  >
                    Instagram
                  </div>
                  <a
                    href="https://www.instagram.com/jvoevents/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-white/70 text-lg hover:text-white transition-colors"
                    style={{ fontFamily: "'Lato', sans-serif" }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2" y="2" width="20" height="20" rx="5.5" />
                      <circle cx="12" cy="12" r="4" />
                      <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
                    </svg>
                    @jvoevents
                  </a>
                </div>

                <div>
                  <div
                    className="text-white/30 text-xs tracking-widest uppercase mb-2"
                    style={{ fontFamily: "'Lato', sans-serif" }}
                  >
                    Location
                  </div>
                  <div
                    className="text-white/70 text-lg"
                    style={{ fontFamily: "'Lato', sans-serif" }}
                  >
                    Jonesboro, Georgia
                  </div>
                </div>
              </div>

              <Link to="/book" className="btn-white mt-10 inline-block">
                Start a Booking Inquiry
              </Link>
            </div>

            {/* Map */}
            <div className="reveal">
              <div
                className="w-full h-full min-h-[380px] overflow-hidden"
                style={{ border: "1px solid rgba(255,255,255,0.10)" }}
              >
                <iframe
                  title="JVO Events location — Jonesboro, Georgia"
                  src="https://www.google.com/maps?q=127+Jonesboro+Rd,+Jonesboro,+GA+30236&output=embed"
                  width="100%"
                  height="100%"
                  style={{ border: 0, minHeight: "380px", filter: "grayscale(1) invert(0.92) contrast(0.9)" }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
