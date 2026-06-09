/**
 * Deskworks availability reader (read-only catalog token).
 * --------------------------------------------------------
 * Reads the open time-slots for the Outdoor Event Center (unit) from Deskworks
 * and returns the dates that are NOT available, so the booking calendar can
 * grey them out alongside the Google Calendar.
 *
 * NOTE: Deskworks reports a date as "unavailable" both when it's actually
 * booked AND when the unit isn't offered for online self-booking that day
 * (e.g. Saturdays handled manually). Set DESKWORKS_BLOCK_WEEKDAYS to a comma
 * list of weekday numbers (0=Sun..6=Sat) to IGNORE Deskworks-unavailability on
 * those days (so they aren't blocked on the website). Default ignores none.
 */

const KEY = process.env.DESKWORKS_API_KEY || "";
const BASE = (process.env.DESKWORKS_BASE_URL || "").replace(/\/$/, "");
const CENTER = process.env.DESKWORKS_CENTER_ID || "6";
const UNIT = process.env.DESKWORKS_UNIT_ID || "32";
// Weekdays to NOT block from Deskworks unavailability (e.g. "6" = keep Saturdays bookable).
const IGNORE_WEEKDAYS = new Set(
  (process.env.DESKWORKS_IGNORE_WEEKDAYS || "")
    .split(",")
    .map((s) => parseInt(s, 10))
    .filter((n) => !Number.isNaN(n))
);

function addDay(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}
function weekdayOf(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * @returns {Promise<{configured:boolean, bookedDates:string[]}>}
 */
export async function getDeskworksBookedDates(from, to) {
  if (!KEY || !BASE) return { configured: false, bookedDates: [] };
  const url = `${BASE}/api/v1/centers/${CENTER}/reservations?from=${from}&to=${to}`;
  // Don't let a slow/blocked Deskworks request hang the availability endpoint.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  let res;
  try {
    res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${KEY}`,
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (compatible; JVOEventsBot/1.0; +https://jvoevents.com)",
      },
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Deskworks availability responded ${res.status}: ${body.slice(0, 120)}`);
  }
  const data = await res.json();
  const group = Array.isArray(data) ? data.find((g) => String(g.id) === String(UNIT)) : null;
  const unit = group?.reservationUnits?.find((u) => String(u.id) === String(UNIT)) || group?.reservationUnits?.[0];
  const availList = (unit?.availabilities || []).map((s) => String(s.from).slice(0, 10));
  const available = new Set(availList);
  // Deskworks only publishes a limited horizon (~1 year). Beyond the last
  // available date it returns nothing — so only treat a date as booked when it
  // falls WITHIN the known window, otherwise we'd wrongly block the far future.
  if (!availList.length) return { configured: true, bookedDates: [] };
  const horizonEnd = availList.reduce((a, b) => (b > a ? b : a));
  const horizonStart = availList.reduce((a, b) => (b < a ? b : a));

  const booked = [];
  let cur = from > horizonStart ? from : horizonStart;
  for (let i = 0; i < 400 && cur < to && cur <= horizonEnd; i++) {
    if (!available.has(cur) && !IGNORE_WEEKDAYS.has(weekdayOf(cur))) booked.push(cur);
    cur = addDay(cur);
  }
  return { configured: true, bookedDates: booked };
}
