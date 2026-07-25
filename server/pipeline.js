/**
 * Event status pipeline.
 * ----------------------
 * Every event booking moves through a fixed status pipeline (from the JVO
 * automated booking workflow doc):
 *
 *   awaiting_deposit → booked → awaiting_final_payment → paid_in_full
 *     → staff_scheduling → ready → complete → archived
 *
 * (staff_scheduling is optional — an event that's already fully staffed can go
 * straight from paid_in_full to ready, matching the pre-scheduler flow)
 *
 * with exception statuses:
 *   needs_review          — something needs a human (e.g. guest changed their
 *                           details); resolves back to the status it came from
 *   cancelled_customer    — the guest cancelled
 *   cancelled_nonpayment  — final payment missed the 14-day cutoff
 *
 * Staff only ever handle exceptions; everything else advances automatically
 * (JotForm webhook → awaiting_deposit, payment marks, the daily scheduler).
 */

import crypto from "node:crypto";
import { nowIso } from "./db.js";

export const STATUSES = [
  "awaiting_deposit",
  "booked",
  "awaiting_final_payment",
  "paid_in_full",
  "staff_scheduling",
  "ready",
  "complete",
  "archived",
  "needs_review",
  "cancelled_customer",
  "cancelled_nonpayment",
];

/** Statuses of events still moving toward their date (scheduler acts on these). */
export const ACTIVE_STATUSES = [
  "awaiting_deposit",
  "booked",
  "awaiting_final_payment",
  "paid_in_full",
  "staff_scheduling",
  "ready",
];

/**
 * Statuses where the staff scheduler cares about the event: booked (or later)
 * but not yet marked ready — availability requests and shortage alerts only
 * make sense in this window.
 */
export const STAFFING_STATUSES = [
  "booked",
  "awaiting_final_payment",
  "paid_in_full",
  "staff_scheduling",
];

const CANCELLED = ["cancelled_customer", "cancelled_nonpayment"];

/**
 * from-status → the statuses it may move to. Any active status can also drop
 * into needs_review or either cancelled status. needs_review is special-cased
 * in transition(): it returns to the status it came from (looked up in
 * status_history), or can be cancelled.
 */
export const ALLOWED_TRANSITIONS = {
  awaiting_deposit: ["booked", "needs_review", ...CANCELLED],
  booked: ["awaiting_final_payment", "paid_in_full", "needs_review", ...CANCELLED],
  awaiting_final_payment: ["paid_in_full", "needs_review", ...CANCELLED],
  paid_in_full: ["staff_scheduling", "ready", "needs_review", ...CANCELLED],
  staff_scheduling: ["ready", "needs_review", ...CANCELLED],
  ready: ["complete", "needs_review", ...CANCELLED],
  complete: ["archived", "needs_review"],
  archived: [],
  // Resolved dynamically — see transition(). Cancelling is always allowed.
  needs_review: CANCELLED,
  cancelled_customer: ["archived"],
  cancelled_nonpayment: ["archived"],
};

/**
 * The status a needs_review event should return to: the from_status of its most
 * recent hop INTO needs_review. Falls back to null when history is missing.
 */
export function reviewReturnStatus(db, eventId) {
  const row = db
    .prepare(
      `SELECT from_status FROM status_history
       WHERE event_id = ? AND to_status = 'needs_review'
       ORDER BY id DESC LIMIT 1`
    )
    .get(eventId);
  return row?.from_status || null;
}

/**
 * Move an event to a new status, validating the hop against
 * ALLOWED_TRANSITIONS, stamping payment timestamps where the hop implies them,
 * and appending a status_history row.
 *
 * @param {import("better-sqlite3").Database} db
 * @param {number} eventId
 * @param {string} to     target status
 * @param {string} actor  who did it ("staff", "scheduler", "webhook", "customer")
 * @param {string} [note] optional context recorded in the history row
 * @returns {{ok: true, event: object} | {ok: false, error: string}}
 */
