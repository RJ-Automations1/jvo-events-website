/**
 * One-time calendar migration: "Outdoor Event Center" → the main JVO calendar.
 * ---------------------------------------------------------------------------
 * Bookings were originally held on a standalone secondary calendar
 * (GOOGLE_CALENDAR_ID = 1830514f…@group.calendar.google.com, titled "Outdoor
 * Event Center"). Nobody outside the JVO account had it in their sidebar, so
 * confirmed bookings looked missing. This copies the holds the SERVER created
 * onto the destination calendar, preserving the extendedProperties the rest of
 * the pipeline keys off (jvoSource / jotformId / guestEmail / guestName) so
 * createCalendarEvent()'s dedup check keeps working afterwards.
 *
 * Only events stamped jvoSource=website are touched. JotForm's own all-day
 * "JVO Event Space Registration Form" blocks are left alone — those come from
 * JotForm's Google Calendar integration and have to be repointed in JotForm.
 *
 * USAGE (dry run prints the plan and changes nothing):
 *   node scripts/migrate-calendar.mjs
 *   node scripts/migrate-calendar.mjs --apply
 *   node scripts/migrate-calendar.mjs --apply --delete-source
 *
 * The source calendar is read from GOOGLE_CALENDAR_ID; override the target with
 * MIGRATE_TARGET_CALENDAR_ID (defaults to jonesborovirtualoffice@gmail.com).
 * The service account must have "Make changes to events" on BOTH calendars.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Load .env without pulling in a dependency the server doesn't already use.
const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=([\s\S]*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const APPLY = process.argv.includes("--apply");
const DELETE_SOURCE = process.argv.includes("--delete-source");
const SOURCE_ID = process.env.GOOGLE_CALENDAR_ID || "";
const TARGET_ID =
  process.env.MIGRATE_TARGET_CALENDAR_ID || "jonesborovirtualoffice@gmail.com";

if (!SOURCE_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  console.error("GOOGLE_CALENDAR_ID and GOOGLE_SERVICE_ACCOUNT_JSON must be set.");
  process.exit(1);
}

const { google } = await import("googleapis");
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ["https://www.googleapis.com/auth/calendar"],
});
const cal = google.calendar({ version: "v3", auth: await auth.getClient() });

/** Fail early and readably if the service account can't write to a calendar. */
async function assertWritable(id, label) {
  try {
    const { data } = await cal.calendars.get({ calendarId: id });
    console.log(`${label}: "${data.summary}" (${id})`);
  } catch (err) {
    console.error(
      `\n${label} is unreachable (${id}):\n  ${err.message}\n\n` +
        `Share it with the service account at "Make changes to events":\n` +
        `  ${JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON).client_email}\n`
    );
    process.exit(1);
  }
}

await assertWritable(SOURCE_ID, "SOURCE");
await assertWritable(TARGET_ID, "TARGET");

// Only server-created holds carry jvoSource=website; that's the migration set.
const { data: src } = await cal.events.list({
  calendarId: SOURCE_ID,
  privateExtendedProperty: ["jvoSource=website"],
  timeMin: new Date().toISOString(),
  singleEvents: true,
  orderBy: "startTime",
  maxResults: 2500,
});
const events = (src.items || []).filter((e) => e.status !== "cancelled");

console.log(`\n${events.length} server-created booking(s) on the source calendar.\n`);

let moved = 0;
let skipped = 0;

for (const ev of events) {
  const when = ev.start?.dateTime || ev.start?.date;
  const priv = ev.extendedProperties?.private || {};

  // Don't create a second copy if a prior run already moved this one. Match on
  // jotformId when present (the same key createCalendarEvent dedups on).
  const { data: dupes } = await cal.events.list({
    calendarId: TARGET_ID,
    privateExtendedProperty: priv.jotformId
      ? ["jvoSource=website", `jotformId=${priv.jotformId}`]
      : ["jvoSource=website"],
    timeMin: new Date(`${String(when).slice(0, 10)}T00:00:00Z`).toISOString(),
    timeMax: new Date(`${String(when).slice(0, 10)}T23:59:59Z`).toISOString(),
    singleEvents: true,
    maxResults: 5,
  });
  const already = (dupes.items || []).find(
    (d) => d.status !== "cancelled" && (!priv.jotformId || d.summary === ev.summary)
  );
  if (already) {
    console.log(`  SKIP (already on target)  ${when}  ${ev.summary}`);
    skipped++;
    continue;
  }

  console.log(`  ${APPLY ? "MOVE" : "would move"}  ${when}  ${ev.summary}`);
  if (!APPLY) continue;

  await cal.events.insert({
    calendarId: TARGET_ID,
    requestBody: {
      summary: ev.summary,
      description: ev.description,
      location: ev.location,
      start: ev.start,
      end: ev.end,
      transparency: ev.transparency || "opaque",
      extendedProperties: { private: priv },
    },
  });
  moved++;

  if (DELETE_SOURCE) {
    await cal.events.delete({ calendarId: SOURCE_ID, eventId: ev.id });
    console.log(`         removed from source`);
  }
}

console.log(
  `\n${APPLY ? `Done — ${moved} moved, ${skipped} already present.` : "Dry run — nothing changed. Re-run with --apply."}`
);
if (APPLY && !DELETE_SOURCE && moved) {
  console.log(
    "Source copies were kept. Re-run with --delete-source once the target looks right."
  );
}
