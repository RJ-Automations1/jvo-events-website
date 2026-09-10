/**
 * Registration intake from the JVO inbox.
 * ---------------------------------------
 * The JotForm → /api/jotform-hook webhook has never fired, so nothing
 * downstream of a registration has ever run automatically. This sweep closes
 * that gap using the intake path that demonstrably works: the submission email
 * (see server/jotformEmail.js), which is also the ONLY source carrying the
 * guest's paid add-ons — the Google Sheet has no column for them.
 *
 * For each registration it runs the same workflow the webhook was supposed to:
 *
 *   1. Timed calendar hold        (never all-day — see the startTime guard)
 *   2. SQLite pipeline record     (so the reminder sweeps can find it)
 *   3. Stripe invoice             (package + every add-on as its own line)
 *   4. Guest confirmation + venue notification
 *
 * Every step is independently idempotent — the calendar dedups on the JotForm
 * submission id, the DB on `jotform_id`, and Stripe on event date — so running
 * this twice does nothing the second time. That matters: it's the property that
 * makes a daily cron safe, and it means a partly-failed run is fixed by simply
 * running again rather than by unpicking what did land.
 *
 * ── SAFETY ────────────────────────────────────────────────────────────────
 * Two independent switches, both OFF by default, matching the other sweeps:
 *
 *   EMAIL_INTAKE_ENABLED=true        actually do anything (else: dry run)
 *   EMAIL_INTAKE_SEND_INVOICES=true  finalize + email invoices to guests
 *                                    (else: leave them as reviewable drafts)
 *
 * The second is separate on purpose. Creating a hold and a DB row is harmless
 * bookkeeping; emailing a real person a real demand for money is not, and it
 * should take a deliberate second decision to turn that on.
 */

import { fetchRecentSubmissions, inboxConfigured } from "./jotformEmail.js";
import { createCalendarEvent, getCalendarHold } from "./googleCalendar.js";
import { createEventRecord } from "./pipeline.js";
import { getDb } from "./db.js";
import { createEventInvoice, amountOwedCents, invoicesConfigured } from "./stripeInvoices.js";
import { payLinkUrl, payLinksConfigured } from "./partialPayments.js";
import {
  sendBookingConfirmation,
  sendBookingNotification,
  sendInvoiceNoticeToVenue,
} from "./email.js";
import {
  EVENT_PACKAGES,
  CLOSE_TIME,
  endTimeFor,
  hoursFor,
  minutesOf,
} from "../shared/eventSlots.js";

/** Today as YYYY-MM-DD in the venue's timezone. */
function todayYmd(timeZone = process.env.EVENT_TIMEZONE || "America/New_York") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const ENABLED = String(process.env.EMAIL_INTAKE_ENABLED || "false") === "true";
const SEND_INVOICES = String(process.env.EMAIL_INTAKE_SEND_INVOICES || "false") === "true";

/**
 * Whether the $150 security deposit counts toward the package total. JVO treats
 * it as a SEPARATE refundable deposit, so the full package is still owed — set
 * DEPOSIT_APPLIED=true only if that policy changes.
 */
const DEPOSIT_APPLIED = String(process.env.DEPOSIT_APPLIED || "false") === "true";

/** Match the form's package label to our priced package. */
function packageFromLabel(text) {
  const s = String(text || "").toLowerCase();
  const hours = s.match(/(\d+)\s*hour/);
  if (hours) {
    const byHours = EVENT_PACKAGES.find((p) => p.baseHours === Number(hours[1]));
    if (byHours) return byHours;
  }
  return EVENT_PACKAGES.find((p) => s.includes(p.name.toLowerCase()));
}

/**
 * Process one parsed registration. Exported so a single booking can be replayed
 * without sweeping the whole inbox.
 *
 * @param {object} booking - from parseSubmissionEmail()
 * @param {object} [opts]  - { dryRun, sendInvoice }
 */
