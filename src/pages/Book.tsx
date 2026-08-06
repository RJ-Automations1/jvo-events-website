import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useReveal } from "@/lib/useReveal";
import { IS_WEDDINGS_SITE } from "@/lib/siteMode";
import {
  EVENT_PACKAGES,
  EXTRA_HOUR_PRICE,
  OPEN_TIME,
  CLOSE_TIME,
  endTimeFor,
  extraHourChoices,
  formatPrice,
  freeStartTimes,
  hoursFor,
  label12,
  minutesOf,
  packageById,
  priceFor,
  rangeLabel,
  toYmd,
} from "@shared/eventSlots.js";

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

/** How often the calendar re-checks Google for newly-booked slots. */
const AVAILABILITY_POLL_MS = 60 * 1000;

type BusyRange = { start: string; end: string };

type Availability = {
  configured: boolean;
  /** Only dates with something on them appear here; the rest are wide open. */
  days: Record<string, { busy: BusyRange[]; closed: boolean }>;
  error?: string;
};

/** "Saturday, August 16, 2025" from a local Date. */
function prettyDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Open the registration form with the chosen date, start time and rental
 * package already filled in, so the guest can't accidentally submit different
 * details than the slot they just reserved on the calendar. Field names come
 * from the live form (q102_requestedEvent / q103_requestedStart / q17_chooseYour).
 */
function jotformSrcFor(date: Date, startTime: string, jotformValue?: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const [hour, minute] = startTime.split(":").map(Number);
  const params = new URLSearchParams({
    "requestedEvent[month]": pad(date.getMonth() + 1),
    "requestedEvent[day]": pad(date.getDate()),
    "requestedEvent[year]": String(date.getFullYear()),
    "requestedStart[hourSelect]": String(hour % 12 || 12),
    "requestedStart[minuteSelect]": pad(minute),
    "requestedStart[ampm]": hour >= 12 ? "PM" : "AM",
  });
  // Only the published packages exist as options on the form.
  if (jotformValue) params.append("chooseYour[]", jotformValue);
  return `${JOTFORM_SRC}?${params.toString()}`;
}

const labelStyle: CSSProperties = {
  display: "block",
  color: "rgba(255,255,255,0.55)",
  fontSize: "0.7rem",
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  marginBottom: "0.75rem",
  fontFamily: "'Lato', sans-serif",
};

/** Numbered step heading — "1 · Choose your date". */
function StepHeading({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <span
        style={{
          width: 28,
          height: 28,
          flexShrink: 0,
          borderRadius: "999px",
          border: "1px solid rgba(201,169,106,0.6)",
          color: "#c9a96a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Lato', sans-serif",
          fontSize: "0.8rem",
        }}
      >
        {step}
      </span>
      <h3 className="text-white text-lg" style={{ fontFamily: "'Playfair Display', serif" }}>
        {title}
      </h3>
    </div>
  );
}

