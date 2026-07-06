import { useState, type CSSProperties, type FormEvent } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useReveal } from "@/lib/useReveal";

/**
 * Book a Tour — schedules a 30-minute visit that posts to /api/book-tour, which
 * drops a timed appointment on the JVO Google Calendar and emails both the guest
 * and the venue. Tours run Mon–Fri, 9:00 AM–5:00 PM (last start 4:30 PM); the
 * slot list is kept in sync with the server guard in server.js.
 */
const SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let m = 9 * 60; m <= 16 * 60 + 30; m += 30) {
    const p = (n: number) => String(n).padStart(2, "0");
    out.push(`${p(Math.floor(m / 60))}:${p(m % 60)}`);
  }
  return out;
})();

/** "13:30" → "1:30 PM" */
function label12(hhmm: string): string {
  const [h, min] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
}

/** Local Date → YYYY-MM-DD (no UTC drift). */
function toYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "Saturday, August 16, 2025" from a local Date. */
function prettyDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function TourPage() {
  useReveal();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState<string>("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ date: Date; time: string } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast.error("Please add your name and email.");
      return;
    }
    if (!date) {
      toast.error("Please choose a tour date.");
      return;
    }
    if (!time) {
      toast.error("Please choose a tour time.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/book-tour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          tourDate: toYmd(date),
          tourTime: time,
          message: message.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error || "We couldn't schedule your tour. Please try again.");
        return;
      }
      setDone({ date, time });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      toast.error("Network error — please try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: "0.25rem",
    color: "#fff",
    padding: "0.85rem 1rem",
    fontFamily: "'Lato', sans-serif",
    fontSize: "0.95rem",
    outline: "none",
  };
  const labelStyle: CSSProperties = {
    display: "block",
    color: "rgba(255,255,255,0.55)",
    fontSize: "0.7rem",
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    marginBottom: "0.5rem",
    fontFamily: "'Lato', sans-serif",
  };

  return (
    <div style={{ background: "#080808", minHeight: "100vh" }}>
      <Navbar />

      {/* Page Hero */}
      <section className="relative flex items-end" style={{ height: "50vh", minHeight: "360px" }}>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(/manus-storage/DSC00332-HDR.jpg)` }}
        />
        <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.72)" }} />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 w-full">
          <p
            className="text-white/40 text-xs tracking-[0.3em] uppercase mb-2"
            style={{ fontFamily: "'Lato', sans-serif" }}
          >
            See the Space in Person
          </p>
          <h1
            className="text-white text-4xl sm:text-5xl lg:text-6xl font-bold"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Book a Tour
          </h1>
          <div className="accent-divider mt-4" />
        </div>
      </section>

      <section style={{ background: "#080808", padding: "70px 0" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {done ? (
            <div
              className="reveal text-center"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: "0.35rem",
                padding: "56px 32px",
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  margin: "0 auto 22px",
                  borderRadius: "999px",
                  border: "1px solid rgba(201,169,106,0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#c9a96a",
                  fontSize: "1.7rem",
                }}
              >
                ✓
              </div>
              <h2
                className="text-white text-2xl sm:text-3xl font-bold"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Your tour is booked
              </h2>
              <div className="accent-divider mx-auto mt-5" />
              <p
                className="text-white/60 text-base leading-relaxed mt-6"
                style={{ fontFamily: "'Lato', sans-serif" }}
              >
                We'll see you on <strong className="text-white">{prettyDate(done.date)}</strong> at{" "}
                <strong className="text-white">{label12(done.time)}</strong>. A confirmation is on its
                way to your email.
              </p>
              <button
                type="button"
                onClick={() => {
                  setDone(null);
                  setDate(undefined);
                  setTime("");
                  setName("");
                  setEmail("");
                  setPhone("");
                  setMessage("");
                }}
                className="btn-outline"
                style={{ marginTop: "2rem" }}
              >
                Book Another Tour
              </button>
            </div>
          ) : (
            <>
              <div className="reveal text-center mb-10">
                <h2
                  className="text-white text-2xl sm:text-3xl font-bold"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  Schedule your visit
                </h2>
                <div className="accent-divider mx-auto mt-5" />
                <p
                  className="text-white/50 text-base leading-relaxed mt-6 max-w-xl mx-auto"
                  style={{ fontFamily: "'Lato', sans-serif" }}
                >
                  Pick a day and time and we'll walk you through the Outdoor Event Center. Tours run
                  Monday–Friday and take about 30 minutes.
                </p>
              </div>

              <form
                onSubmit={handleSubmit}
                className="reveal"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: "0.35rem",
                  padding: "32px",
                }}
              >
                <div className="grid md:grid-cols-2 gap-8">
                  {/* Date */}
                  <div>
                    <span style={labelStyle}>Choose a date</span>
                    <div className="jvo-calendar">
                      <DayPicker
                        mode="single"
                        selected={date}
                        onSelect={(d) => {
                          setDate(d);
                          setTime("");
                        }}
                        disabled={[{ before: today }, { dayOfWeek: [0, 6] }]}
                        weekStartsOn={0}
                      />
                    </div>
                  </div>

                  {/* Time */}
                  <div>
                    <span style={labelStyle}>Choose a time</span>
                    {date ? (
                      <div className="grid grid-cols-3 gap-2">
                        {SLOTS.map((s) => {
                          const active = s === time;
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setTime(s)}
                              style={{
                                padding: "0.6rem 0.25rem",
                                borderRadius: "0.25rem",
                                fontFamily: "'Lato', sans-serif",
                                fontSize: "0.78rem",
                                letterSpacing: "0.02em",
                                cursor: "pointer",
                                transition: "all 0.2s ease",
                                background: active ? "#ffffff" : "rgba(255,255,255,0.04)",
                                color: active ? "#080808" : "rgba(255,255,255,0.75)",
                                border: active
                                  ? "1px solid #ffffff"
                                  : "1px solid rgba(255,255,255,0.14)",
                                fontWeight: active ? 700 : 400,
                              }}
                            >
                              {label12(s)}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p
                        className="text-white/35 text-sm"
                        style={{ fontFamily: "'Lato', sans-serif", paddingTop: "0.5rem" }}
                      >
                        Select a date first to see available times.
                      </p>
                    )}
                  </div>
                </div>

                {/* Contact */}
                <div className="grid md:grid-cols-2 gap-5 mt-9">
                  <div>
                    <label style={labelStyle} htmlFor="tour-name">
                      Full name *
                    </label>
                    <input
                      id="tour-name"
                      style={inputStyle}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label style={labelStyle} htmlFor="tour-email">
                      Email *
                    </label>
                    <input
                      id="tour-email"
                      type="email"
                      style={inputStyle}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label style={labelStyle} htmlFor="tour-phone">
                      Phone
                    </label>
                    <input
                      id="tour-phone"
                      type="tel"
                      style={inputStyle}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={labelStyle} htmlFor="tour-message">
                      Anything we should know?
                    </label>
                    <input
                      id="tour-message"
                      style={inputStyle}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="mt-9 flex flex-col items-center gap-3">
                  <button
                    type="submit"
                    className="btn-white"
                    style={{ opacity: submitting ? 0.6 : 1, cursor: submitting ? "wait" : "pointer" }}
                    disabled={submitting}
                  >
                    {submitting ? "Booking…" : "Confirm Tour"}
                  </button>
                  {date && time && (
                    <p
                      className="text-white/45 text-sm"
                      style={{ fontFamily: "'Lato', sans-serif" }}
                    >
                      {prettyDate(date)} · {label12(time)}
                    </p>
                  )}
                </div>
              </form>

              <div className="text-center mt-10 space-y-2">
                <a
                  href="mailto:jonesborovirtualoffice@gmail.com"
                  className="block text-white/50 text-sm hover:text-white/80 transition-colors"
                  style={{ fontFamily: "'Lato', sans-serif" }}
                >
                  Questions? jonesborovirtualoffice@gmail.com
                </a>
                <div className="text-white/40 text-sm" style={{ fontFamily: "'Lato', sans-serif" }}>
                  Jonesboro, Georgia
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
