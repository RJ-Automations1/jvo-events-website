/**
 * Google Calendar availability adapter.
 * -------------------------------------
 * Reads the JVO booking calendar and returns the dates that are already taken,
 * so the website can grey them out in the Book Now date picker.
 *
 * SECURITY: this runs server-side only. It authenticates with a Google
 * *service account* (a scoped, revocable robot credential) — NOT anyone's
 * Gmail password. The password a human uses to log in is never involved.
 *
 * ── One-time setup (no code, ~5 min) ───────────────────────────────────────
 * 1. Go to console.cloud.google.com → create/choose a project.
 * 2. APIs & Services → Enable "Google Calendar API".
 * 3. Credentials → Create Credentials → Service Account. Create a JSON key and
 *    download it. Copy the service account email (looks like
 *    name@project.iam.gserviceaccount.com).
 * 4. In Google Calendar (as jonesborovirtualoffice), open the booking
 *    calendar's Settings → "Share with specific people" → add that service
 *    account email with "See all event details" (read-only is enough).
 * 5. On Render, set env vars:
 *      GOOGLE_CALENDAR_ID         = the calendar's ID (Settings → "Integrate
 *                                   calendar" → Calendar ID, often the gmail
 *                                   address or an @group.calendar.google.com id)
 *      GOOGLE_SERVICE_ACCOUNT_JSON = the *entire* downloaded JSON, on one line
 * That's it — no password, fully revocable, key stays on the server.
 *
 * Until those are set, getBookedDates() returns [] (everything available) so
 * the site works during development.
 */

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "";
const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";

let calendarClientPromise = null;

/**
 * Lazily build an authenticated Calendar API client (only when configured).
 * Scope is `calendar.events` (read + write of events) so the same client can
 * both read availability and create booking holds. The service account must be
 * shared on the calendar with "Make changes to events" for writes to succeed.
 */
async function getCalendarClient() {
  if (calendarClientPromise) return calendarClientPromise;
  calendarClientPromise = (async () => {
    const { google } = await import("googleapis");
    const credentials = JSON.parse(SA_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });
    return google.calendar({ version: "v3", auth: await auth.getClient() });
  })();
  return calendarClientPromise;
}

/** Add `n` days to a YYYY-MM-DD string, treating it as a plain calendar date. */
function addDays(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/**
 * Expand an event into the list of YYYY-MM-DD strings it occupies, using the
 * calendar's LOCAL dates (the date prefix of the timestamp), so an evening
 * Eastern-time event doesn't spill into the next UTC day.
 */
function datesForEvent(ev) {
  let startYmd;
  let lastYmd;
  if (ev.start?.date) {
    // All-day event: end.date is exclusive, so the last occupied day is end - 1.
    startYmd = ev.start.date;
    lastYmd = addDays(ev.end?.date || addDays(startYmd, 1), -1);
  } else if (ev.start?.dateTime) {
    // Timed event: take the local date portion of each timestamp.
    startYmd = ev.start.dateTime.slice(0, 10);
    lastYmd = (ev.end?.dateTime || ev.start.dateTime).slice(0, 10);
  } else {
    return [];
  }
  const out = [];
  let cur = startYmd;
  for (let guard = 0; cur <= lastYmd && guard < 366; guard++) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/**
 * Return an array of booked YYYY-MM-DD dates between `from` and `to`.
 * @param {string} from ISO date (inclusive)
 * @param {string} to   ISO date (exclusive)
 * @returns {Promise<{ configured: boolean, bookedDates: string[] }>}
 */
export async function getBookedDates(from, to) {
  if (!CALENDAR_ID || !SA_JSON) {
    return { configured: false, bookedDates: [] };
  }
  const calendar = await getCalendarClient();
  const { data } = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: new Date(from).toISOString(),
    timeMax: new Date(to).toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 2500,
  });
  const set = new Set();
  for (const ev of data.items || []) {
    if (ev.status === "cancelled") continue;
    // Treat any event marked free/transparent as not blocking the space.
    if (ev.transparency === "transparent") continue;
    datesForEvent(ev).forEach((d) => set.add(d));
  }
  return { configured: true, bookedDates: [...set].sort() };
}

/**
 * Create an all-day "hold" event on the booking calendar so the event date is
 * blocked everywhere the site reads availability. All-day sidesteps timezone
 * math, and the `datesForEvent()` reader already treats it as a full-day block.
 *
 * Idempotent: tags each event with extendedProperties.private.{jvoSource,
 * jotformId} and skips creation if a matching website event already exists on
 * that date — so JotForm webhook retries / double submits don't duplicate.
 *
 * @param {object} booking - { name, email, phone, eventDate (YYYY-MM-DD),
 *   package, eventType, guestCount, message, submissionId? }
 * @returns {Promise<{configured:boolean, created:boolean, duplicate?:boolean, id?:string, htmlLink?:string}>}
 */