export default function BookingPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [availability, setAvailability] = useState<Availability | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  /** Re-read on every poll so today's start times retire as they pass. */
  const [now, setNow] = useState(() => new Date());
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [packageId, setPackageId] = useState<string>("");
  const [extraHours, setExtraHours] = useState<number>(0);
  const [startTime, setStartTime] = useState<string>("");
  /** Set when the slot the guest had chosen gets taken out from under them. */
  const [lostSlot, setLostSlot] = useState(false);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // --- Live availability ---------------------------------------------------
  // Polls while the page is open (and re-checks whenever the tab regains focus)
  // so two people on the site at the same time can't both take the same slot.
  const refresh = useCallback(async () => {
    setNow(new Date());
    try {
      const res = await fetch("/api/event-availability", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Availability;
      setAvailability({ configured: Boolean(data.configured), days: data.days || {} });
      setCheckedAt(new Date());
    } catch {
      // Keep whatever we last knew — a hiccup shouldn't blank the calendar.
    }
  }, []);

  useEffect(() => {
    if (IS_WEDDINGS_SITE) return;
    refresh();
    const timer = window.setInterval(refresh, AVAILABILITY_POLL_MS);
    const onWake = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [refresh]);

  // --- Derived selection ---------------------------------------------------
  const selectedYmd = date ? toYmd(date) : "";
  const busy = useMemo(
    () => (selectedYmd ? (availability?.days[selectedYmd]?.busy ?? []) : []),
    [availability, selectedYmd]
  );

  const pkg = packageId ? packageById(packageId) : undefined;
  const hours = pkg ? hoursFor(pkg, extraHours) : 0;
  const total = pkg ? priceFor(pkg, extraHours) : 0;

  // A start time on today's date is only offerable while it's still ahead of us.
  const nowYmd = toYmd(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const notPast = useCallback(
    (ymd: string, start: string) => ymd !== nowYmd || minutesOf(start) > nowMinutes,
    [nowYmd, nowMinutes]
  );

  const starts = useMemo(() => {
    if (!pkg || !selectedYmd) return [] as string[];
    return freeStartTimes(hours, busy).filter((s: string) => notPast(selectedYmd, s));
  }, [pkg, hours, busy, selectedYmd, notPast]);

  const ready = Boolean(date && pkg && startTime);

  // The registration panel only mounts once a slot is picked, so re-observe the
  // `.reveal` elements whenever the selection changes or they'd stay invisible.
  useReveal([selectedYmd, packageId, startTime]);

  // If a refresh reveals the start time they picked is no longer offerable —
  // booked by someone else, or simply now in the past — drop it and say so.
  useEffect(() => {
    if (!startTime) return;
    if (!starts.includes(startTime)) {
      setStartTime("");
      setLostSlot(true);
    }
  }, [startTime, starts]);

  // --- JotForm bridge (resize + post-submit redirect) ----------------------
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

  const formSrc =
    !IS_WEDDINGS_SITE && date && startTime
      ? jotformSrcFor(date, startTime, pkg?.jotformValue)
      : JOTFORM_SRC;

  const panelStyle: CSSProperties = {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "0.35rem",
    padding: "32px",
  };

  const resetAll = () => {
    setDate(undefined);
    setPackageId("");
    setExtraHours(0);
    setStartTime("");
    setLostSlot(false);
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
                : `Pick your date, how long you need the space, and a start time — the calendar is live, so anything you can select is genuinely available. We're open ${label12(OPEN_TIME)} to ${label12(CLOSE_TIME)} every day.`}
            </p>
          </div>

          {/* Steps 1–3 — live calendar. Events site only; the weddings form is
              an inquiry, not a dated reservation. */}
          {!IS_WEDDINGS_SITE && (
            <div className="reveal mb-8" style={panelStyle}>
              <StepHeading step={1} title="Choose your date" />

              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <div className="jvo-calendar">
                    <DayPicker
                      mode="single"
                      selected={date}
                      onSelect={(d) => {
                        setDate(d);
                        setStartTime("");
                        setLostSlot(false);
                      }}
                      disabled={[
                        { before: today },
                        // Nothing left to book that day.
                        (d: Date) => Boolean(availability?.days[toYmd(d)]?.closed),
                      ]}
                      modifiers={{
                        booked: (d: Date) => Boolean(availability?.days[toYmd(d)]?.closed),
                      }}
                      modifiersClassNames={{ booked: "rdp-booked" }}
                      weekStartsOn={0}
                    />
                  </div>

                  {/* Legend */}
                  <div
                    className="flex flex-wrap justify-center gap-4 mt-4 text-white/45"
                    style={{ fontFamily: "'Lato', sans-serif", fontSize: "0.72rem" }}
                  >
                    <span className="flex items-center gap-1.5">
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: "rgba(255,255,255,0.75)" }} />
                      Available
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: "rgba(220,80,80,0.5)" }} />
                      Fully booked
                    </span>
                  </div>
                </div>

                <div>
                  {/* Step 2 — how long */}
                  <span style={labelStyle}>How long do you need it?</span>
                  <div className="space-y-2.5">
                    {EVENT_PACKAGES.map((option) => {
                      const active = option.id === packageId;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setPackageId(option.id);
                            setExtraHours(0);
                            setStartTime("");
                            setLostSlot(false);
                          }}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "0.7rem 0.9rem",
                            borderRadius: "0.25rem",
                            fontFamily: "'Lato', sans-serif",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                            background: active ? "#ffffff" : "rgba(255,255,255,0.04)",
                            color: active ? "#080808" : "rgba(255,255,255,0.8)",
                            border: active ? "1px solid #ffffff" : "1px solid rgba(255,255,255,0.14)",
                          }}
                        >
                          <span className="flex items-baseline justify-between gap-2">
                            <span style={{ fontSize: "0.9rem", fontWeight: active ? 700 : 400 }}>
                              {option.name}
                            </span>
                            <span style={{ fontSize: "0.75rem", opacity: 0.75 }}>
                              {formatPrice(option.basePrice)}
                            </span>
                          </span>
                          <span
                            className="block mt-0.5"
                            style={{ fontSize: "0.68rem", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.6 }}
                          >
                            {option.baseHours} hours
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Extra hours can be added to any package. */}
                  {pkg && pkg.maxExtraHours > 0 && (
                    <div className="mt-4">
                      <span style={labelStyle}>
                        Need longer? {formatPrice(EXTRA_HOUR_PRICE)} per extra hour
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {extraHourChoices(pkg).map((n: number) => {
                          const active = n === extraHours;
                          return (
                            <button
                              key={n}
                              type="button"
                              onClick={() => {
                                setExtraHours(n);
                                setStartTime("");
                                setLostSlot(false);
                              }}
                              style={{
                                padding: "0.45rem 0.9rem",
                                borderRadius: "0.25rem",
                                fontFamily: "'Lato', sans-serif",
                                fontSize: "0.8rem",
                                cursor: "pointer",
                                background: active ? "#ffffff" : "rgba(255,255,255,0.04)",
                                color: active ? "#080808" : "rgba(255,255,255,0.75)",
                                border: active ? "1px solid #ffffff" : "1px solid rgba(255,255,255,0.14)",
                                fontWeight: active ? 700 : 400,
                              }}
                            >
                              {n === 0 ? "None" : `+${n} hr`}
                            </button>
                          );
                        })}
                      </div>
                      <p
                        className="text-white/55 text-sm mt-3"
                        style={{ fontFamily: "'Lato', sans-serif" }}
                      >
                        {hours} hours · <span className="text-white">{formatPrice(total)}</span>
                        <span className="text-white/35"> + $150 security deposit</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 3 — start time */}
              <div className="mt-8 pt-7" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <span style={labelStyle}>
                  {date && pkg
                    ? `Start time — ${prettyDate(date)}`
                    : "Start time"}
                </span>

                {lostSlot && (
                  <p className="text-sm mb-3" style={{ fontFamily: "'Lato', sans-serif", color: "#e2a0a0" }}>
                    That start time is no longer available — please pick another.
                  </p>
                )}

                {!date || !pkg ? (
                  <p className="text-white/40 text-sm" style={{ fontFamily: "'Lato', sans-serif" }}>
                    Choose a date and a rental length to see the start times still open.
                  </p>
                ) : starts.length === 0 ? (
                  <p className="text-white/50 text-sm" style={{ fontFamily: "'Lato', sans-serif" }}>
                    No {hours}-hour slot fits on this date. Try a shorter option or another day.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {starts.map((s: string) => {
                        const active = s === startTime;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => {
                              setStartTime(s);
                              setLostSlot(false);
                            }}
                            style={{
                              padding: "0.6rem 0.25rem",
                              borderRadius: "0.25rem",
                              fontFamily: "'Lato', sans-serif",
                              fontSize: "0.78rem",
                              cursor: "pointer",
                              transition: "all 0.2s ease",
                              background: active ? "#ffffff" : "rgba(255,255,255,0.04)",
                              color: active ? "#080808" : "rgba(255,255,255,0.75)",
                              border: active ? "1px solid #ffffff" : "1px solid rgba(255,255,255,0.14)",
                              fontWeight: active ? 700 : 400,
                            }}
                          >
                            {label12(s)}
                          </button>
                        );
                      })}
                    </div>
                    {startTime && (
                      <p className="text-white/45 text-sm mt-3" style={{ fontFamily: "'Lato', sans-serif" }}>
                        Ends at {label12(endTimeFor(startTime, hours))}.
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Live-availability footnote */}
              <div
                className="mt-6 pt-5 flex flex-wrap items-center gap-2 text-white/35"
                style={{
                  borderTop: "1px solid rgba(255,255,255,0.07)",
                  fontFamily: "'Lato', sans-serif",
                  fontSize: "0.72rem",
                }}
              >
                {availability?.configured === false ? (
                  <span style={{ color: "#d8b878" }}>
                    We couldn't reach the live calendar just now — submit your request and we'll
                    confirm the date with you by hand.
                  </span>
                ) : (
                  <>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "999px",
                        background: "#7ec98a",
                        display: "inline-block",
                      }}
                    />
                    <span>
                      Live from the JVO events calendar
                      {checkedAt
                        ? ` · updated ${checkedAt.toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}`
                        : "…"}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 4 — the registration form, unlocked once a slot is chosen. */}
          {!IS_WEDDINGS_SITE && (
            <div className="reveal mb-6" style={panelStyle}>
              <StepHeading step={2} title="Tell us about your event" />
              {ready && date && pkg ? (
                <div
                  className="flex flex-wrap items-center justify-between gap-3"
                  style={{ fontFamily: "'Lato', sans-serif" }}
                >
                  <div>
                    <div className="text-white text-base">{prettyDate(date)}</div>
                    <div className="text-white/50 text-sm mt-0.5">
                      {rangeLabel(startTime, hours)} · {pkg.name}
                      {extraHours > 0 ? ` +${extraHours} hr` : ""} · {formatPrice(total)}
                    </div>
                  </div>
                  <button type="button" className="btn-outline" onClick={resetAll}>
                    Change
                  </button>
                </div>
              ) : (
                <p className="text-white/40 text-sm" style={{ fontFamily: "'Lato', sans-serif" }}>
                  Choose a date, length and start time above and the registration form will open
                  here — with your slot already filled in.
                </p>
              )}
            </div>
          )}

          {(IS_WEDDINGS_SITE || ready) && (
            <div
              className="reveal"
              style={{ background: "#fff", borderRadius: "0.25rem", overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)" }}
            >
              <iframe
                // Remount when the slot changes so the prefilled details refresh.
                key={formSrc}
                ref={iframeRef}
                title={IS_WEDDINGS_SITE ? "JVO Weddings Registration Form" : "JVO Event Space Registration Form"}
                src={formSrc}
                style={{ width: "100%", border: "none", minHeight: "1000px", display: "block" }}
                scrolling="no"
                allow="geolocation; microphone; camera; fullscreen; payment"
              />
            </div>
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
