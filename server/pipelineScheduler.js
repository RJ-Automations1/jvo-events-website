/**
 * Pipeline timeline scheduler.
 * ----------------------------
 * Runs from the existing daily node-cron hook (server.js) and walks every event
 * in the SQLite pipeline with a future date and an active status, sending the
 * timeline emails from the JVO automated booking workflow:
 *
 *   45 days out  courtesy reminder
 *   21 / 17 / 15 days out  balance reminders (exact days)
 *   15 days out  details-verification request (link to /verify/:token)
 *   14 days out  final-payment-due notice — the contractual cutoff: pay in
 *                full or the booking is cancelled with no refund
 *                (+ auto booked → awaiting_final_payment)
 *   13–1 days out  PAST DUE notice: balance still owing inside the cutoff, so
 *                the reservation is at risk. Also catches a booking whose
 *                14-day notice never went out.
 *    3 days out  final event reminder to the guest + prep summary to staff
 *
 * NOTE: day 15 carries both a balance reminder and the details-verification
 * request, so a guest who owes money gets two emails that day. They serve
 * different purposes; move verify_15 if that's not wanted.
 *
 * Unpaid past the 14-day cutoff, the booking is VOIDED — see AUTO_VOID_ENABLED
 * below; that step is off by default because cancelling a real booking is not
 * something a cron should start doing without someone deciding it should.
 *
 * The money kinds (21/17/15/14/past-due) all read the live balance from Stripe
 * and are skipped the moment it shows paid in full — nobody is chased for money
 * they've already sent.
 *
 * Staff scheduling (Step 7 of the workflow) rides the same sweep:
 *   ≤14 days out  understaffed events email every active staff member their
 *                 personal portal link (/staff/:portal_token) — one email per
 *                 staff per event, deduped as kind staffing_request_<staffId>
 *   ≤7 / ≤3 days  still understaffed → STAFFING ALERT to the venue inbox
 *                 (kinds staffing_alert_7 / staffing_alert_3)
 *
 * Each send is recorded in email_log — UNIQUE(event_id, kind) means every kind
 * goes out at most once per event, so a missed day is caught on the next sweep
 * (each kind fires inside a window, not only on the exact day).
 *
 * SAFETY: gated behind PIPELINE_EMAILS_ENABLED (default false). While off, the
 * sweep is a dry run that logs "[pipeline] would send …" lines and records
 * nothing — so flipping the flag later sends everything that's genuinely due.
 * The 14-day status auto-transition still runs while emails are off (it's
 * internal bookkeeping the admin board relies on, and emails nobody).
 */

import { getDb, nowIso } from "./db.js";
import { ACTIVE_STATUSES, STAFFING_STATUSES, transition } from "./pipeline.js";
import { activeStaff, assignmentCount, staffNeeded } from "./staffing.js";
import { getInvoiceStatus, invoicesConfigured, voidEventInvoice } from "./stripeInvoices.js";
import { payLinkUrl, payLinksConfigured } from "./partialPayments.js";
import { releaseCalendarHold } from "./googleCalendar.js";
import {
  sendCourtesyReminder,
  sendPaymentReminder,
  sendDetailsVerificationRequest,
  sendFinalPaymentDue,
  sendPastDueNotice,
  sendBookingVoided,
  sendEventFinalReminder,
  sendEventSummaryToStaff,
  sendStaffAvailabilityRequest,
  sendStaffingAlert,
  sendInvoiceNoticeToVenue,
} from "./email.js";

const ENABLED = String(process.env.PIPELINE_EMAILS_ENABLED || "false") === "true";
const SITE_URL = (process.env.SITE_URL || "https://jvoevents.com").replace(/\/+$/, "");

/**
 * Days a past-due guest gets to pay before staff cancel the booking. The
 * contractual cutoff is 14 days out; once that passes the terms allow immediate
 * cancellation, so this grace window is a courtesy — set it to whatever JVO
 * actually honours rather than letting the email imply a promise nobody keeps.
 */
const PAST_DUE_GRACE_DAYS = Number(process.env.PAST_DUE_GRACE_DAYS || "3");