export async function createCalendarEvent(booking) {
  if (!CALENDAR_ID || !SA_JSON) {
    return { configured: false, created: false };
  }
  const eventDate = String(booking.eventDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    throw new Error(`createCalendarEvent: invalid eventDate "${booking.eventDate}"`);
  }
  const submissionId = booking.submissionId ? String(booking.submissionId) : "";
  const calendar = await getCalendarClient();

  // Idempotency check — look for an existing website-created event around the date.
  try {
    const props = ["jvoSource=website"];
    if (submissionId) props.push(`jotformId=${submissionId}`);
    const { data } = await calendar.events.list({
      calendarId: CALENDAR_ID,
      privateExtendedProperty: props,
      timeMin: new Date(`${eventDate}T00:00:00Z`).toISOString(),
      timeMax: new Date(`${addDays(eventDate, 2)}T00:00:00Z`).toISOString(),
      singleEvents: true,
      maxResults: 5,
    });
    const existing = (data.items || []).find((e) => e.status !== "cancelled");
    if (existing) {
      return { configured: true, created: false, duplicate: true, id: existing.id };
    }
  } catch {
    // If the dedup lookup fails, fall through and attempt creation anyway.
  }

  const name = booking.name || "Guest";
  const space = booking.space || "Outdoor Event Center";
  const pkg = booking.package ? ` · ${booking.package}` : "";
  const description = [
    `Space: ${space}`,
    booking.email ? `Email: ${booking.email}` : null,
    booking.phone ? `Phone: ${booking.phone}` : null,
    booking.eventType ? `Event type: ${booking.eventType}` : null,
    booking.guestCount ? `Guests: ${booking.guestCount}` : null,
    booking.message ? `Notes: ${booking.message}` : null,
    "",
    "Created automatically from the JVO website booking form. Deposit pending until paid on Cheddar Up.",
  ]
    .filter((l) => l !== null)
    .join("\n");

  const { data: created } = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      // Lead with the space so it's scannable on a multi-space calendar.
      summary: `${space} — ${name}${pkg} (deposit pending)`,
      description,
      start: { date: eventDate },
      end: { date: addDays(eventDate, 1) },
      transparency: "opaque",
      extendedProperties: {
        private: {
          jvoSource: "website",
          ...(submissionId ? { jotformId: submissionId } : {}),
          // Stamp the guest contact so the payment-reminder sweep can find who
          // to email without re-parsing the human-readable description.
          ...(booking.email ? { guestEmail: String(booking.email) } : {}),
          ...(booking.name ? { guestName: String(booking.name) } : {}),
        },
      },
    },
  });
  return { configured: true, created: true, id: created.id, htmlLink: created.htmlLink };
}

/** Pull "Email:" / "Phone:" style lines back out of an event description. */
function fieldFromDescription(description, label) {
  const re = new RegExp(`^${label}:\\s*(.+)$`, "im");
  const m = String(description || "").match(re);
  return m ? m[1].trim() : "";
}

/**
 * List the website-created bookings that fall on a specific calendar date, with
 * the guest contact info needed to email them. Used by the payment-reminder
 * sweep. Reads guestEmail/guestName from extendedProperties when present and
 * falls back to parsing the description for older events.
 *
 * @param {string} ymd - target date, YYYY-MM-DD
 * @returns {Promise<{configured:boolean, bookings:Array<object>}>}
 */
export async function getBookingsForDate(ymd) {
  if (!CALENDAR_ID || !SA_JSON) return { configured: false, bookings: [] };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd))) {
    throw new Error(`getBookingsForDate: invalid date "${ymd}"`);
  }
  const calendar = await getCalendarClient();
  const { data } = await calendar.events.list({
    calendarId: CALENDAR_ID,
    privateExtendedProperty: ["jvoSource=website"],
    timeMin: new Date(`${ymd}T00:00:00Z`).toISOString(),
    timeMax: new Date(`${addDays(ymd, 1)}T00:00:00Z`).toISOString(),
    singleEvents: true,
    maxResults: 50,
  });

  const bookings = [];
  for (const ev of data.items || []) {
    if (ev.status === "cancelled") continue;
    // Only events that actually occupy this date (all-day holds start on it).
    if (!datesForEvent(ev).includes(ymd)) continue;
    const priv = ev.extendedProperties?.private || {};
    const email = priv.guestEmail || fieldFromDescription(ev.description, "Email");
    if (!email) continue; // can't remind without an address
    bookings.push({
      calendarEventId: ev.id,
      name: priv.guestName || (ev.summary || "").split("—")[1]?.replace(/\(.*\)/, "").trim() || "Guest",
      email,
      phone: fieldFromDescription(ev.description, "Phone"),
      eventDate: ymd,
      eventType: fieldFromDescription(ev.description, "Event type"),
      submissionId: priv.jotformId || "",
    });
  }
  return { configured: true, bookings };
}
