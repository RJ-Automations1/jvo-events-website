/**
 * Deskworks Satellite booking adapter.
 * ------------------------------------
 * This is the SINGLE place the real Deskworks API call lives. The rest of the
 * app (server.js, the Book page) never touches Deskworks directly — they just
 * call `createDeskworksReservation(payload)`.
 *
 * The Deskworks API is account-specific and not publicly documented, so the
 * actual request below is a clearly-marked STUB. Once you provide:
 *   - DESKWORKS_API_KEY   (your secret key)
 *   - DESKWORKS_BASE_URL  (e.g. https://<your-space>.deskworks.com/api)
 *   - the create-reservation endpoint path, auth header style, and field names
 * fill in the `fetch(...)` block marked TODO and remove the stub return.
 *
 * Env vars are read from process.env (set them in Render → Environment, and
 * locally in a .env file — see .env.example). They are NEVER shipped to the
 * browser, which is the whole reason this runs server-side.
 */

const API_KEY = process.env.DESKWORKS_API_KEY || "";
const BASE_URL = (process.env.DESKWORKS_BASE_URL || "").replace(/\/$/, "");
const CENTER = process.env.DESKWORKS_CENTER_ID || "6";
const UNIT = process.env.DESKWORKS_UNIT_ID || "32";
// The create-reservation endpoint path is account-specific. Default to the
// reservations collection under the center; override with DESKWORKS_CREATE_PATH
// once the exact path is confirmed against the live (write-scoped) API.
const CREATE_PATH =
  process.env.DESKWORKS_CREATE_PATH || `/api/v1/centers/${CENTER}/reservations`;
// Local start hour for the booking block (24h). Half/full-day length is added.
const DEFAULT_START_HOUR = Number(process.env.DESKWORKS_DEFAULT_START_HOUR || "10");
const TIMEZONE = process.env.EVENT_TIMEZONE || "America/New_York";
// Reservation creation is OFF until Deskworks issues a write-scoped token + the
// real create endpoint. Calendar-only mode runs until then. Flip on by setting
// DESKWORKS_WRITE_ENABLED=true (and swapping in the write token) — no redeploy
// of code needed, just the env var.
const WRITE_ENABLED = /^(1|true|yes|on)$/i.test(
  process.env.DESKWORKS_WRITE_ENABLED || ""
);

/**
 * Map our booking package id to an estimated duration. Adjust to match the
 * resource/plan ids in your Deskworks account once known.
 */
const PACKAGE_HOURS = {
  "half-day": 5,
  "full-day": 10,
};

/** Tolerant duration lookup — accepts slugs ("full-day") or labels ("Full Day"). */
function packageHours(pkg) {
  const k = String(pkg || "").toLowerCase();
  if (k.includes("full")) return 10;
  if (k.includes("half")) return 5;
  return PACKAGE_HOURS[k] ?? 5;
}

/**
 * @param {object} booking - validated booking payload from the form
 * @returns {Promise<{ ok: boolean, reference?: string, stub?: boolean }>}
 */
export async function createDeskworksReservation(booking) {
  const configured = Boolean(API_KEY && BASE_URL);

  const durationHours = packageHours(booking.package);
  const date = String(booking.eventDate).slice(0, 10);
  const pad = (n) => String(n).padStart(2, "0");
  const startHour = DEFAULT_START_HOUR;
  const endHour = Math.min(startHour + durationHours, 23);
  // Naive local datetimes (no offset) plus an explicit timezone field — the
  // exact field names Deskworks expects are confirmed against the live API.
  const startDateTime = `${date}T${pad(startHour)}:00:00`;
  const endDateTime = `${date}T${pad(endHour)}:00:00`;

  const reservation = {
    centerId: Number(CENTER),
    reservationUnitId: Number(UNIT),
    customerName: booking.name,
    customerEmail: booking.email,
    customerPhone: booking.phone || null,
    date,
    startDateTime,
    endDateTime,
    durationHours,
    timezone: TIMEZONE,
    package: booking.package,
    eventType: booking.eventType || null,
    guestCount: booking.guestCount ? Number(booking.guestCount) : null,
    notes: booking.message || null,
  };

  // Calendar-only mode: skip the create cleanly (no doomed POST / 404 noise)
  // until a write-scoped token is in place and DESKWORKS_WRITE_ENABLED is set.
  if (!configured || !WRITE_ENABLED) {
    const why = !configured ? "not configured" : "write disabled (calendar-only mode)";
    console.log(`[deskworks] reservation create skipped — ${why}:`, reservation);
    return { ok: true, skipped: true };
  }

  const url = `${BASE_URL}${CREATE_PATH}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (compatible; JVOEventsBot/1.0; +https://jvoevents.com)",
      },
      body: JSON.stringify(reservation),
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(
      `Deskworks create responded ${res.status}: ${text.slice(0, 200)}`
    );
  }
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON success body is fine */
  }
  const reference =
    data.id || data.reservationId || data.reference || data.confirmationCode || null;
  console.log("[deskworks] reservation created:", reference ?? "(no id in response)");
  return { ok: true, reference };
}