/**
 * Whether the sweep may VOID a booking whose balance missed the 14-day cutoff:
 * cancel it, void the Stripe invoice, release the date, and email the guest.
 *
 * OFF by default, and separate from PIPELINE_EMAILS_ENABLED on purpose. Every
 * other step in this file sends a message; this one destroys a booking and
 * keeps someone's $150. That should never start happening as a side effect of
 * turning emails on — it needs its own deliberate decision.
 *
 * Even when on, a booking is only voided AFTER its past-due notice has gone out
 * and the grace period in that email has expired. Nobody is cancelled without
 * first being told, in writing, the date by which they had to pay.
 */
const AUTO_VOID_ENABLED = String(process.env.AUTO_VOID_ENABLED || "false") === "true";

/** Add days to a YYYY-MM-DD, staying on plain calendar dates (no timezone drift). */
function addDaysYmd(ymd, n) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Today as YYYY-MM-DD in the venue's timezone (default Eastern). */
function todayYmd(timeZone = process.env.EVENT_TIMEZONE || "America/New_York") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Whole days between today and a YYYY-MM-DD date (positive = in the future). */
function daysUntil(ymd, today) {
  const toUtc = (s) => {
    const [y, m, d] = String(s).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(ymd) - toUtc(today)) / 86400000);
}

/**
 * Stripe balance lookups for this sweep, keyed by event id.
 *
 * Both money reminders need the same answer ("what's left on this booking?") in
 * their skip AND their send, and every event would otherwise cost two extra API
 * round trips. Cleared at the top of each sweep so a balance paid between runs
 * is picked up next time.
 */
let paymentCache = new Map();

/**
 * What Stripe says is outstanding on this booking.
 * Falls back to an all-null "unknown" when Stripe isn't configured or errors —
 * and every caller treats unknown as "say nothing about the amount", never as
 * "assume unpaid" or "assume paid".
 */
async function paymentFor(ev) {
  if (paymentCache.has(ev.id)) return paymentCache.get(ev.id);
  const unknown = { configured: false, paidInFull: null, balanceDue: null, invoiceUrl: null };
  let status = unknown;
  if (invoicesConfigured()) {
    try {
      status = await getInvoiceStatus({ email: ev.email, eventDate: ev.event_date });
      // Prefer OUR pay page over Stripe's hosted invoice page: Stripe's can only
      // take the full amount, ours lets the guest pay any part of it and shows
      // what's left. Falls back to the Stripe page if pay links aren't set up.
      if (status.invoiceId && payLinksConfigured()) {
        try {
          status = { ...status, invoiceUrl: payLinkUrl(status.invoiceId, SITE_URL) };
        } catch (err) {
          console.warn(`[pipeline] pay link failed for ${ev.public_id}: ${err.message}`);
        }
      }
    } catch (err) {
      console.warn(`[pipeline] Stripe lookup failed for ${ev.public_id}: ${err.message}`);
      status = unknown;
    }
  }
  paymentCache.set(ev.id, status);
  return status;
}

/** Don't chase money Stripe already shows as settled. */
async function skipIfPaid(ev) {
  const { paidInFull } = await paymentFor(ev);
  return paidInFull === true ? "Stripe shows this booking paid in full" : "";
}

/**
 * The reminder kinds, oldest window first. Each fires when daysOut falls inside
 * [min, max] and the kind hasn't been logged for the event yet — so an event
 * booked 20 days out simply skips the 45/30-day kinds and starts at 15.
 *
 * `skip` may be async — the money kinds ask Stripe before deciding.
 */
