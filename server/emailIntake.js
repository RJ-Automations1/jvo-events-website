/**
 * Booking intake from the JVO inbox — triggered by the Cheddar Up DEPOSIT.
 * ------------------------------------------------------------------------
 * Filling in the registration form does NOT make a booking. The form is stored
 * (it lands in the inbox and the Master List) and nothing visible happens: no
 * calendar hold, no email to the guest, no invoice. A date is only blocked once
 * the guest has put money down.
 *
 * The trigger is Cheddar Up's "Payment Received: Security Deposit for Outdoor
 * Event" email to jonesborovirtualoffice@ (see server/cheddarUp.js). Each one is
 * matched to its registration by email + event date, and only then does this run:
 *
 *   1. Timed calendar hold        (never all-day — see the startTime guard)
 *   2. SQLite pipeline record     (status → booked, deposit_paid_at set)
 *   3. Stripe invoice             (package + every add-on as its own line)
 *   4. Registration-received email + venue notification
 *
 * Registrations come from the JotForm submission email (server/jotformEmail.js)
 * because it's the only source carrying the guest's paid add-ons — the Google
 * Sheet has no column for them.
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
import { fetchCheddarEvents, cheddarConfigured, matchDeposit } from "./cheddarUp.js";
import { createCalendarEvent, getCalendarHold } from "./googleCalendar.js";
import { createEventRecord, transition } from "./pipeline.js";
import { nowIso } from "./db.js";
import { getDb } from "./db.js";
import {
  createEventInvoice,
  amountOwedCents,
  invoicesConfigured,
  cardFeeCents,
  CARD_FEE_PERCENT,
} from "./stripeInvoices.js";
import { payLinkUrl, payLinksConfigured } from "./partialPayments.js";
import {
  sendBookingConfirmation,
  sendBookingNotification,
  sendInvoiceNoticeToVenue,
  sendIntakeAlertToVenue,
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
    // Reached via a Cheddar Up deposit — the email says it's received, not owed.
    depositPaid: Boolean(opts.deposit),
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
      // Quote the same total the real invoice will carry, card fee included —
      // a preview that understates the bill is worse than no preview.
      invoice: (() => {
        if (result.alreadyKnown) return "left alone — booking already handled";
        const sub = (pkg.basePrice + addOnTotal) * 100;
        const total = (sub + cardFeeCents(sub)) / 100;
        return (
          `would ${sendInvoice ? "send" : "draft"} $${total.toFixed(2)}` +
          (booking.addOns.length ? ` (incl. $${addOnTotal.toFixed(2)} add-ons)` : "") +
          (cardFeeCents(sub) ? ` (incl. ${CARD_FEE_PERCENT}% card fee)` : "")
        );
      })(),
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

      // The deposit is what made this booking real, so record it and move the
      // booking out of awaiting_deposit. That's also what starts the reminder
      // clock — the sweep only chases bookings that have actually paid in.
      if (opts.deposit && !event.deposit_paid_at) {
        db.prepare("UPDATE events SET deposit_paid_at = ?, updated_at = ? WHERE id = ?").run(
          opts.deposit.paidOn || nowIso(),
          nowIso(),
          event.id
        );
        if (event.status === "awaiting_deposit") {
          const moved = transition(
            db,
            event.id,
            "booked",
            "intake",
            `Cheddar Up deposit $${opts.deposit.amount ?? 150} received ` +
              `${opts.deposit.paidOn || ""} (matched by ${opts.deposit.matchedBy})`
          );
          if (!moved.ok) result.errors.push(`status: ${moved.error}`);
        }
        result.steps.pipeline += " → booked (deposit received)";
      }
    } else {
      result.steps.pipeline = "no database";
    }
  } catch (err) {
    result.errors.push(`pipeline: ${err.message}`);
  }

  // 3. Stripe invoice — package plus every add-on as its own line.
  //
  // NOT for a booking that was already handled. Its billing has been dealt
  // with — sent, or deliberately left as a draft by someone who knew something
  // the automation doesn't (Betty Hagan's draft was held back because she was
  // believed to have paid). createEventInvoice finalizes and SENDS an existing
  // draft when asked to send, so re-running this step would email that guest a
  // bill a human had chosen not to send. A new booking gets its invoice once;
  // after that, invoices are changed by hand, not by the sweep.
  if (result.alreadyKnown) {
    result.steps.invoice = "left alone — booking already handled";
  } else try {
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


/** Plain-calendar date maths for the lookback window. */
function daysAgoDate(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * How far back to look for Cheddar Up deposits. Deposits are safe to re-see —
 * an existing calendar hold marks one as already handled — so this only bounds
 * how much of the inbox gets read, and gives a missed daily run room to catch up.
 */
const DEPOSIT_LOOKBACK_DAYS = Number(process.env.DEPOSIT_LOOKBACK_DAYS || "30");

/**
 * Refunds are REPORTED, never acted on, and carry nothing to dedup them by. So
 * report only those that arrived since the last daily run — otherwise every
 * refund in the lookback window would be re-reported to JVO every morning.
 */
const REFUND_LOOKBACK_DAYS = Number(process.env.REFUND_LOOKBACK_DAYS || "1");

/**
 * The daily sweep. THE $150 CHEDDAR UP DEPOSIT IS THE TRIGGER.
 *
 * A guest filling in the registration form changes nothing visible: the form
 * is stored (in the inbox and the Master List) but there is no calendar hold,
 * no email, no invoice. Only when Cheddar Up tells jonesborovirtualoffice@ that
 * the deposit landed does the booking go live:
 *
 *   deposit email  →  matched to its registration (email + event date)
 *                  →  timed calendar hold, pipeline record, invoice,
 *                     registration-received email, venue notification
 *                  →  the 21/17/15/14-day reminders start from there
 *
 * Anything that can't be matched cleanly goes to JVO for a human rather than
 * being guessed at: a deposit with no registration, and every refund.
 *
 * @param {object} [opts] - { dryRun, sendInvoice }
 * @returns {Promise<object>} summary
 */
export async function runEmailIntakeSweep(opts = {}) {
  const dryRun = opts.dryRun === true || !ENABLED;
  const summary = {
    enabled: ENABLED,
    dryRun,
    deposits: 0,
    activated: 0,
    alreadyLive: 0,
    skipped: 0,
    unmatched: [],
    refunds: [],
    results: [],
    errors: [],
  };

  if (!inboxConfigured() || !cheddarConfigured()) {
    summary.errors.push("SMTP_USER / SMTP_PASS not set — cannot read the inbox");
    console.warn("[intake] inbox not configured");
    return summary;
  }

  let events;
  let registrations;
  try {
    [events, registrations] = await Promise.all([
      fetchCheddarEvents({ since: daysAgoDate(DEPOSIT_LOOKBACK_DAYS), limit: 200 }),
      // Registrations can precede their deposit by weeks, so read further back.
      fetchRecentSubmissions({ limit: 200 }),
    ]);
  } catch (err) {
    summary.errors.push(`inbox: ${err.message}`);
    console.error("[intake] could not read the inbox:", err.message);
    return summary;
  }

  // ── Refunds: report, never act ───────────────────────────────────────────
  const refundCutoff = daysAgoDate(REFUND_LOOKBACK_DAYS).toISOString();
  for (const r of events.filter((e) => e.kind === "refund")) {
    if (String(r.receivedAt) < refundCutoff) continue;
    summary.refunds.push(r);
    console.warn(`[intake] REFUND ${r.name} $${r.amount} — needs a human (no email/date to match on)`);
    if (!dryRun) {
      try {
        await sendIntakeAlertToVenue({
          kind: "refund",
          name: r.name,
          amount: r.amount,
          date: r.paidOn,
        });
      } catch (err) {
        summary.errors.push(`refund alert (${r.name}): ${err.message}`);
      }
    }
  }

  // ── Deposits: the trigger ────────────────────────────────────────────────
  const deposits = events.filter((e) => e.kind === "deposit");
  summary.deposits = deposits.length;

  for (const dep of deposits) {
    const { registration, how } = matchDeposit(dep, registrations);

    if (!registration) {
      // Paid, but we can't tell for what. Never guess — a wrong match puts the
      // wrong guest's date on the calendar and emails them an invoice.
      summary.unmatched.push({ ...dep, reason: how });
      console.warn(
        `[intake] UNMATCHED deposit: ${dep.name} <${dep.email}> for ${dep.eventDate || "?"} — ${how}`
      );
      // Past events don't need a human; only chase unmatched deposits that
      // still matter.
      if (!dryRun && dep.eventDate && dep.eventDate >= todayYmd()) {
        try {
          await sendIntakeAlertToVenue({
            kind: "unmatched",
            name: dep.name,
            email: dep.email,
            eventDate: dep.eventDate,
            amount: dep.amount,
            date: dep.paidOn,
          });
        } catch (err) {
          summary.errors.push(`unmatched alert (${dep.name}): ${err.message}`);
        }
      }
      continue;
    }

    for (const w of registration.warnings) {
      console.warn(`[intake] ${registration.email}: ${w}`);
    }

    try {
      const r = await intakeOne(registration, {
        dryRun,
        sendInvoice: opts.sendInvoice,
        deposit: { ...dep, matchedBy: how },
      });
      summary.results.push(r);
      if (r.skipped) {
        summary.skipped++;
        // Past-dated skips are expected noise (the inbox goes back months).
        if (!/in the past/.test(r.skipped)) {
          console.warn(`[intake] SKIP ${registration.email}: ${r.skipped}`);
        }
      } else if (r.alreadyKnown) {
        summary.alreadyLive++;
      } else {
        summary.activated++;
        console.log(
          `[intake] ${dryRun ? "DRY RUN " : ""}DEPOSIT → LIVE: ${registration.name} ` +
            `(${registration.eventDate}, matched by ${how}): ` +
            Object.entries(r.steps).map(([k, v]) => `${k}=${v}`).join(", ")
        );
      }
      for (const e of r.errors) summary.errors.push(`${registration.email}: ${e}`);
    } catch (err) {
      summary.errors.push(`${registration.email}: ${err.message}`);
      console.error(`[intake] failed for ${registration.email}:`, err.message);
    }
  }

  return summary;
}
