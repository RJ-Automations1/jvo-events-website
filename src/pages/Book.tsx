import { useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useReveal } from "@/lib/useReveal";
import { deskworksBookingUrl } from "@/lib/booking";

/** Local YYYY-MM-DD (avoids the UTC off-by-one of toISOString). */
function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function fromYMD(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const PACKAGES = [
  { id: "half-day", label: "Half Day", sub: "5 hours", price: "$800", start: "12:00" },
  { id: "full-day", label: "Full Day", sub: "10 hours", price: "$1,300", start: "10:00" },
];

const EVENT_TYPES = [
  "Wedding / Reception",
  "Private Celebration",
  "Birthday",
  "Game Night / Social",
  "Corporate / Meeting",
  "Other",
];

export default function BookingPage() {
  const [selected, setSelected] = useState<string>("");
  const [pkg, setPkg] = useState(PACKAGES[1]);
  const [bookedDates, setBookedDates] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [eventType, setEventType] = useState("");
  const [guestCount, setGuestCount] = useState("");

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canContinue = Boolean(selected && name.trim() && emailValid);

  useReveal([selected]);

  useEffect(() => {
    fetch("/api/availability")
      .then((r) => r.json())
      .then((d) => Array.isArray(d?.bookedDates) && setBookedDates(d.bookedDates))
      .catch(() => {});
  }, []);

  const bookedDateObjects = useMemo(() => bookedDates.map(fromYMD), [bookedDates]);
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);
  const selectedDate = selected ? fromYMD(selected) : undefined;

  const continueToBooking = () => {
    if (!canContinue) return;
    const url = deskworksBookingUrl(selected, pkg.start, "Outdoor Event Center Booking", {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      eventType,
      guestCount: guestCount.trim(),
    });
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const fieldStyle = {
    width: "100%",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "0.125rem",
    padding: "0.7rem 0.85rem",
    color: "#fff",
    fontSize: "0.9rem",
    fontFamily: "'Lato', sans-serif",
    outline: "none",
  } as const;

  const labelStyle = {
    display: "block",
    color: "rgba(255,255,255,0.45)",
    fontSize: "0.7rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    fontFamily: "'Lato', sans-serif",
    fontWeight: 700,
    marginBottom: "0.75rem",
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

      {/* Booking */}
      <section style={{ background: "#080808", padding: "80px 0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-5 gap-12">
            {/* Info sidebar */}
            <div className="lg:col-span-2">
              <div className="reveal">
                <h2 className="text-white text-2xl font-bold mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
                  Reserve the Outdoor Event Center
                </h2>
                <p className="text-white/45 text-sm leading-relaxed mb-8" style={{ fontFamily: "'Lato', sans-serif" }}>
                  Pick an available date and package below, then continue to our secure
                  reservation page to confirm your booking and pay your deposit.
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
                      <span className="text-white/45 text-sm" style={{ fontFamily: "'Lato', sans-serif" }}>{item.label}</span>
                      <span className="text-white text-sm font-bold" style={{ fontFamily: "'Lato', sans-serif" }}>{item.value}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-8 space-y-3">
                  <div className="text-white/30 text-xs tracking-widest uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>Contact</div>
                  <a href="https://www.jvoevents.com" target="_blank" rel="noopener noreferrer" className="block text-white/50 text-sm hover:text-white/80 transition-colors" style={{ fontFamily: "'Lato', sans-serif" }}>www.jvoevents.com</a>
                  <a href="mailto:info@jvoevents.com" className="block text-white/50 text-sm hover:text-white/80 transition-colors" style={{ fontFamily: "'Lato', sans-serif" }}>info@jvoevents.com</a>
                  <div className="text-white/50 text-sm" style={{ fontFamily: "'Lato', sans-serif" }}>Jonesboro, Georgia</div>
                </div>
              </div>
            </div>

            {/* Picker */}
            <div className="lg:col-span-3">
              <div className="reveal space-y-7">
                <div>
                  <label style={labelStyle}>1 · Choose a Package</label>
                  <div className="grid grid-cols-2 gap-4">
                    {PACKAGES.map((p) => {
                      const active = pkg.id === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPkg(p)}
                          className="text-left p-5 transition-colors"
                          style={{
                            border: active ? "1px solid #ffffff" : "1px solid rgba(255,255,255,0.12)",
                            background: active ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
                            borderRadius: "0.125rem",
                            cursor: "pointer",
                          }}
                        >
                          <div className="text-white text-lg font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>{p.label}</div>
                          <div className="text-white/40 text-xs tracking-wide uppercase mt-1" style={{ fontFamily: "'Lato', sans-serif" }}>{p.sub}</div>
                          <div className="text-white text-base font-bold mt-2" style={{ fontFamily: "'Lato', sans-serif" }}>{p.price}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>2 · Choose an Available Date</label>
                  <div
                    className="jvo-calendar"
                    style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", borderRadius: "0.125rem", padding: "0.5rem 0.25rem" }}
                  >
                    <DayPicker
                      mode="single"
                      selected={selectedDate}
                      onSelect={(d) => setSelected(d ? toYMD(d) : "")}
                      disabled={[{ before: today }, ...bookedDateObjects]}
                      modifiers={{ booked: bookedDateObjects }}
                      modifiersClassNames={{ booked: "rdp-booked" }}
                      startMonth={today}
                    />
                  </div>
                  <div className="flex items-center gap-5 mt-3 text-xs" style={{ fontFamily: "'Lato', sans-serif", color: "rgba(255,255,255,0.4)" }}>
                    <span className="flex items-center gap-2"><span style={{ width: 10, height: 10, background: "#ffffff", borderRadius: 2, display: "inline-block" }} />Selected</span>
                    <span className="flex items-center gap-2"><span style={{ width: 10, height: 10, background: "rgba(220,80,80,0.55)", borderRadius: 2, display: "inline-block" }} />Unavailable</span>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>3 · Your Details</label>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Full name *"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      style={{ ...fieldStyle, gridColumn: "1 / -1" }}
                    />
                    <input
                      type="email"
                      placeholder="Email *"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      style={fieldStyle}
                    />
                    <input
                      type="tel"
                      placeholder="Phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      autoComplete="tel"
                      style={fieldStyle}
                    />
                    <select
                      value={eventType}
                      onChange={(e) => setEventType(e.target.value)}
                      style={{ ...fieldStyle, color: eventType ? "#fff" : "rgba(255,255,255,0.4)" }}
                    >
                      <option value="" style={{ color: "#000" }}>Event type</option>
                      {EVENT_TYPES.map((t) => (
                        <option key={t} value={t} style={{ color: "#000" }}>{t}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      placeholder="Guest count"
                      value={guestCount}
                      onChange={(e) => setGuestCount(e.target.value)}
                      style={fieldStyle}
                    />
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={continueToBooking}
                    disabled={!canContinue}
                    className="btn-white w-full text-center"
                    style={{ display: "block", cursor: canContinue ? "pointer" : "not-allowed", opacity: canContinue ? 1 : 0.5 }}
                  >
                    {!selected
                      ? "Select a date to continue"
                      : !name.trim() || !emailValid
                      ? "Add your name & email to continue"
                      : `Continue to Payment — ${fromYMD(selected).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}
                  </button>
                  <p className="text-white/25 text-xs text-center mt-4" style={{ fontFamily: "'Lato', sans-serif" }}>
                    You'll confirm your booking and pay the $150 deposit securely on our
                    reservation page. A new tab will open.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
