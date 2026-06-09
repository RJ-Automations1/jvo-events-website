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

/**
 * Map our booking package id to an estimated duration. Adjust to match the
 * resource/plan ids in your Deskworks account once known.
 */
const PACKAGE_HOURS = {
  "half-day": 5,
  "full-day": 10,
};

/**
 * @param {object} booking - validated booking payload from the form
 * @returns {Promise<{ ok: boolean, reference?: string, stub?: boolean }>}
 */
export async function createDeskworksReservation(booking) {
  const configured = Boolean(API_KEY && BASE_URL);

  // Normalize what we'd send to Deskworks regardless of stub/live.
  const reservation = {
    customerName: booking.name,
    customerEmail: booking.email,
    customerPhone: booking.phone || null,
    date: booking.eventDate,
    durationHours: PACKAGE_HOURS[booking.package] ?? null,
    package: booking.package,
    eventType: booking.eventType || null,
    guestCount: booking.guestCount ? Number(booking.guestCount) : null,
    notes: booking.message || null,
  };

  // Reservation creation via the API is NOT used — Deskworks only issues
  // read-only catalog tokens, so the website hands customers off to the
  // Deskworks new-reservation page to create the real booking + payment.
  // This endpoint just records the inquiry; treat every call as a lead.
  void configured;
  console.log("[deskworks] booking inquiry (handoff flow):", reservation);
  return { ok: true, stub: true };
}
