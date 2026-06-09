/**
 * Deskworks booking handoff config (public — these are not secrets).
 * The website lets the customer pick an available date, then sends them to the
 * Deskworks new-reservation page for the Outdoor Event Center to complete the
 * real reservation + payment.
 */
export const DESKWORKS_BOOKING_BASE = "https://jvo.satellitedeskworks.com";
export const DESKWORKS_CENTER = 6;
export const DESKWORKS_OUTDOOR_UNIT = 32;

/** Build the Deskworks new-reservation URL for a chosen date (YYYY-MM-DD). */
export function deskworksBookingUrl(dateYMD: string, startTime = "12:00", title = "") {
  // Eastern time venue; offset is approximate (Deskworks lets the guest adjust).
  const dateParam = `${dateYMD}T${startTime}:00-04:00`;
  const params = new URLSearchParams({
    center: String(DESKWORKS_CENTER),
    unit: String(DESKWORKS_OUTDOOR_UNIT),
    date: dateParam,
  });
  if (title) params.set("title", title);
  return `${DESKWORKS_BOOKING_BASE}/new-reservation?${params.toString()}`;
}
