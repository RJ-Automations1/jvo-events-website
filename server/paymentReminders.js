/**
 * 30-day payment reminder sweep.
 * ------------------------------
 * Finds bookings whose event is exactly N days away (default 30) and, for any
 * whose full balance is NOT yet paid, emails the guest a reminder that the full
 * payment is due — and that within 14 days of the event the deposit is no longer
 * refundable.
 *
 * SAFETY: a reminder is only sent when payment status is *positively known to be
 * unpaid*. Until the Deskworks invoice lookup is implemented (see
 * deskworksPayments.js), status is "unknown" and nothing is sent — so this is
 * safe to ship before the Deskworks API key exists. The whole sweep is also
 * gated behind PAYMENT_REMINDERS_ENABLED (default off): while off it runs as a
 * dry run that logs what it *would* send.
 *
 * Trigger: an in-process daily schedule (server.js) and/or a token-protected
 * endpoint POST /api/cron/payment-reminders. Matching the event date *exactly*
 * N days out means each booking is reminded once.
 */

import { getBookingsForDate } from "./googleCalendar.js";
import { getPaymentStatus } from "./deskworksPayments.js";
import { sendPaymentReminder } from "./email.js";

const DAYS_OUT = Number(process.env.PAYMENT_REMINDER_DAYS || "30");
const ENABLED = String(process.env.PAYMENT_REMINDERS_ENABLED || "false") === "true";
// If true, send reminders even when Deskworks can't confirm payment status yet
// (treats "unknown" as "unpaid"). Default false so we never email a paid guest.
const ASSUME_UNPAID =
  String(process.env.PAYMENT_REMINDER_ASSUME_UNPAID || "false") === "true";

/** Today + n days as YYYY-MM-DD, in the given IANA timezone (default Eastern). */
function dateNDaysOut(n, timeZone = process.env.EVENT_TIMEZONE || "America/New_York") {
  const now = new Date();
  // "today" in the venue's timezone, as YYYY-MM-DD
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = todayStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/**
 * Run the sweep once.
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun] - force a no-send preview regardless of ENABLED.
 * @param {number}  [opts.daysOut] - override the default 30-day window.
 * @returns {Promise<object>} a summary of what happened.
 */
export async function runPaymentReminderSweep(opts = {}) {
  const daysOut = Number(opts.daysOut ?? DAYS_OUT);
  const dryRun = opts.dryRun === true || !ENABLED;
  const targetDate = dateNDaysOut(daysOut);

  const summary = {
    targetDate,
    daysOut,
    enabled: ENABLED,
    dryRun,
    found: 0,
    sent: 0,
    skippedPaid: 0,
    skippedUnknown: 0,
    skippedNoEmail: 0,
    errors: [],
  };

  let bookings = [];
  try {
    const res = await getBookingsForDate(targetDate);
    if (!res.configured) {
      summary.note = "calendar not configured — nothing to sweep";
      console.log("[payment-reminders]", summary.note);
      return summary;
    }
    bookings = res.bookings;
  } catch (err) {
    console.error("[payment-reminders] calendar lookup failed:", err.message);
    summary.errors.push(`calendar: ${err.message}`);
    return summary;
  }

  summary.found = bookings.length;

  for (const booking of bookings) {
    if (!booking.email) {
      summary.skippedNoEmail++;
      continue;
    }
    let status;
    try {
      status = await getPaymentStatus(booking);
    } catch (err) {
      console.error(`[payment-reminders] payment lookup failed for ${booking.email}:`, err.message);
      summary.errors.push(`payment(${booking.email}): ${err.message}`);
      status = { configured: false, paidInFull: null };
    }

    if (status.paidInFull === true) {
      summary.skippedPaid++;
      continue;
    }

    // Decide whether this counts as "unpaid → remind".
    const known = status.paidInFull === false;
    const shouldRemind = known || (status.paidInFull === null && ASSUME_UNPAID);
    if (!shouldRemind) {
      summary.skippedUnknown++;
      console.log(
        `[payment-reminders] ${booking.email} (${booking.eventDate}): payment status unknown — skipping (set PAYMENT_REMINDER_ASSUME_UNPAID=true to remind anyway).`
      );
      continue;
    }

    if (dryRun) {
      summary.sent++; // counts as "would send"
      console.log(
        `[payment-reminders] DRY RUN — would remind ${booking.email} for ${booking.eventDate}` +
          (status.balanceDue != null ? ` (balance $${status.balanceDue})` : "")
      );
      continue;
    }

    try {
      await sendPaymentReminder({
        name: booking.name,
        email: booking.email,
        eventDate: booking.eventDate,
        balanceDue: status.balanceDue ?? undefined,
        invoiceUrl: status.invoiceUrl ?? undefined,
      });
      summary.sent++;
      console.log(`[payment-reminders] reminded ${booking.email} for ${booking.eventDate}`);
    } catch (err) {
      console.error(`[payment-reminders] send failed for ${booking.email}:`, err.message);
      summary.errors.push(`send(${booking.email}): ${err.message}`);
    }
  }

  console.log("[payment-reminders] sweep complete:", summary);
  return summary;
}
