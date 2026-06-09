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

/** Lazily build an authenticated Calendar API client (only when configured). */
async function getCalendarClient() {
  if (calendarClientPromise) return calendarClientPromise;
  calendarClientPromise = (async () => {
    const { google } = await import("googleapis");
    const credentials = JSON.parse(SA_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    });
    return google.calendar({ version: "v3", auth: await auth.getClient() });
  })();
  return calendarClientPromise;
}

/** Expand an event into the list of YYYY-MM-DD strings it occupies. */
function datesForEvent(ev) {
  // All-day events use `date`; timed events use `dateTime`.
  const startStr = ev.start?.date || ev.start?.dateTime;
  const endStr = ev.end?.date || ev.end?.dateTime;
  if (!startStr) return [];
  const start = new Date(startStr);
  // For all-day events Google's `end.date` is exclusive; for timed events use the day.
  const end = endStr ? new Date(endStr) : new Date(startStr);
  const out = [];
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = ev.end?.date
    ? new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) - 86400000)
    : new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
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
