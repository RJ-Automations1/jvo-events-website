import { useEffect, useRef, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AvailabilityCalendar, { prettyDate, toYmd } from "@/components/AvailabilityCalendar";
import DepositNotice from "@/components/DepositNotice";
import { useReveal } from "@/lib/useReveal";
import { IS_WEDDINGS_SITE } from "@/lib/siteMode";
import { DEPOSIT, depositLabel } from "@/lib/deposit";

/**
 * JotForm registration forms — events and weddings are separate forms so each
 * inquiry lands in the right pipeline. The weddings deployment must NEVER show
 * the events form (and vice versa).
 */
const EVENTS_JOTFORM_ID = "222155218269153";
const WEDDINGS_JOTFORM_ID = "261945498570168";
const JOTFORM_ID = IS_WEDDINGS_SITE ? WEDDINGS_JOTFORM_ID : EVENTS_JOTFORM_ID;
const JOTFORM_SRC = `https://form.jotform.com/${JOTFORM_ID}`;

/**
 * "Requested Event Date" (q102) on the weddings form, split into sub-fields —
 * prefilled from the availability calendar so the couple doesn't retype it.
 * Prefill is a convenience; the form still owns validation.
 */
function weddingFormSrc(date: Date): string {
  const [year, month, day] = toYmd(date).split("-");
  const p = new URLSearchParams({
    "requestedEvent[month]": month,
    "requestedEvent[day]": day,
    "requestedEvent[year]": year,
  });
  return `${JOTFORM_SRC}?${p.toString()}`;
}

export default function BookingPage() {
  useReveal();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // On the weddings site the form is gated behind the availability calendar:
  // pick a date we can honour first, then fill in the details. The events site
  // keeps its original single-step form.
  const [weddingDate, setWeddingDate] = useState<Date | undefined>(undefined);
  const showForm = !IS_WEDDINGS_SITE || !!weddingDate;
  const formStepRef = useRef<HTMLParagraphElement>(null);

  // Bring the form into view once a date unlocks it, so the next step is never
  // left below the fold on a phone.
  useEffect(() => {
    if (!weddingDate) return;
    const id = window.setTimeout(
      () => formStepRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      120
    );
    return () => window.clearTimeout(id);
  }, [weddingDate]);

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
      //    Send the guest straight to Cheddar Up to pay the deposit — that
      //    payment, not the form, is what actually holds the date. Each site
      //    has its own deposit and its own Cheddar Up collection.
      const looksComplete = (s: unknown): boolean =>
        typeof s === "string" && /submission-(completed|end)|thank[\s-]?you/i.test(s);
      const action =
        data && typeof data === "object" ? (data as { action?: unknown }).action : undefined;
      if (looksComplete(action) || looksComplete(data)) {
        window.location.href = DEPOSIT.url;
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
                ? `Start by choosing an available date on the calendar — then tell us about your special day. When you submit, we'll take you straight to pay your ${depositLabel} deposit, which is what holds your date.`
                : `Tell us about your event in the quick form below — no account needed. When you submit, we'll take you straight to pay your ${depositLabel} security deposit.`}
            </p>
          </div>

          {/* Step 1 (weddings only) — check availability before the form opens. */}
          {IS_WEDDINGS_SITE && (
            <div
              className="reveal mb-8"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: "0.35rem", padding: "32px 24px" }}
            >
              <p className="text-[#c9a96a] text-[0.65rem] tracking-[0.25em] uppercase text-center mb-1" style={{ fontFamily: "'Lato', sans-serif" }}>
                Step 1 · Check Availability
              </p>
              <h3 className="text-white text-xl font-bold text-center mb-7" style={{ fontFamily: "'Playfair Display', serif" }}>
                Choose your wedding date
              </h3>

              <AvailabilityCalendar selected={weddingDate} onSelect={setWeddingDate} />

              {weddingDate && (
                <div
                  className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 mt-7 px-5 py-4"
                  style={{ border: "1px solid rgba(201,169,106,0.45)", background: "rgba(201,169,106,0.08)" }}
                >
                  <span className="text-white text-sm" style={{ fontFamily: "'Lato', sans-serif" }}>
                    <span className="text-[#c9a96a]">✓</span> Your date:{" "}
                    <strong>{prettyDate(weddingDate)}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setWeddingDate(undefined)}
                    className="text-white/55 text-xs tracking-[0.15em] uppercase hover:text-white transition-colors"
                    style={{ fontFamily: "'Lato', sans-serif", textDecoration: "underline" }}
                  >
                    Change date
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Deposit terms — stated before the form, since paying it is what
              actually holds the date and the money is non-refundable. */}
          {IS_WEDDINGS_SITE && (
            <div className="reveal mb-8">
              <DepositNotice />
            </div>
          )}

          {IS_WEDDINGS_SITE && showForm && (
            <p
              ref={formStepRef}
              className="text-[#c9a96a] text-[0.65rem] tracking-[0.25em] uppercase text-center mb-4"
              style={{ fontFamily: "'Lato', sans-serif", scrollMarginTop: "90px" }}
            >
              Step 2 · Your Details
            </p>
          )}

          {showForm ? (
            <div
              className="reveal"
              style={{ background: "#fff", borderRadius: "0.25rem", overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)" }}
            >
              <iframe
                ref={iframeRef}
                // Keyed by date so changing it rebuilds the form with the new prefill.
                key={weddingDate ? toYmd(weddingDate) : "form"}
                title={IS_WEDDINGS_SITE ? "JVO Weddings Registration Form" : "JVO Event Space Registration Form"}
                src={weddingDate ? weddingFormSrc(weddingDate) : JOTFORM_SRC}
                style={{ width: "100%", border: "none", minHeight: "1000px", display: "block" }}
                scrolling="no"
                allow="geolocation; microphone; camera; fullscreen; payment"
              />
            </div>
          ) : (
            <p className="text-white/35 text-sm text-center" style={{ fontFamily: "'Lato', sans-serif" }}>
              Pick an available date above and the reservation form will open right here.
            </p>
          )}

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
