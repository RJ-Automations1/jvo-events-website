/**
 * Bookable windows for the Outdoor Event Center.
 * ----------------------------------------------
 * THE single source of truth for "when can someone book an event", shared by
 * the API (server.js, server/googleCalendar.js) and the Book Now page
 * (src/pages/Book.tsx) so the calendar the guest sees and the guard the server
 * enforces can never drift apart.
 *
 * The space is open for events EVERY day, 9:00 AM – 10:00 PM. The guest picks
 * how long they want it (hourly, half day or full day) and what time they'd
 * like to start; every start time that still fits inside the day — and doesn't
 * collide with something already on the calendar — is offered.
 *
 * Tours are a different thing entirely: they run Mon–Fri 9:00 AM–5:00 PM and
 * are defined in server.js / src/pages/Tour.tsx.
 *
 * Times are plain local "HH:MM" clock strings in the venue's timezone
 * (America/New_York); no UTC conversion happens anywhere in this file.
 */

/** Events can be booked any day of the week (0 = Sunday … 6 = Saturday). */
export const EVENT_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** The daily window the space is available in. */
export const OPEN_TIME = "09:00";
export const CLOSE_TIME = "22:00";

/** Start times are offered on the half hour. */
export const SLOT_STEP_MIN = 30;

/**
 * What a guest can book. `hours` is fixed for the packages; the hourly option
 * lets them choose anything from minHours to maxHours.
 *
 * Prices mirror the published packages — keep them in step with the Pricing
 * page, server/jvoKnowledge.js, and the "Rental Package" field on the JotForm.
 */
/** Any booking can buy extra hours on top of its package, at this rate each. */
export const EXTRA_HOUR_PRICE = 150;

/**
 * What a guest can book: a base package, plus up to `maxExtraHours` added on at
 * EXTRA_HOUR_PRICE apiece.
 *
 * The extra-hour caps come from the pricing itself — each one stops just short
 * of the next package up, so adding hours never costs more than simply booking
 * the bigger package (hourly maxes at 4 hrs/$700 under the $800 Half Day; Half
 * Day maxes at 8 hrs/$1,250 under the $1,300 Full Day; Full Day maxes out at
 * the 13-hour opening window).
 */
export const EVENT_PACKAGES = [
  {
    id: "hourly",
    name: "Hourly",
    baseHours: 3,
    basePrice: 550,
    maxExtraHours: 1,
    // No "Hourly" choice exists on the JotForm's Rental Package field yet, so
    // there's nothing to prefill. Add the option there and set its label here.
    jotformValue: "",
  },
  {
    id: "half-day",
    name: "Half Day",
    baseHours: 5,
    basePrice: 800,
    maxExtraHours: 3,
    jotformValue: "$800 5 hours",
  },
  {
    id: "full-day",
    name: "Full Day",
    baseHours: 10,
    basePrice: 1300,
    maxExtraHours: 3,
    jotformValue: "$1300 10 hours",
  },
];

/** The shortest bookable stretch — used to decide whether a day is truly full. */
export const MIN_BOOKABLE_HOURS = Math.min(...EVENT_PACKAGES.map((p) => p.baseHours));

/** 1250 → "$1,250" */
export function formatPrice(amount) {
  return `$${Number(amount).toLocaleString("en-US")}`;
}

/** How many extra hours a package allows: [0, 1, 2, …]. */
export function extraHourChoices(pkg) {
  if (!pkg) return [];
  const out = [];
  for (let n = 0; n <= pkg.maxExtraHours; n++) out.push(n);
  return out;
}

/** Extra hours, clamped to what the package actually allows. */
export function clampExtraHours(pkg, extraHours) {
  if (!pkg) return 0;
  const n = Number(extraHours);
  if (!Number.isFinite(n)) return 0;
  return Math.min(pkg.maxExtraHours, Math.max(0, Math.round(n)));
}

/** Total price of a package plus its added hours. */
export function priceFor(pkg, extraHours) {
  if (!pkg) return 0;
  return pkg.basePrice + clampExtraHours(pkg, extraHours) * EXTRA_HOUR_PRICE;
}

/** Weekday (0 = Sun … 6 = Sat) of a YYYY-MM-DD string, without timezone drift. */
export function weekdayOf(ymd) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Is this a date the venue takes events on? (Every day, currently.) */
export function isEventDay(ymd) {
  return EVENT_WEEKDAYS.includes(weekdayOf(ymd));
}

/** "17:00" → 1020. "24:00" (end-of-day sentinel) → 1440. */
export function minutesOf(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + (m || 0);
}

/** 1020 → "17:00" */
export function hhmmOf(minutes) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(Math.floor(minutes / 60))}:${p(minutes % 60)}`;
}

/** Do two [start, end) clock ranges on the same day overlap? */
export function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return minutesOf(aStart) < minutesOf(bEnd) && minutesOf(bStart) < minutesOf(aEnd);
}

/** Look a package up by id, or undefined. */
export function packageById(id) {
  return EVENT_PACKAGES.find((p) => p.id === id);
}

/** How many hours a selection actually runs for: the package plus its extras. */
export function hoursFor(pkg, extraHours) {
  if (!pkg) return 0;
  return pkg.baseHours + clampExtraHours(pkg, extraHours);
}

/** "09:00" + 5 hours → "14:00" */
export function endTimeFor(start, hours) {
  return hhmmOf(minutesOf(start) + Math.round(hours * 60));
}

/**
 * Every start time a booking of `hours` could begin at and still finish by
 * closing — ignoring what's already booked.
 */
export function allStartTimes(hours) {
  const out = [];
  const last = minutesOf(CLOSE_TIME) - Math.round(hours * 60);
  for (let m = minutesOf(OPEN_TIME); m <= last; m += SLOT_STEP_MIN) out.push(hhmmOf(m));
  return out;
}

/** Does a booking of `hours` starting at `start` fit inside the day's window? */
export function withinHours(start, hours) {
  return (
    minutesOf(start) >= minutesOf(OPEN_TIME) &&
    minutesOf(endTimeFor(start, hours)) <= minutesOf(CLOSE_TIME)
  );
}

/**
 * Would a booking of `hours` starting at `start` fit the opening window AND
 * clear every busy range?
 */
export function isFree(start, hours, busyIntervals) {
  if (!withinHours(start, hours)) return false;
  const end = endTimeFor(start, hours);
  return !(busyIntervals || []).some((iv) => intervalsOverlap(start, end, iv.start, iv.end));
}

/**
 * The start times actually offerable for a booking of `hours` on a day whose
 * calendar holds `busyIntervals` (an all-day booking arrives as 00:00–24:00).
 */
export function freeStartTimes(hours, busyIntervals) {
  return allStartTimes(hours).filter((s) => isFree(s, hours, busyIntervals));
}

/** True when not even the shortest bookable stretch fits anywhere that day. */
export function dayIsFull(busyIntervals) {
  return freeStartTimes(MIN_BOOKABLE_HOURS, busyIntervals).length === 0;
}

/** "17:00" → "5:00 PM" */
export function label12(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  const ampm = h >= 12 && h < 24 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m || 0).padStart(2, "0")} ${ampm}`;
}

/** "9:00 AM – 2:00 PM" for a start time and a length. */
export function rangeLabel(start, hours) {
  return `${label12(start)} – ${label12(endTimeFor(start, hours))}`;
}

/** Local Date → YYYY-MM-DD (no UTC drift). */
export function toYmd(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
