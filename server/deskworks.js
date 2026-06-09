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

  if (!configured) {
    // No credentials yet → behave as a stub so the site is fully testable.
    console.warn(
      "[deskworks] DESKWORKS_API_KEY / DESKWORKS_BASE_URL not set — returning STUB success.",
      reservation
    );
    return { ok: true, stub: true };
  }

  // TODO: Replace with the real Deskworks create-reservation request once the
  // endpoint + payload shape are known. Example shape (adjust path/headers/body):
  //
  // const res = await fetch(`${BASE_URL}/reservations`, {
  //   method: "POST",
  //   headers: {
  //     "Content-Type": "application/json",
  //     Authorization: `Bearer ${API_KEY}`,
  //   },
  //   body: JSON.stringify(reservation),
  // });
  // if (!res.ok) {
  //   const text = await res.text().catch(() => "");
  //   throw new Error(`Deskworks responded ${res.status}: ${text}`);
  // }
  // const data = await res.json();
  // return { ok: true, reference: data.id };

  throw new Error(
    "Deskworks credentials are set but the API call is not wired yet. " +
      "Fill in the TODO block in server/deskworks.js with the real endpoint."
  );
}
