import { useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useReveal } from "@/lib/useReveal";
import { toast } from "sonner";

/** Local YYYY-MM-DD (avoids the UTC off-by-one of toISOString). */
function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
/** Parse a YYYY-MM-DD string into a local-midnight Date. */
function fromYMD(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export default function BookingPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    eventDate: "",
    eventType: "",
    package: "",
    guestCount: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bookedDates, setBookedDates] = useState<string[]>([]);

  // Shared scroll-reveal behavior (re-applies when the success view swaps in)
  useReveal([submitted]);

  // Load already-booked dates from the Google Calendar so we can grey them out.
  useEffect(() => {
    fetch("/api/availability")
      .then((r) => r.json())
      .then((d) => Array.isArray(d?.bookedDates) && setBookedDates(d.bookedDates))
      .catch(() => {
        /* availability is best-effort; the form still works without it */
      });
  }, []);

  const bookedDateObjects = useMemo(() => bookedDates.map(fromYMD), [bookedDates]);
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);
  const selectedDate = form.eventDate ? fromYMD(form.eventDate) : undefined;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.eventDate || !form.package) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "We couldn't submit your inquiry.");
      }

      setSubmitted(true);
      toast.success("Your inquiry has been submitted! We'll be in touch shortly.");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again or email info@jvoevents.com."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#ffffff",
    fontFamily: "'Lato', sans-serif",
    fontSize: "0.875rem",
    padding: "0.875rem 1rem",
    width: "100%",
    outline: "none",
    borderRadius: "0.125rem",
    transition: "border-color 0.2s",
  };

  const labelStyle = {
    display: "block",
    color: "rgba(255,255,255,0.45)",
    fontSize: "0.7rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    fontFamily: "'Lato', sans-serif",
    fontWeight: 700,
    marginBottom: "0.5rem",
  };

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

      {/* Booking Form */}
      <section style={{ background: "#080808", padding: "80px 0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-5 gap-12">
            {/* Info sidebar */}
            <div className="lg:col-span-2">
              <div className="reveal">
                <h2 className="text-white text-2xl font-bold mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
                  Let's Make It Happen
                </h2>
                <p className="text-white/45 text-sm leading-relaxed mb-8" style={{ fontFamily: "'Lato', sans-serif" }}>
                  Fill out the form and we'll get back to you within 24 hours to confirm availability and walk you through the booking process.
                </p>

                <div className="space-y-5">
                  {[
                    { label: "Half Day (5 hrs)", value: "$800" },
                    { label: "Full Day (10 hrs)", value: "$1,300" },
                    { label: "Deposit to Reserve", value: "$150" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between py-3"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
                    >
                      <span className="text-white/45 text-sm" style={{ fontFamily: "'Lato', sans-serif" }}>
                        {item.label}
                      </span>
                      <span className="text-white text-sm font-bold" style={{ fontFamily: "'Lato', sans-serif" }}>
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-8 space-y-3">
                  <div className="text-white/30 text-xs tracking-widest uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
                    Contact
                  </div>
                  <a
                    href="https://www.jvoevents.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-white/50 text-sm hover:text-white/80 transition-colors"
                    style={{ fontFamily: "'Lato', sans-serif" }}
                  >
                    www.jvoevents.com
                  </a>
                  <a
                    href="mailto:info@jvoevents.com"
                    className="block text-white/50 text-sm hover:text-white/80 transition-colors"
                    style={{ fontFamily: "'Lato', sans-serif" }}
                  >
                    info@jvoevents.com
                  </a>
                  <div className="text-white/50 text-sm" style={{ fontFamily: "'Lato', sans-serif" }}>
                    Jonesboro, Georgia
                  </div>
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="lg:col-span-3">
              {submitted ? (
                <div
                  className="reveal text-center py-16 px-8"
                  style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.02)" }}
                >
                  <div className="text-white text-4xl mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>✓</div>
                  <h3 className="text-white text-2xl font-bold mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>
                    Inquiry Received!
                  </h3>
                  <p className="text-white/45 text-sm" style={{ fontFamily: "'Lato', sans-serif" }}>
                    Thank you, {form.name}! We'll reach out within 24 hours to confirm your date.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="reveal space-y-5">
                  <div className="grid sm:grid-cols-2 gap-5">
                    <div>
                      <label style={labelStyle}>Full Name *</label>
                      <input
                        type="text"
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        placeholder="Your full name"
                        style={inputStyle}
                        required
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Email *</label>
                      <input
                        type="email"
                        name="email"
                        value={form.email}
                        onChange={handleChange}
                        placeholder="your@email.com"
                        style={inputStyle}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Phone Number</label>
                    <input
                      type="tel"
                      name="phone"
                      value={form.phone}
                      onChange={handleChange}
                      placeholder="(555) 000-0000"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Event Date *</label>
                    <div
                      className="jvo-calendar"
                      style={{
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.04)",
                        borderRadius: "0.125rem",
                        padding: "0.5rem 0.25rem",
                      }}
                    >
                      <DayPicker
                        mode="single"
                        selected={selectedDate}
                        onSelect={(d) =>
                          setForm((f) => ({ ...f, eventDate: d ? toYMD(d) : "" }))
                        }
                        disabled={[{ before: today }, ...bookedDateObjects]}
                        modifiers={{ booked: bookedDateObjects }}
                        modifiersClassNames={{ booked: "rdp-booked" }}
                        startMonth={today}
                      />
                    </div>
                    <div
                      className="flex items-center gap-5 mt-3 text-xs"
                      style={{ fontFamily: "'Lato', sans-serif", color: "rgba(255,255,255,0.4)" }}
                    >
                      <span className="flex items-center gap-2">
                        <span style={{ width: 10, height: 10, background: "#ffffff", borderRadius: 2, display: "inline-block" }} />
                        Selected
                      </span>
                      <span className="flex items-center gap-2">
                        <span style={{ width: 10, height: 10, background: "rgba(220,80,80,0.55)", borderRadius: 2, display: "inline-block" }} />
                        Already booked
                      </span>
                      {form.eventDate && (
                        <span className="ml-auto text-white/70">
                          {fromYMD(form.eventDate).toLocaleDateString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-5">
                    <div>
                      <label style={labelStyle}>Event Type</label>
                      <select
                        name="eventType"
                        value={form.eventType}
                        onChange={handleChange}
                        style={{ ...inputStyle, cursor: "pointer" }}
                      >
                        <option value="" style={{ background: "#1a1a1a" }}>Select event type</option>
                        <option value="wedding" style={{ background: "#1a1a1a" }}>Wedding / Reception</option>
                        <option value="birthday" style={{ background: "#1a1a1a" }}>Birthday Party</option>
                        <option value="corporate" style={{ background: "#1a1a1a" }}>Corporate Event</option>
                        <option value="graduation" style={{ background: "#1a1a1a" }}>Graduation Party</option>
                        <option value="other" style={{ background: "#1a1a1a" }}>Other</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Package *</label>
                      <select
                        name="package"
                        value={form.package}
                        onChange={handleChange}
                        style={{ ...inputStyle, cursor: "pointer" }}
                        required
                      >
                        <option value="" style={{ background: "#1a1a1a" }}>Select package</option>
                        <option value="half-day" style={{ background: "#1a1a1a" }}>Half Day — $800 (5 hrs)</option>
                        <option value="full-day" style={{ background: "#1a1a1a" }}>Full Day — $1,300 (10 hrs)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Estimated Guest Count</label>
                    <input
                      type="number"
                      name="guestCount"
                      value={form.guestCount}
                      onChange={handleChange}
                      placeholder="Approximate number of guests"
                      min="1"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Additional Notes</label>
                    <textarea
                      name="message"
                      value={form.message}
                      onChange={handleChange}
                      placeholder="Tell us about your event, any special requests, or questions..."
                      rows={4}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-white w-full text-center"
                    style={{ display: "block", cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1 }}
                  >
                    {submitting ? "Submitting…" : "Submit Inquiry"}
                  </button>

                  <p className="text-white/25 text-xs text-center" style={{ fontFamily: "'Lato', sans-serif" }}>
                    A $150 deposit is required to confirm your booking. We'll send payment details after reviewing your inquiry.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