export async function intakeOne(booking, opts = {}) {
  const dryRun = opts.dryRun ?? !ENABLED;
  const sendInvoice = opts.sendInvoice ?? SEND_INVOICES;
  const result = { email: booking.email, eventDate: booking.eventDate, steps: {}, errors: [] };

  // Refuse anything we can't act on correctly rather than acting on it wrongly.
  if (!booking.email || !booking.eventDate) {
    result.skipped = "missing email or event date";
    return result;
  }
  const pkg = packageFromLabel(booking.package);
  if (!pkg) {
    result.skipped = `package "${booking.package}" did not match a known package`;
    return result;
  }
  if (!/^\d{2}:\d{2}$/.test(booking.startTime || "")) {
    // An all-day hold consumes the whole date and loses the guest's time.
    result.skipped = "no start time — refusing to create an all-day hold";
    return result;
  }

  // A past event needs no hold, no invoice and no "we can't wait to host you"
  // email. The inbox goes back years, so without this every old registration
  // would be resurrected the first time the sweep runs.
  if (booking.eventDate < todayYmd()) {
    result.skipped = `event date ${booking.eventDate} is in the past`;
    return result;
  }

  const hours = hoursFor(pkg, 0);
  const endTime = endTimeFor(booking.startTime, hours);

  // The venue closes at CLOSE_TIME. A package that runs past it means the guest
  // picked a start time the booking page would never have offered (the JotForm's
  // own time field is free-form). Refuse rather than quietly holding the room
  // until midnight — someone has to agree the overrun with the guest.
  if (minutesOf(endTime) > minutesOf(CLOSE_TIME)) {
    result.skipped =
      `${booking.startTime} + ${hours}h ends ${endTime}, past the ${CLOSE_TIME} close — needs a human`;
    return result;
  }

  const enriched = {
    ...booking,
    packageId: pkg.id,
    hours,
    endTime,
    message: [
      booking.vehicleCount ? `Vehicles expected: ${booking.vehicleCount}.` : "",
      booking.address ? `Address: ${booking.address}.` : "",
      booking.addOns.length
        ? `Add-ons: ${booking.addOns.map((a) => `${a.label} ×${a.quantity} ($${a.total.toFixed(2)})`).join("; ")}.`
        : "",
      booking.outsideVendors ? "Outside vendors: YES." : "",
      booking.tourCompleted ? "Completed an in-person tour." : "",
    ]
      .filter(Boolean)
      .join(" "),
  };

  // Already in the pipeline? Then this registration has been handled.
  const db = getDb();
  if (db && booking.submissionId) {
    const existing = db
      .prepare("SELECT public_id, status FROM events WHERE jotform_id = ?")
      .get(String(booking.submissionId));
    if (existing) {
      result.alreadyKnown = existing.public_id;
    }
  }

  if (dryRun) {
    const addOnTotal = booking.addOnsTotal || 0;
    // Ask the calendar (read-only) so the preview reflects the same
    // already-handled check the real run makes.
    let held = false;
    try {
      held = Boolean(await getCalendarHold(enriched));
    } catch {
      /* preview only — fall through */
    }
    if (held) result.alreadyKnown = result.alreadyKnown || "existing calendar hold";
    result.steps = {
      calendar: held
        ? "already held"
        : `would hold ${booking.eventDate} ${enriched.startTime}–${enriched.endTime}`,
      pipeline: result.alreadyKnown ? `already ${result.alreadyKnown}` : "would create record",
      invoice: `would ${sendInvoice ? "send" : "draft"} $${(pkg.basePrice + addOnTotal).toFixed(2)}` +
        (booking.addOns.length ? ` (incl. $${addOnTotal.toFixed(2)} add-ons)` : ""),
      emails: result.alreadyKnown
        ? "skipped — already handled"
        : "would send confirmation + venue notification",
    };
    result.dryRun = true;
    return result;
  }

  // 1. Calendar hold — dedups on the JotForm submission id.
  let heldAlready = false;
  try {
    const cal = await createCalendarEvent(enriched);
    heldAlready = Boolean(cal.duplicate);
    result.steps.calendar = cal.duplicate
      ? `already held (${cal.id})`
      : cal.created
        ? `created ${cal.id}`
        : "not configured";
    enriched.calendarEventId = cal.id || null;
  } catch (err) {
    result.errors.push(`calendar: ${err.message}`);
  }

  // An existing hold means this booking was already handled — by an earlier
  // sweep, or by hand before this sweep existed. The DB alone can't tell us
  // that: the pipeline record is missing for every booking processed manually
  // while the webhook was dead, so trusting it would re-greet those guests.
  if (heldAlready) result.alreadyKnown = result.alreadyKnown || "existing calendar hold";

  // 2. Pipeline record — dedups on jotform_id.
  try {
    if (db) {
      const { event, created } = createEventRecord(db, enriched);
      result.steps.pipeline = `${created ? "created" : "existing"} ${event.public_id}`;
      enriched.publicId = event.public_id;
    } else {
      result.steps.pipeline = "no database";
    }
  } catch (err) {
    result.errors.push(`pipeline: ${err.message}`);
  }

  // 3. Stripe invoice — package plus every add-on as its own line.
  try {
    if (invoicesConfigured()) {
      const addOnLines = booking.addOns.map((a) => ({
        id: a.knownId || a.label.toLowerCase().replace(/\s+/g, "-"),
        label: `${a.label} (${a.quantity} × $${a.unitPrice.toFixed(2)})`,
        total: a.total,
      }));
      const inv = await createEventInvoice(enriched, {
        amountCents: amountOwedCents({
          packageCents: pkg.basePrice * 100,
          depositApplied: DEPOSIT_APPLIED,
        }),
        addOnLines,
        send: sendInvoice,
      });
      result.steps.invoice = `${inv.duplicate ? "existing " : ""}${inv.id} ${inv.status} $${((inv.amountDue ?? 0) / 100).toFixed(2)}${inv.sent ? " (emailed)" : " (draft)"}`;
      result.invoiceUrl = inv.hostedInvoiceUrl || null;

      // Copy JVO in — Stripe can't CC anyone on an invoice, so the venue only
      // learns an invoice went out if we tell them.
      if (inv.sent) {
        try {
          await sendInvoiceNoticeToVenue(
            {
              name: enriched.name,
              email: enriched.email,
              event_date: enriched.eventDate,
              publicId: enriched.publicId,
              invoiceNumber: inv.number,
              invoiceUrl: inv.hostedInvoiceUrl,
              amountDue: (inv.amountDue ?? 0) / 100,
            },
            "raised"
          );
        } catch (err) {
          result.errors.push(`venue invoice copy: ${err.message}`);
        }
      }

      // Carry the real figures into the confirmation email, so it states what
      // they owe and links to the pay-any-amount page rather than being vague.
      enriched.totalDue = (inv.amountDue ?? 0) / 100;
      if (inv.id && payLinksConfigured()) {
        try {
          enriched.payUrl = payLinkUrl(inv.id);
        } catch {
          /* pay links optional — the email drops the button */
        }
      }
    } else {
      result.steps.invoice = "Stripe not configured";
    }
  } catch (err) {
    result.errors.push(`invoice: ${err.message}`);
  }

  // 4. Emails — only for a registration we hadn't already recorded, so a
  //    re-run never re-greets a guest who was welcomed days ago.
  if (!result.alreadyKnown) {
    try {
      await sendBookingConfirmation(enriched);
      await sendBookingNotification(enriched);
      result.steps.emails = "confirmation + notification sent";
    } catch (err) {
      result.errors.push(`email: ${err.message}`);
    }
  } else {
    result.steps.emails = "skipped — already recorded";
  }

  return result;
}

