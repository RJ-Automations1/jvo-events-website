/**
 * Staff-scheduling helpers (Step 7 of the automated booking workflow).
 * --------------------------------------------------------------------
 * Shared logic for the staff roster, availability responses, and event
 * assignments, used by:
 *   - server/pipelineScheduler.js  (availability requests + shortage alerts)
 *   - server/admin.js              (staff CRUD, assignment endpoints, reports)
 *   - server/staffPortal.js        (the /staff/:portal_token self-serve page)
 *
 * Everything here takes an already-open better-sqlite3 Database — callers own
 * the getDb() null-check, matching the graceful-degradation pattern everywhere
 * else in the server.
 */

import crypto from "node:crypto";
import { nowIso } from "./db.js";

/** What a staff member can answer on their portal page. */
export const AVAILABILITY_RESPONSES = [
  "full",
  "setup_only",
  "breakdown_only",
  "partial",
  "unavailable",
];

/** Roles an assignment can carry. */
export const ASSIGNMENT_ROLES = ["captain", "staff", "setup", "cleanup"];

/** Human labels shared by the portal and the admin dashboard. */
export const RESPONSE_LABELS = {
  full: "Can work the full event",
  setup_only: "Setup only",
  breakdown_only: "Breakdown only",
  partial: "Partially available",
  unavailable: "Can't work this one",
};

/** New crypto-random portal token (same shape as events.verify_token). */
export function newPortalToken() {
  return crypto.randomBytes(24).toString("hex");
}

/** All active staff, name order. */
export function activeStaff(db) {
  return db
    .prepare("SELECT * FROM staff WHERE active = 1 ORDER BY name COLLATE NOCASE ASC")
    .all();
}

/** Confirmed assignment count for one event. */
export function assignmentCount(db, eventId) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM assignments WHERE event_id = ?")
    .get(eventId).n;
}

/** staff_needed with the schema default applied for pre-migration rows. */
export function staffNeeded(ev) {
  const n = Number(ev.staff_needed);
  return Number.isFinite(n) && n >= 0 ? n : 2;
}

/**
 * Default hours for an assignment: the event's booked duration.
 * Parses start/end times when both are present ("HH:MM", overnight-safe);
 * otherwise falls back to the package (full day 10h, everything else — half
 * day — 5h, per the JVO rental packages).
 */
export function bookedHours(ev) {
  const parse = (s) => {
    const m = String(s || "").match(/^(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const start = parse(ev.start_time);
  const end = parse(ev.end_time);
  if (start != null && end != null && start !== end) {
    let mins = end - start;
    if (mins < 0) mins += 24 * 60; // crosses midnight
    return Math.round((mins / 60) * 100) / 100;
  }
  return /full/i.test(String(ev.package || "")) ? 10 : 5;
}

/**
 * The full staffing picture for one event: needed vs confirmed, plus a roster
 * row per relevant staff member (all active staff + anyone inactive who still
 * holds an availability response or assignment for this event).
 */
export function staffingForEvent(db, ev) {
  const roster = db
    .prepare(
      `SELECT s.id, s.name, s.email, s.phone, s.role, s.active,
              av.response AS availability_response, av.note AS availability_note,
              av.responded_at,
              a.role AS assigned_role, a.hours AS assigned_hours, a.assigned_at
       FROM staff s
       LEFT JOIN availability av ON av.staff_id = s.id AND av.event_id = @eventId
       LEFT JOIN assignments a  ON a.staff_id  = s.id AND a.event_id  = @eventId
       WHERE s.active = 1 OR av.id IS NOT NULL OR a.id IS NOT NULL
       ORDER BY s.name COLLATE NOCASE ASC`
    )
    .all({ eventId: ev.id });
  const needed = staffNeeded(ev);
  const confirmed = roster.filter((r) => r.assigned_role != null).length;
  return { staff_needed: needed, confirmed, fully_staffed: confirmed >= needed, roster };
}

/**
 * Upsert one staff member's availability answer for one event.
 * @returns the fresh availability row.
 */
export function upsertAvailability(db, eventId, staffId, response, note) {
  const at = nowIso();
  db.prepare(
    `INSERT INTO availability (event_id, staff_id, response, note, responded_at)
     VALUES (@eventId, @staffId, @response, @note, @at)
     ON CONFLICT(event_id, staff_id)
     DO UPDATE SET response = @response, note = @note, responded_at = @at`
  ).run({ eventId, staffId, response, note: note || "", at });
  return db
    .prepare("SELECT * FROM availability WHERE event_id = ? AND staff_id = ?")
    .get(eventId, staffId);
}

/**
 * Upsert an assignment (assigning twice just updates the role). Hours are set
 * from the event's booked duration on first assignment and preserved on
 * re-assignment (staff may have tuned them).
 * @returns the fresh assignment row.
 */
export function upsertAssignment(db, ev, staffId, role) {
  const at = nowIso();
  db.prepare(
    `INSERT INTO assignments (event_id, staff_id, role, hours, assigned_at)
     VALUES (@eventId, @staffId, @role, @hours, @at)
     ON CONFLICT(event_id, staff_id) DO UPDATE SET role = @role`
  ).run({ eventId: ev.id, staffId, role, hours: bookedHours(ev), at });
  return db
    .prepare("SELECT * FROM assignments WHERE event_id = ? AND staff_id = ?")
    .get(ev.id, staffId);
}

/**
 * Per-staff hours totals for a calendar month (events dated YYYY-MM-*),
 * excluding cancelled events — the simple payroll report.
 */
export function hoursReport(db, month) {
  return db
    .prepare(
      `SELECT s.id AS staff_id, s.name, s.role AS staff_role,
              COUNT(a.id) AS events_worked,
              ROUND(SUM(COALESCE(a.hours, 0)), 2) AS total_hours
       FROM assignments a
       JOIN staff s  ON s.id = a.staff_id
       JOIN events e ON e.id = a.event_id
       WHERE e.event_date LIKE ? || '-%'
         AND e.status NOT IN ('cancelled_customer', 'cancelled_nonpayment')
       GROUP BY s.id
       ORDER BY s.name COLLATE NOCASE ASC`
    )
    .all(month);
}