const KINDS = [
  {
    kind: "courtesy_45",
    min: 31,
    max: 45,
    send: (ev) => sendCourtesyReminder(ev),
  },
  // ── Payment chase: 21 → 17 → 15 days out ────────────────────────────────
  // Exact days (min === max), not windows: they sit close enough together that
  // overlapping windows would let the first one swallow the rest, and the guest
  // would get a single reminder instead of three. A sweep that doesn't run
  // loses that day's notice, but the remaining notices — and past_due below —
  // still catch the booking, so nothing falls through entirely.
  ...[21, 17, 15].map((day) => ({
    kind: `balance_${day}`,
    min: day,
    max: day,
    skip: skipIfPaid,
    send: async (ev) => {
      const pay = await paymentFor(ev);
      return sendPaymentReminder({
        name: ev.name,
        email: ev.email,
        eventDate: ev.event_date,
        balanceDue: pay.balanceDue ?? undefined,
        invoiceUrl: pay.invoiceUrl ?? undefined,
        daysOut: day,
      });
    },
  })),
  {
    kind: "verify_15",
    min: 4,
    max: 15,
    skip: (ev) => (ev.details_verified_at ? "details already verified" : ""),
    send: (ev) => sendDetailsVerificationRequest(ev, `${SITE_URL}/verify/${ev.verify_token}`),
  },
  {
    // The cutoff notice: balance due today, or the booking is cancelled and the
    // $150 deposit is forfeit. Exact day, like the chases above.
    kind: "final_due_14",
    min: 14,
    max: 14,
    skip: async (ev) =>
      ev.final_paid_at ? "final payment already recorded" : skipIfPaid(ev),
    send: async (ev) => {
      const pay = await paymentFor(ev);
      return sendFinalPaymentDue({
        ...ev,
        balanceDue: pay.balanceDue ?? undefined,
        invoiceUrl: pay.invoiceUrl ?? undefined,
      });
    },
  },
  {
    // PAST DUE. Inside the 14-day cutoff and Stripe still shows money owing —
    // the reservation is now at risk. Deliberately a WINDOW, not an exact day:
    // it is the safety net that catches a booking whose 14-day notice was
    // missed (server down, added to the pipeline late), so nobody reaches their
    // event date having never been told their reservation was in jeopardy.
    kind: "past_due",
    min: 1,
    max: 13,
    skip: async (ev) =>
      ev.final_paid_at ? "final payment already recorded" : skipIfPaid(ev),
    send: async (ev) => {
      const pay = await paymentFor(ev);
      // Tell JVO at the same moment the guest is told — the venue needs to know
      // a booking is at risk while there's still time to chase it by phone.
      try {
        await sendInvoiceNoticeToVenue(
          {
            name: ev.name,
            email: ev.email,
            event_date: ev.event_date,
            publicId: ev.public_id,
            invoiceUrl: pay.invoiceUrl,
            amountDue: pay.balanceDue,
            dueDate: addDaysYmd(ev.event_date, -14),
          },
          "past_due"
        );
      } catch (err) {
        console.warn(`[pipeline] venue past-due alert failed for ${ev.public_id}: ${err.message}`);
      }
      return sendPastDueNotice({
        ...ev,
        balanceDue: pay.balanceDue ?? undefined,
        invoiceUrl: pay.invoiceUrl ?? undefined,
        // The date the balance was contractually due — 14 days before the event.
        cutoffDate: addDaysYmd(ev.event_date, -14),
        // Someone who BOOKED inside the 14-day window never had a deadline to
        // miss; their terms are "full balance up front". Telling them they
        // missed a cutoff that predates their own booking reads as a mistake
        // and invites an argument, so the email changes wording instead.
        bookedAfterCutoff:
          String(ev.created_at || "").slice(0, 10) > addDaysYmd(ev.event_date, -14),
        // How long they now have to save the booking before staff cancel it.
        graceDays: PAST_DUE_GRACE_DAYS,
      });
    },
  },
  {
    kind: "event_3day_guest",
    min: 1,
    max: 3,
    send: (ev) => sendEventFinalReminder(ev),
  },
  {
    kind: "event_3day_staff",
    min: 1,
    max: 3,
    toStaff: true,
    send: (ev) => sendEventSummaryToStaff(ev),
  },
];

/**
 * Run the sweep once. Called by the daily cron in server.js.
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun] force a no-send preview regardless of ENABLED.
 * @returns {Promise<object>} summary of what happened.
 */
