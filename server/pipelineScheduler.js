/**
 * Pipeline timeline scheduler.
 * ----------------------------
 * Runs from the existing daily node-cron hook (server.js) and walks every event
 * in the SQLite pipeline with a future date and an active status, sending the
 * timeline emails from the JVO automated booking workflow:
 *
 *   45 days out  courtesy reminder
 *   30 days out  balance reminder
 *   15 days out  details-verification request (link to /verify/:token)
 *   14 days out  final-payment-due notice (+ auto booked → awaiting_final_payment)
 *    3 days out  final event reminder to the guest + prep summary to staff
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
import { ACTIVE_STATUSES, transition } from "./pipeline.js";
import {
  sendCourtesyReminder,
  sendPaymentReminder,
  sendDetailsVerificationRequest,
  sendFinalPaymentDue,
  sendEventFinalReminder,
  sendEventSummaryToStaff,
} from "./email.js";

const ENABLED = String(process.env.PIPELINE_EMAILS_ENABLED || "false") === "true";
const SITE_URL = (process.env.SITE_URL || "https://jvoevents.com").replace(/\/+$/, "");

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
 * The reminder kinds, oldest window first. Each fires when daysOut falls inside
 * [min, max] and the kind hasn't been logged for the event yet — so an event
 * booked 20 days out simply skips the 45/30-day kinds and starts at 15.
 */
const KINDS = [
  {
    kind: "courtesy_45",
    min: 31,
    max: 45,
    send: (ev) => sendCourtesyReminder(ev),
  },
  {
    kind: "balance_30",
    min: 15,
    max: 30,
    // Reuse the standing 30-day balance reminder email.
    send: (ev) => sendPaymentReminder({ name: ev.name, email: ev.email, eventDate: ev.event_date }),
  },
  {
    kind: "verify_15",
    min: 4,
    max: 15,
    skip: (ev) => (ev.details_verified_at ? "details already verified" : ""),
    send: (ev) => sendDetailsVerificationRequest(ev, `${SITE_URL}/verify/${ev.verify_token}`),
  },
  {
    kind: "final_due_14",
    min: 4,
    max: 14,
    skip: (ev) => (ev.final_paid_at ? "final payment already recorded" : ""),
    send: (ev) => sendFinalPaymentDue(ev),
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
  const summary = { today, enabled: ENABLED, dryRun, checked: 0, sent: 0, transitioned: 0, errors: [] };

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

    for (const k of KINDS) {
      if (daysOut < k.min || daysOut > k.max) continue;
      if (alreadySent.get(ev.id, k.kind)) continue;
      const skipReason = k.skip ? k.skip(ev) : "";
      if (skipReason) continue;
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
  }

  console.log("[pipeline] sweep complete:", summary);
  return summary;
}
