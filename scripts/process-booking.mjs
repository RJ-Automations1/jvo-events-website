/**
 * Run the booking workflow for ONE registration, by hand.
 * -------------------------------------------------------
 * This is what `POST /api/jotform-hook` does automatically when JotForm is
 * wired up correctly. Until that webhook fires, registrations land in the
 * "Event Registration Master List" sheet and nowhere else — this script is how
 * you catch one up without waiting for the fix.
 *
 * Steps, in order:
 *   1. Calendar hold on GOOGLE_CALENDAR_ID (timed, so the rest of the day stays
 *      bookable). Idempotent on the JotForm submission id.
 *   2. Stripe balance invoice (server/stripeInvoices.js). Idempotent per event.
 *
 * It does NOT write the SQLite pipeline record — that database lives on the
 * Render disk, not here. Once the webhook works, re-firing the submission from
 * JotForm backfills the record and both steps above dedup rather than double up.
 *
 * DRAFT BY DEFAULT: the invoice is not sent unless you pass --send.
 *
 * USAGE
 *   node scripts/process-booking.mjs \
 *     --name "Matthew McCrary" --email matt@example.com \
 *     --phone "(404) 207-0953" --date 2026-09-18 --start 17:00 \
 *     --package "$800 5 hours" --type "Birthday Party" \
 *     --guests 35 --vehicles 25 --submission 6636697906647857444 \
 *     --deposit-separate [--send] [--skip-invoice] [--skip-calendar]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=([\s\S]*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}

const { EVENT_PACKAGES, EXTRA_HOUR_PRICE, endTimeFor, hoursFor } = await import(
  "../shared/eventSlots.js"
);
const { createCalendarEvent } = await import("../server/googleCalendar.js");
const { createEventInvoice, amountOwedCents, invoicesConfigured, isLiveMode } =
  await import("../server/stripeInvoices.js");

/* ── args ─────────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const arg = (n, d = "") => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
};

const booking = {
  name: arg("name"),
  email: arg("email"),
  phone: arg("phone"),
  eventDate: arg("date"),
  startTime: arg("start"),
  package: arg("package"),
  eventType: arg("type", "Event"),
  guestCount: arg("guests"),
  submissionId: arg("submission"),
};
const vehicles = arg("vehicles");
const address = arg("address");
const extraHours = Number(arg("extra-hours", "0"));
const send = flag("send");
const skipInvoice = flag("skip-invoice");
const skipCalendar = flag("skip-calendar");
const depositApplied = flag("deposit-applied");
const depositSeparate = flag("deposit-separate");

const problems = [];
if (!booking.name) problems.push("--name is required");
if (!booking.email) problems.push("--email is required");
if (!/^\d{4}-\d{2}-\d{2}$/.test(booking.eventDate)) problems.push("--date must be YYYY-MM-DD");
if (!booking.package) problems.push('--package is required (e.g. "$800 5 hours")');
// A hold with no start time becomes an ALL-DAY block, which blocks the whole
// date and loses the time the guest actually asked for. That must be a
// deliberate choice, never a silent fallback — pass --all-day to mean it.
if (!/^\d{2}:\d{2}$/.test(booking.startTime) && !flag("all-day") && !skipCalendar) {
  problems.push(
    '--start HH:MM is required (24h, e.g. 17:00 for 5:00 PM). Pass --all-day only if the booking genuinely has no time.'
  );
}
if (!skipInvoice && depositApplied === depositSeparate) {
  problems.push("pass exactly one of --deposit-applied / --deposit-separate");
}
if (!skipInvoice && !invoicesConfigured()) problems.push("STRIPE_SECRET_KEY is not set");
if (problems.length) {
  console.error("Cannot continue:\n  - " + problems.join("\n  - "));
  process.exit(1);
}

/* ── price from OUR table, never from the form label ──────────────────── */
function packageFromLabel(text) {
  const s = String(text).toLowerCase();
  const hours = s.match(/(\d+)\s*hour/);
  if (hours) {
    const byHours = EVENT_PACKAGES.find((p) => p.baseHours === Number(hours[1]));
    if (byHours) return byHours;
  }
  return EVENT_PACKAGES.find((p) => s.includes(p.name.toLowerCase()));
}
const pkg = packageFromLabel(booking.package);
if (!pkg) {
  console.error(`Could not match "${booking.package}" to a package.`);
  process.exit(1);
}

booking.packageId = pkg.id;
booking.hours = hoursFor(pkg, extraHours);
if (/^\d{2}:\d{2}$/.test(booking.startTime)) {
  booking.endTime = endTimeFor(booking.startTime, booking.hours);
}
booking.message = [
  vehicles ? `Vehicles expected: ${vehicles}.` : "",
  address ? `Address: ${address}.` : "",
  "Processed manually from the Event Registration Master List.",
]
  .filter(Boolean)
  .join(" ");

const usd = (c) => "$" + (c / 100).toFixed(2);
console.log(`Guest       : ${booking.name} <${booking.email}>`);
console.log(
  `Event       : ${booking.eventType}, ${booking.eventDate}` +
    (booking.endTime ? ` ${booking.startTime}–${booking.endTime}` : " (all day)") +
    (booking.guestCount ? `, ${booking.guestCount} guests` : "")
);
console.log(`Package     : ${pkg.name} — ${booking.hours}h @ ${usd(pkg.basePrice * 100)}`);
console.log("");

/* ── 1. calendar hold ─────────────────────────────────────────────────── */
if (skipCalendar) {
  console.log("1. CALENDAR   skipped (--skip-calendar)");
} else {
  const cal = await createCalendarEvent(booking);
  if (!cal.configured) console.log("1. CALENDAR   not configured — no hold created");
  else if (cal.duplicate) console.log(`1. CALENDAR   already held (${cal.id}) — left alone`);
  else console.log(`1. CALENDAR   created ${cal.id}\n              ${cal.htmlLink}`);
}

/* ── 2. stripe invoice ────────────────────────────────────────────────── */
if (skipInvoice) {
  console.log("2. INVOICE    skipped (--skip-invoice)");
} else {
  const amountCents = amountOwedCents({
    packageCents: pkg.basePrice * 100,
    extrasCents: Math.max(0, extraHours) * EXTRA_HOUR_PRICE * 100,
    depositApplied,
  });
  console.log(
    `2. INVOICE    ${usd(amountCents)} · $150 deposit ${depositApplied ? "APPLIED" : "SEPARATE"}` +
      ` · Stripe ${isLiveMode() ? "*** LIVE ***" : "test"} · ${send ? "FINALIZE + EMAIL" : "draft only"}`
  );
  const inv = await createEventInvoice(booking, {
    amountCents,
    daysUntilDue: Number(arg("due-days", "14")),
    send,
  });
  if (inv.duplicate) console.log("              an invoice already existed — reused, nothing new");
  console.log(`              ${inv.id} · ${inv.status} · ${usd(inv.amountDue ?? amountCents)}`);
  console.log(`              emailed to guest: ${inv.sent ? "YES" : "no"}`);
  if (inv.hostedInvoiceUrl) console.log(`              ${inv.hostedInvoiceUrl}`);
}

console.log("\nNote: the SQLite pipeline record is NOT written by this script.");
