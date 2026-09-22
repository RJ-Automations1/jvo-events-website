/**
 * Run the booking intake by hand. The Cheddar Up $150 DEPOSIT is the trigger:
 * each deposit is matched to its registration, and only then does the booking
 * get its calendar hold, pipeline record, invoice (with add-ons) and email.
 *
 * DRY RUN BY DEFAULT — prints what it would do and touches nothing. Pass
 * --apply to actually do it, and --send-invoices to finalize and email the
 * invoices rather than leaving reviewable drafts.
 *
 * USAGE
 *   node scripts/intake-registrations.mjs                     # preview
 *   node scripts/intake-registrations.mjs --apply             # holds + records + DRAFT invoices
 *   node scripts/intake-registrations.mjs --apply --send-invoices
 *   node scripts/intake-registrations.mjs --since 2026-08-20 --limit 5
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

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const arg = (n, d = "") => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
};

const apply = flag("apply");
// The sweep reads EMAIL_INTAKE_ENABLED itself; --apply overrides it for this run.
if (apply) process.env.EMAIL_INTAKE_ENABLED = "true";

const { runEmailIntakeSweep } = await import("../server/emailIntake.js");

const summary = await runEmailIntakeSweep({
  dryRun: !apply,
  limit: Number(arg("limit", "25")),
  since: arg("since") ? new Date(arg("since")) : undefined,
  sendInvoice: flag("send-invoices"),
});

console.log("\n" + "═".repeat(70));
console.log(
  `${summary.dryRun ? "DRY RUN — nothing changed" : "APPLIED"}  ·  ` +
    `${summary.deposits} deposit(s): ${summary.activated} going live, ` +
    `${summary.alreadyLive} already live, ${summary.skipped} skipped, ` +
    `${summary.unmatched.length} unmatched, ${summary.refunds.length} refund(s) to report`
);
for (const u of summary.unmatched) {
  console.log(`  UNMATCHED  ${u.name} <${u.email}> event ${u.eventDate || "?"} — ${u.reason}`);
}
if (summary.errors.length) {
  console.log("\nerrors:");
  for (const e of summary.errors) console.log("  -", e);
}
if (summary.dryRun) {
  console.log("\nRe-run with --apply to do it (add --send-invoices to email invoices too).");
}