export function transition(db, eventId, to, actor, note = "") {
  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(eventId);
  if (!event) return { ok: false, error: "event not found" };
  if (!STATUSES.includes(to)) return { ok: false, error: `unknown status "${to}"` };

  const from = event.status;
  let allowed = ALLOWED_TRANSITIONS[from] || [];
  if (from === "needs_review") {
    const back = reviewReturnStatus(db, eventId);
    allowed = back ? [back, ...allowed] : [...allowed];
  }
  if (!allowed.includes(to)) {
    return {
      ok: false,
      error: `cannot move from "${from}" to "${to}" (allowed: ${allowed.join(", ") || "none"})`,
    };
  }

  const at = nowIso();
  const stamps = [];
  const params = { id: eventId, to, at };
  // Payment milestones ride along with their status hops.
  if (to === "booked" && !event.deposit_paid_at) {
    stamps.push("deposit_paid_at = @at");
  }
  if (to === "paid_in_full" && !event.final_paid_at) {
    stamps.push("final_paid_at = @at");
  }

  const apply = db.transaction(() => {
    db.prepare(
      `UPDATE events SET status = @to, updated_at = @at${stamps.length ? ", " + stamps.join(", ") : ""} WHERE id = @id`
    ).run(params);
    db.prepare(
      `INSERT INTO status_history (event_id, from_status, to_status, actor, note, at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(eventId, from, to, actor || "system", note || "", at);
  });
  apply();

  return { ok: true, event: db.prepare("SELECT * FROM events WHERE id = ?").get(eventId) };
}

/** Next public id for the year, e.g. JVO-EV-2026-0001 (zero-padded counter). */
function nextPublicId(db, year) {
  const prefix = `JVO-EV-${year}-`;
  const row = db
    .prepare(
      `SELECT MAX(CAST(SUBSTR(public_id, ?) AS INTEGER)) AS n FROM events WHERE public_id LIKE ?`
    )
    .get(prefix.length + 1, `${prefix}%`);
  const n = (row?.n || 0) + 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

/**
 * Insert a new event record in status awaiting_deposit, generating its public
 * id and a crypto-random details-verification token. Idempotent on jotform_id:
 * if a record for the same JotForm submission already exists (webhook retry /
 * double submit) it is returned untouched apart from backfilling a missing
 * calendar_event_id.
 *
 * @param {import("better-sqlite3").Database} db
 * @param {object} b booking payload — { name, email, phone?, eventDate,
 *   eventType?, package?, guestCount?, message?, submissionId?, calendarEventId? }
 * @returns {{event: object, created: boolean}}
 */
export function createEventRecord(db, b) {
  const jotformId = b.submissionId ? String(b.submissionId) : null;

  if (jotformId) {
    const existing = db.prepare("SELECT * FROM events WHERE jotform_id = ?").get(jotformId);
    if (existing) {
      if (!existing.calendar_event_id && b.calendarEventId) {
        db.prepare("UPDATE events SET calendar_event_id = ?, updated_at = ? WHERE id = ?").run(
          String(b.calendarEventId),
          nowIso(),
          existing.id
        );
      }
      return { event: db.prepare("SELECT * FROM events WHERE id = ?").get(existing.id), created: false };
    }
  }

  const at = nowIso();
  const year = Number(String(b.eventDate || "").slice(0, 4)) || new Date().getFullYear();
  const guestCount = Number.parseInt(String(b.guestCount ?? ""), 10);

  const insert = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO events (
           public_id, status, name, email, phone, event_type, event_date,
           guest_count, package, notes, jotform_id, calendar_event_id,
           verify_token, created_at, updated_at
         ) VALUES (
           @public_id, 'awaiting_deposit', @name, @email, @phone, @event_type,
           @event_date, @guest_count, @package, @notes, @jotform_id,
           @calendar_event_id, @verify_token, @at, @at
         )`
      )
      .run({
        public_id: nextPublicId(db, year),
        name: b.name || "",
        email: b.email || "",
        phone: b.phone || "",
        event_type: b.eventType || "",
        event_date: String(b.eventDate || "").slice(0, 10),
        guest_count: Number.isFinite(guestCount) ? guestCount : null,
        package: b.package || "",
        notes: b.message || "",
        jotform_id: jotformId,
        calendar_event_id: b.calendarEventId ? String(b.calendarEventId) : null,
        verify_token: crypto.randomBytes(24).toString("hex"),
        at,
      });
    db.prepare(
      `INSERT INTO status_history (event_id, from_status, to_status, actor, note, at)
       VALUES (?, NULL, 'awaiting_deposit', ?, ?, ?)`
    ).run(info.lastInsertRowid, "webhook", "booking received", at);
    return info.lastInsertRowid;
  });

  const id = insert();
  return { event: db.prepare("SELECT * FROM events WHERE id = ?").get(id), created: true };
}