/**
 * Sweep the inbox and process every registration found.
 *
 * @param {object} [opts] - { dryRun, limit, since, sendInvoice }
 * @returns {Promise<object>} summary
 */
export async function runEmailIntakeSweep(opts = {}) {
  const dryRun = opts.dryRun === true || !ENABLED;
  const summary = { enabled: ENABLED, dryRun, found: 0, processed: 0, skipped: 0, results: [], errors: [] };

  if (!inboxConfigured()) {
    summary.errors.push("SMTP_USER / SMTP_PASS not set — cannot read the inbox");
    console.warn("[intake] inbox not configured");
    return summary;
  }

  let bookings;
  try {
    bookings = await fetchRecentSubmissions({
      limit: opts.limit ?? 25,
      since: opts.since,
    });
  } catch (err) {
    summary.errors.push(`inbox: ${err.message}`);
    console.error("[intake] could not read the inbox:", err.message);
    return summary;
  }

  summary.found = bookings.length;
  for (const booking of bookings) {
    for (const w of booking.warnings) {
      console.warn(`[intake] ${booking.email || booking.submissionId || "?"}: ${w}`);
    }
    try {
      const r = await intakeOne(booking, { dryRun, sendInvoice: opts.sendInvoice });
      summary.results.push(r);
      if (r.skipped) {
        summary.skipped++;
        console.warn(`[intake] SKIP ${booking.email}: ${r.skipped}`);
      } else {
        summary.processed++;
        console.log(
          `[intake] ${dryRun ? "DRY RUN " : ""}${booking.name} (${booking.eventDate}): ` +
            Object.entries(r.steps).map(([k, v]) => `${k}=${v}`).join(", ")
        );
      }
      for (const e of r.errors) summary.errors.push(`${booking.email}: ${e}`);
    } catch (err) {
      summary.errors.push(`${booking.email}: ${err.message}`);
      console.error(`[intake] failed for ${booking.email}:`, err.message);
    }
  }
  return summary;
}
