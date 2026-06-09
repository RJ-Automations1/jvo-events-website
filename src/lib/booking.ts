/**
 * Deskworks booking handoff config (public — these are not secrets).
 * The website lets the customer pick an available date + enter their details,
 * then sends them to the Deskworks reservation page for the Outdoor Event
 * Center to complete the booking + payment.
 */
export const DESKWORKS_BOOKING_BASE = "https://jvo.satellitedeskworks.com";
export const DESKWORKS_CENTER = 6;
export const DESKWORKS_OUTDOOR_UNIT = 32;

/**
 * Path we hand customers off to. Once guest/non-member online booking is
 * enabled in the Deskworks admin, set this to the public booking link they
 * provide (the page that does NOT require a login).
 */
export const DESKWORKS_BOOKING_PATH = "/new-reservation";

export interface GuestDetails {
  name?: string;
  email?: string;
  phone?: string;
  eventType?: string;
  guestCount?: string;
}

/**
 * Build the Deskworks reservation URL for a chosen date (YYYY-MM-DD), carrying
 * the guest's details so the reservation page can prefill them and go straight
 * to payment.
 *
 * NOTE: the prefill param NAMES below are provisional — confirm them against the
 * actual guest booking link from Deskworks and adjust. Unknown params are simply
 * ignored by Deskworks, so they're harmless until then.
 */
export function deskworksBookingUrl(
  dateYMD: string,
  startTime = "12:00",
  title = "",
  guest: GuestDetails = {}
) {
  // Eastern time venue; offset is approximate (Deskworks lets the guest adjust).
  const dateParam = `${dateYMD}T${startTime}:00-04:00`;
  const params = new URLSearchParams({
    center: String(DESKWORKS_CENTER),
    unit: String(DESKWORKS_OUTDOOR_UNIT),
    date: dateParam,
  });
  if (title) params.set("title", title);
  if (guest.name) params.set("customerName", guest.name);
  if (guest.email) params.set("customerEmail", guest.email);
  if (guest.phone) params.set("customerPhone", guest.phone);
  if (guest.eventType) params.set("eventType", guest.eventType);
  if (guest.guestCount) params.set("guests", guest.guestCount);
  return `${DESKWORKS_BOOKING_BASE}${DESKWORKS_BOOKING_PATH}?${params.toString()}`;
}
