import { useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

/**
 * Live availability calendar.
 * ---------------------------
 * Reads `/api/availability` (Google Calendar + Deskworks, merged server-side)
 * and renders a month grid with the taken dates struck through and unclickable,
 * so a guest picks a date we can actually honour *before* filling in a form.
 *
 * Fails open: if the API is unreachable or unconfigured, every future date stays
 * selectable and a short note explains that we'll confirm the date by hand — an
 * availability outage must never block a booking.
 */

/** Local Date → YYYY-MM-DD (no UTC drift). */
export function toYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** YYYY-MM-DD → local Date at midnight (no UTC drift). */
export function fromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "Saturday, August 16, 2025" from a local Date. */
export function prettyDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

type AvailabilityResponse = {
  ok?: boolean;
  configured?: boolean;
  bookedDates?: string[];
};

/** How far ahead the calendar lets you book — weddings are planned well out. */
const MONTHS_AHEAD = 24;

export default function AvailabilityCalendar({
  selected,
  onSelect,
}: {
  selected: Date | undefined;
  onSelect: (date: Date | undefined) => void;
}) {
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);
  const horizon = useMemo(
    () => new Date(today.getFullYear(), today.getMonth() + MONTHS_AHEAD, 1),
    [today]
  );

  const [bookedDays, setBookedDays] = useState<Date[]>([]);
  const [status, setStatus] = useState<"loading" | "live" | "unverified">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const q = new URLSearchParams({ from: toYmd(today), to: toYmd(horizon) });
        const res = await fetch(`/api/availability?${q.toString()}`);
        const data = (await res.json()) as AvailabilityResponse;
        if (cancelled) return;
        // Drop anything already past — the window is queried in UTC, so a late
        // Eastern-time event yesterday can come back and would otherwise render
        // as "booked" rather than simply gone.
        const todayYmd = toYmd(today);
        setBookedDays(
          (data.bookedDates ?? []).filter((ymd) => ymd >= todayYmd).map(fromYmd)
        );
        setStatus(data.configured ? "live" : "unverified");
      } catch {
        // Fail open — show an open calendar rather than a dead one.
        if (!cancelled) setStatus("unverified");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [today, horizon]);

  return (
    <div>
      {/* flex-centred: the month grid is narrower than the card it sits in. */}
      <div className="jvo-calendar flex justify-center">
        <DayPicker
          mode="single"
          selected={selected}
          onSelect={onSelect}
          startMonth={today}
          endMonth={horizon}
          disabled={[{ before: today }, ...bookedDays]}
          modifiers={{ booked: bookedDays }}
          modifiersClassNames={{ booked: "rdp-booked" }}
          weekStartsOn={0}
        />
      </div>

      {/* Legend + honesty about where the "booked" marks come from. */}
      <div
        className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-5 text-white/45 text-xs"
        style={{ fontFamily: "'Lato', sans-serif" }}
      >
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            style={{
              width: 12,
              height: 12,
              border: "1px solid rgba(255,255,255,0.35)",
              display: "inline-block",
            }}
          />
          Available
        </span>
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            style={{
              width: 12,
              height: 12,
              background: "rgba(220,80,80,0.35)",
              display: "inline-block",
            }}
          />
          Already booked
        </span>
      </div>

      <p
        className="text-white/35 text-xs text-center mt-3"
        style={{ fontFamily: "'Lato', sans-serif" }}
        aria-live="polite"
      >
        {status === "loading"
          ? "Checking live availability…"
          : status === "live"
            ? "Availability updates live from our booking calendar."
            : "We'll confirm your date personally when we receive your request."}
      </p>
    </div>
  );
}
