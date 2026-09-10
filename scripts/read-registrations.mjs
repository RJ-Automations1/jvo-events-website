/**
 * Read recent JotForm registrations out of the JVO inbox and print what each
 * one ordered, including add-ons and what the invoice total should be.
 *
 * This is the intake path that actually works today: the JotForm webhook has
 * never fired, and the Google Sheet drops the "Add on Options" column entirely,
 * so the submission email is the only complete record of what a guest bought.
 *
 * USAGE
 *   node scripts/read-registrations.mjs               # 20 most recent
 *   node scripts/read-registrations.mjs --limit 5
 *   node scripts/read-registrations.mjs --since 2026-08-01
 *   node scripts/read-registrations.mjs --json        # machine-readable
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

const { fetchRecentSubmissions, inboxConfigured } = await import("../server/jotformEmail.js");
const { EVENT_PACKAGES } = await import("../shared/eventSlots.js");

const argv = process.argv.slice(2);
const arg = (n, d = "") => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
};

if (!inboxConfigured()) {
  console.error("SMTP_USER / SMTP_PASS must be set (the Gmail app password reads IMAP too).");
  process.exit(1);
}

const since = arg("since") ? new Date(arg("since")) : undefined;
const bookings = await fetchRecentSubmissions({
  limit: Number(arg("limit", "20")),
  since,
});

if (argv.includes("--json")) {
  console.log(JSON.stringify(bookings, null, 2));
  process.exit(0);
}

const usd = (n) => "$" + n.toFixed(2);
const packagePrice = (label) => {
  const s = String(label || "").toLowerCase();
  const hours = s.match(/(\d+)\s*hour/);
  const pkg = hours
    ? EVENT_PACKAGES.find((p) => p.baseHours === Number(hours[1]))
    : EVENT_PACKAGES.find((p) => s.includes(p.name.toLowerCase()));
  return pkg ? pkg.basePrice : null;
};

console.log(`${bookings.length} registration email(s)\n`);
for (const b of bookings) {
  const base = packagePrice(b.package);
  console.log("─".repeat(70));
  console.log(`${b.name || "(no name)"}  <${b.email || "no email"}>`);
  console.log(`  event      ${b.eventType || "?"} · ${b.eventDate || "?"} ${b.startTime || "(NO TIME)"}`);
  console.log(`  guests     ${b.guestCount ?? "?"} · vehicles ${b.vehicleCount ?? "?"}`);
  console.log(`  package    ${b.package || "?"}${base != null ? `  (${usd(base)})` : "  (UNMATCHED)"}`);
  console.log(`  submission ${b.submissionId || "(not found)"}  received ${b.receivedAt?.slice(0, 10) || "?"}`);
  if (b.addOns.length) {
    console.log("  add-ons:");
    for (const a of b.addOns) {
      console.log(`    · ${a.label} — ${a.quantity} × ${usd(a.unitPrice)} = ${usd(a.total)}`);
    }
  } else {
    console.log("  add-ons:   none");
  }
  if (base != null) {
    console.log(`  INVOICE    ${usd(base)} + ${usd(b.addOnsTotal)} add-ons = ${usd(base + b.addOnsTotal)}`);
  }
  for (const w of b.warnings) console.log(`  ⚠ ${w}`);
}
