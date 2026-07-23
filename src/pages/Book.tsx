import { useEffect, useRef } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useReveal } from "@/lib/useReveal";
import { IS_WEDDINGS_SITE } from "@/lib/siteMode";

/**
 * JotForm registration forms — events and weddings are separate forms so each
 * inquiry lands in the right pipeline. The weddings deployment must NEVER show
 * the events form (and vice versa).
 */
const EVENTS_JOTFORM_ID = "222155218269153";
const WEDDINGS_JOTFORM_ID = "261945498570168";
const JOTFORM_ID = IS_WEDDINGS_SITE ? WEDDINGS_JOTFORM_ID : EVENTS_JOTFORM_ID;
const JOTFORM_SRC = `https://form.jotform.com/${JOTFORM_ID}`;
/** After the form is submitted, send the guest here to pay the $150 deposit. */
const CHEDDARUP_DEPOSIT_URL =
  "https://my.cheddarup.com/c/jvo-event-security-deposit/items";

export default function BookingPage() {
  useReveal();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // Only trust messages coming from the JotForm iframe.
      if (e.origin && !/jotform\.com/.test(e.origin)) return;

      const data = e.data;

      // 1) Auto-resize the iframe — JotForm posts "setHeight:<px>:<formId>".
      if (typeof data === "string" && data.startsWith("setHeight")) {
        const height = Number(data.split(":")[1]);
        if (iframeRef.current && height > 0) {
          iframeRef.current.style.height = `${height}px`;
        }
        return;
      }

      // 2) On a completed submission JotForm posts a "submission-completed" /
      //    "submission-end" signal (as a string, or an object with `.action`).
      //    Send the guest straight to Cheddar Up to pay the deposit / add weather.
      const looksComplete = (s: unknown): boolean =>
        typeof s === "string" && /submission-(completed|end)|thank[\s-]?you/i.test(s);
      const action =
        data && typeof data === "object" ? (data as { action?: unknown }).action : undefined;
      // Weddings inquiries don't pay the events security deposit — the team
      // follows up personally, so stay on the JotForm thank-you screen.
      if (!IS_WEDDINGS_SITE && (looksComplete(action) || looksComplete(data))) {
        window.location.href = CHEDDARUP_DEPOSIT_URL;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div style={{ background: "#080808", minHeight: "100vh" }}>
      <Navbar />

      {/* Page Hero */}
      <section className="relative flex items-end" style={{ height: "50vh", minHeight: "360px" }}>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(/manus-storage/DSC00342-HDR.jpg)` }}
        />
        <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.72)" }} />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 w-full">
          <p className="text-white/40 text-xs tracking-[0.3em] uppercase mb-2" style={{ fontFamily: "'Lato', sans-serif" }}>
            Reserve Your Date
          </p>
          <h1 className="text-white text-4xl sm:text-5xl lg:text-6xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
            Book Now
          </h1>
          <div className="accent-divider mt-4" />
        </div>
      </section>

      {/* Booking form */}
      <section style={{ background: "#080808", padding: "70px 0" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="reveal text-center mb-10">
            <h2 className="text-white text-2xl sm:text-3xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
              {IS_WEDDINGS_SITE ? "Reserve Your Wedding Date" : "Reserve the Outdoor Event Center"}
            </h2>
            <div className="accent-divider mx-auto mt-5" />
            <p className="text-white/50 text-base leading-relaxed mt-6 max-w-xl mx-auto" style={{ fontFamily: "'Lato', sans-serif" }}>
              {IS_WEDDINGS_SITE
                ? "Tell us about your special day in the quick form below — no account needed. We'll be in touch to create a personalized experience."
                : "Tell us about your event in the quick form below — no account needed. When you submit, we'll take you straight to pay your $150 security deposit."}
            </p>
          </div>

          <div
            className="reveal"
            style={{ background: "#fff", borderRadius: "0.25rem", overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)" }}
          >
            <iframe
              ref={iframeRef}
              title={IS_WEDDINGS_SITE ? "JVO Weddings Registration Form" : "JVO Event Space Registration Form"}
              src={JOTFORM_SRC}
              style={{ width: "100%", border: "none", minHeight: "1000px", display: "block" }}
              scrolling="no"
              allow="geolocation; microphone; camera; fullscreen; payment"
            />
          </div>

          <div className="text-center mt-10 space-y-2">
            <a href="mailto:eventsjvo@gmail.com" className="block text-white/50 text-sm hover:text-white/80 transition-colors" style={{ fontFamily: "'Lato', sans-serif" }}>
              Questions? eventsjvo@gmail.com
            </a>
            <div className="text-white/40 text-sm" style={{ fontFamily: "'Lato', sans-serif" }}>Jonesboro, Georgia</div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
