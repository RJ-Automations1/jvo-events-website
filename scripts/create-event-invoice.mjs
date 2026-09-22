/**
 * Raise a Stripe balance invoice for one event booking.
 * -----------------------------------------------------
 * Uses the same live "Jonesboro Virtual Office" Stripe account as the JVO Mail
 * site. Creates a DRAFT by default — review it in the Stripe dashboard, then
 * re-run with --send (or hit Send in Stripe) to actually email the guest.
 *
 * The $150 security deposit is NOT assumed either way: you must pass exactly
 * one of --deposit-applied / --deposit-separate. Guessing wrong bills the guest
 * $150 too much or too little.
 *
 * USAGE
 *   node scripts/create-event-invoice.mjs \
 *     --name "Amelia Romero" --email amelia@example.com \
 *     --date 2026-09-12 --package "$800 5 hours" \
 *     --type "Birthday Party" --guests 71 \
 *     --deposit-applied
 *
 *   ...add --send to finalize and email it.
 *   ...add --extra-hours N to bill added hours at the published rate.
 *   ...add --due-days N to change the 14-day payment window.
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

const { EVENT_PACKAGES, EXTRA_HOUR_PRICE } = await import("../shared/eventSlots.js");
const { createEventInvoice, amountOwedCents, invoicesConfigured, isLiveMode } =
  await import("../server/stripeInvoices.js");

/* ── args ─────────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const arg = (name, fallback = "") => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const name = arg("name");
const email = arg("email");
const date = arg("date");
const packageLabel = arg("package");
const eventType = arg("type", "Event");
const guests = arg("guests");
const extraHours = Number(arg("extra-hours", "0"));
const dueDays = Number(arg("due-days", "14"));
const send = flag("send");

const depositApplied = flag("deposit-applied");
const depositSeparate = flag("deposit-separate");

const problems = [];
if (!name) problems.push("--name is required");
if (!email) problems.push("--email is required");
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push("--date must be YYYY-MM-DD");
if (!packageLabel) problems.push('--package is required (e.g. "$800 5 hours")');
if (depositApplied === depositSeparate) {
  problems.push("pass exactly one of --deposit-applied / --deposit-separate");
}
if (!invoicesConfigured()) problems.push("STRIPE_SECRET_KEY is not set");

if (problems.length) {
  console.error("Cannot continue:\n  - " + problems.join("\n  - "));
  process.exit(1);
}

/* ── price the booking from OUR package table, never from the label ───── */
function packageFromLabel(text) {
  const s = String(text).toLowerCase();
  const hours = s.match(/(\d+)\s*hour/);
  if (hours) {
    const byHours = EVENT_PACKAGES.find((p) => p.baseHours === Number(hours[1]));
    if (byHours) return byHours;
  }
  return EVENT_PACKAGES.find((p) => s.includes(p.name.toLowerCase()));
}

const pkg = packageFromLabel(packageLabel);
if (!pkg) {
  console.error(
    `Could not match "${packageLabel}" to a package. Known: ` +
      EVENT_PACKAGES.map((p) => `${p.name} (${p.baseHours}h $${p.basePrice})`).join(", ")
  );
  process.exit(1);
}

const extrasCents = Math.max(0, extraHours) * EXTRA_HOUR_PRICE * 100;
const amountCents = amountOwedCents({
  packageCents: pkg.basePrice * 100,
  extrasCents,
  depositApplied,
});

/* ── show the arithmetic before doing anything ────────────────────────── */
const usd = (c) => "$" + (c / 100).toFixed(2);
console.log(`Stripe mode      : ${isLiveMode() ? "*** LIVE ***" : "test"}`);
console.log(`Guest            : ${name} <${email}>`);
console.log(`Event            : ${eventType}, ${date}${guests ? `, ${guests} guests` : ""}`);
console.log(`Package          : ${pkg.name} — ${pkg.baseHours}h @ ${usd(pkg.basePrice * 100)}`);
if (extrasCents) console.log(`Extra hours      : ${extraHours} @ ${usd(EXTRA_HOUR_PRICE * 100)} = ${usd(extrasCents)}`);
console.log(`$150 deposit     : ${depositApplied ? "APPLIED (credited)" : "SEPARATE (not credited)"}`);
console.log(`AMOUNT TO BILL   : ${usd(amountCents)}`);
console.log(`Due in           : ${dueDays} days`);
console.log(`Action           : ${send ? "FINALIZE + EMAIL THE GUEST" : "create draft only (not sent)"}`);
console.log("");

const result = await createEventInvoice(
  {
    name,
    email,
    eventDate: date,
    eventType,
    package: packageLabel,
    guestCount: guests,
    // Stamps jotformId on the invoice so a Stripe payment can be traced back to
    // the exact registration it came from, and vice versa.
    submissionId: arg("submission"),
  },
  { amountCents, daysUntilDue: dueDays, send }
);

if (result.duplicate) {
  console.log(`An invoice for this event already exists — reusing it, nothing new created.`);
}
console.log(`Invoice id       : ${result.id}`);
console.log(`Status           : ${result.status}`);
console.log(`Amount due       : ${usd(result.amountDue ?? amountCents)}`);
console.log(`Emailed to guest : ${result.sent ? "YES" : "no"}`);
if (result.hostedInvoiceUrl) console.log(`Hosted invoice   : ${result.hostedInvoiceUrl}`);
if (!result.sent) {
  console.log(`\nDraft only. Review it in Stripe, then re-run with --send (or send from the dashboard).`);
}