export async function runPipelineSweep(opts = {}) {
  const dryRun = opts.dryRun === true || !ENABLED;
  const today = todayYmd();
  paymentCache = new Map(); // fresh Stripe answers each sweep
  const summary = {
    today,
    enabled: ENABLED,
    dryRun,
    checked: 0,
    sent: 0,
    transitioned: 0,
    staffingRequests: 0,
    staffingAlerts: 0,
    errors: [],
  };

  const db = getDb();
  if (!db) {
    summary.note = "database unavailable — nothing to sweep";
    console.log("[pipeline]", summary.note);
    return summary;
  }

  const placeholders = ACTIVE_STATUSES.map(() => "?").join(",");
  const events = db
    .prepare(
      `SELECT * FROM events WHERE event_date > ? AND status IN (${placeholders}) ORDER BY event_date ASC`
    )
    .all(today, ...ACTIVE_STATUSES);
  summary.checked = events.length;

  const alreadySent = db.prepare(
    "SELECT 1 FROM email_log WHERE event_id = ? AND kind = ?"
  );
  const logSend = db.prepare(
    "INSERT OR IGNORE INTO email_log (event_id, kind, to_email, sent_at) VALUES (?, ?, ?, ?)"
  );

  for (const ev of events) {
    const daysOut = daysUntil(ev.event_date, today);

    // 14 days out: final payment window opens — booked events advance to
    // awaiting_final_payment automatically (staff only handle exceptions).
    if (daysOut <= 14 && ev.status === "booked") {
      const moved = transition(
        db,
        ev.id,
        "awaiting_final_payment",
        "scheduler",
        `auto: ${daysOut} days out, final payment now due`
      );
      if (moved.ok) {
        ev.status = "awaiting_final_payment";
        summary.transitioned++;
      } else {
        summary.errors.push(`transition(${ev.public_id}): ${moved.error}`);
      }
    }

    // No deposit, no emails. A registration isn't a booking until the Cheddar Up
    // deposit lands — before that the guest hears nothing from us, reminders
    // included. (Intake only creates a record once the deposit arrives, so this
    // mainly guards records made by hand or before the deposit rule existed.)
    if (ev.status === "awaiting_deposit" && !ev.deposit_paid_at) continue;

    for (const k of KINDS) {
      if (daysOut < k.min || daysOut > k.max) continue;
      if (alreadySent.get(ev.id, k.kind)) continue;
      // Awaited: the money kinds check Stripe before deciding to chase.
      const skipReason = k.skip ? await k.skip(ev) : "";
      if (skipReason) {
        console.log(`[pipeline] skip ${k.kind} for ${ev.public_id}: ${skipReason}`);
        continue;
      }
      if (!ev.email && !k.toStaff) continue;

      const label = `${k.kind} → ${k.toStaff ? "staff" : ev.email} (${ev.public_id}, ${ev.event_date}, ${daysOut}d out)`;
      if (dryRun) {
        summary.sent++; // counts as "would send"
        console.log(`[pipeline] DRY RUN — would send ${label}`);
        continue;
      }
      try {
        const result = await k.send(ev);
        if (result?.configured === false) {
          console.warn(`[pipeline] SMTP not configured — skipped ${label}`);
          continue; // not logged, so it sends once SMTP exists
        }
        logSend.run(ev.id, k.kind, k.toStaff ? "staff" : ev.email || "", nowIso());
        summary.sent++;
        console.log(`[pipeline] sent ${label}`);
      } catch (err) {
        console.error(`[pipeline] send failed ${label}:`, err.message);
        summary.errors.push(`${k.kind}(${ev.public_id}): ${err.message}`);
      }
    }

    // --- Void a booking that never paid ------------------------------------
    // Only after the past-due notice went out AND the grace period in it has
    // expired — so the guest was told a deadline in writing before this runs.
    if (AUTO_VOID_ENABLED && daysOut < 14 && !ev.final_paid_at) {
      const notice = db
        .prepare("SELECT sent_at FROM email_log WHERE event_id = ? AND kind = 'past_due'")
        .get(ev.id);
      const graceOver =
        notice?.sent_at &&
        String(notice.sent_at).slice(0, 10) <= addDaysYmd(today, -PAST_DUE_GRACE_DAYS);

      if (graceOver) {
        const pay = await paymentFor(ev);
        if (pay.paidInFull === false) {
          if (dryRun) {
            console.log(`[pipeline] DRY RUN — would VOID ${ev.public_id} (${ev.event_date})`);
          } else {
            try {
              const voided = await voidEventInvoice({
                email: ev.email,
                eventDate: ev.event_date,
              });
              const released = await releaseCalendarHold({
                eventDate: ev.event_date,
                submissionId: ev.jotform_id,
              });
              const moved = transition(
                db,
                ev.id,
                "cancelled_nonpayment",
                "scheduler",
                `auto-void: balance unpaid past the 14-day cutoff`
              );
              if (moved.ok) {
                await sendBookingVoided({
                  ...ev,
                  cutoffDate: addDaysYmd(ev.event_date, -14),
                });
                summary.voided = (summary.voided || 0) + 1;
                console.warn(
                  `[pipeline] VOIDED ${ev.public_id}: invoice ${voided.ok ? "voided" : voided.reason}, ` +
                    `date ${released.ok ? "released" : released.reason}`
                );
              } else {
                summary.errors.push(`void(${ev.public_id}): ${moved.error}`);
              }
            } catch (err) {
              summary.errors.push(`void(${ev.public_id}): ${err.message}`);
              console.error(`[pipeline] void failed for ${ev.public_id}:`, err.message);
            }
          }
          continue; // cancelled — no staffing work for this event
        }
      }
    }

    // --- Staff scheduling (Step 7): availability requests + shortage alerts --
    if (!STAFFING_STATUSES.includes(ev.status)) continue;
    const needed = staffNeeded(ev);
    const confirmed = assignmentCount(db, ev.id);
    if (confirmed >= needed) continue; // fully staffed — nothing to chase

    // ≤14 days out: ask every active staff member for availability, once per
    // staff per event (kind staffing_request_<staffId>).
    if (daysOut <= 14) {
      for (const s of activeStaff(db)) {
        const kind = `staffing_request_${s.id}`;
        if (alreadySent.get(ev.id, kind)) continue;
        if (!s.email || !s.portal_token) continue;
        const label = `${kind} → ${s.email} (${ev.public_id}, ${ev.event_date}, ${daysOut}d out, ${confirmed}/${needed} staffed)`;
        if (dryRun) {
          summary.staffingRequests++;
          console.log(`[pipeline] DRY RUN — would send ${label}`);
          continue;
        }
        try {
          const result = await sendStaffAvailabilityRequest(s, ev, `${SITE_URL}/staff/${s.portal_token}`);
          if (result?.configured === false) {
            console.warn(`[pipeline] SMTP not configured — skipped ${label}`);
            continue; // not logged, so it sends once SMTP exists
          }
          logSend.run(ev.id, kind, s.email, nowIso());
          summary.staffingRequests++;
          console.log(`[pipeline] sent ${label}`);
        } catch (err) {
          console.error(`[pipeline] send failed ${label}:`, err.message);
          summary.errors.push(`${kind}(${ev.public_id}): ${err.message}`);
        }
      }
    }

    // ≤7 / ≤3 days out and still short → STAFFING ALERT to the venue inbox.
    // Windowed like KINDS so a late booking only triggers the tighter alert.
    for (const alert of [
      { kind: "staffing_alert_7", min: 4, max: 7 },
      { kind: "staffing_alert_3", min: 0, max: 3 },
    ]) {
      if (daysOut < alert.min || daysOut > alert.max) continue;
      if (alreadySent.get(ev.id, alert.kind)) continue;
      const label = `${alert.kind} → staff (${ev.public_id}, ${ev.event_date}, ${daysOut}d out, ${confirmed}/${needed} staffed)`;
      if (dryRun) {
        summary.staffingAlerts++;
        console.log(`[pipeline] DRY RUN — would send ${label}`);
        continue;
      }
      try {
        const result = await sendStaffingAlert(ev, needed, confirmed, daysOut);
        if (result?.configured === false) {
          console.warn(`[pipeline] SMTP not configured — skipped ${label}`);
          continue;
        }
        logSend.run(ev.id, alert.kind, "staff", nowIso());
        summary.staffingAlerts++;
        console.log(`[pipeline] sent ${label}`);
      } catch (err) {
        console.error(`[pipeline] send failed ${label}:`, err.message);
        summary.errors.push(`${alert.kind}(${ev.public_id}): ${err.message}`);
      }
    }
  }

  console.log("[pipeline] sweep complete:", summary);
  return summary;
}
