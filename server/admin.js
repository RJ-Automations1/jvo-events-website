/**
 * Staff admin dashboard for the event-booking pipeline.
 * -----------------------------------------------------
 * Express-served (NOT part of the Vite SPA):
 *   GET  /admin                         — self-contained dashboard page
 *   GET  /api/admin/events?status=      — list events (optionally one status)
 *   GET  /api/admin/events/:id          — one event + history + staffing
 *   POST /api/admin/events/:id/transition  {to, note}
 *   PATCH /api/admin/events/:id         {notes?, staff_needed?}
 *
 * Staff scheduling (Step 7 of the workflow):
 *   GET    /api/admin/staff                       — the roster
 *   POST   /api/admin/staff                       {name, email, phone?, role?}
 *   PATCH  /api/admin/staff/:id                   {name?, email?, phone?, role?, active?}
 *   DELETE /api/admin/staff/:id                   — soft delete (active = 0)
 *   POST   /api/admin/events/:id/assignments      {staffId, role}
 *   PATCH  /api/admin/events/:id/assignments/:staffId  {hours}
 *   DELETE /api/admin/events/:id/assignments/:staffId
 *   GET    /api/admin/reports/hours?month=YYYY-MM — per-staff hours totals
 *
 * All routes sit behind HTTP Basic Auth (ADMIN_USER / ADMIN_PASSWORD env vars).
 * If those aren't set the routes answer 503 "not configured" — nothing is ever
 * exposed unauthenticated by accident. All admin actions record actor "staff".
 */

import crypto from "node:crypto";
import express from "express";
import { getDb, nowIso } from "./db.js";
import { STATUSES, ALLOWED_TRANSITIONS, reviewReturnStatus, transition } from "./pipeline.js";
import {
  ASSIGNMENT_ROLES,
  hoursReport,
  newPortalToken,
  staffingForEvent,
  upsertAssignment,
} from "./staffing.js";
import { sendStaffAssignmentConfirmation } from "./email.js";

const ADMIN_USER = process.env.ADMIN_USER || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
// Assignment confirmation emails obey the same kill switch as every other
// pipeline send: while false they only log a "[admin] DRY RUN" line.
const PIPELINE_EMAILS_ENABLED =
  String(process.env.PIPELINE_EMAILS_ENABLED || "false") === "true";

/** Constant-time string compare (avoids leaking prefix length via timing). */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** HTTP Basic Auth gate. 503 when creds aren't configured, 401 on a bad login. */
function requireAdmin(req, res, next) {
  if (!ADMIN_USER || !ADMIN_PASSWORD) {
    return res.status(503).send("Admin dashboard not configured (set ADMIN_USER and ADMIN_PASSWORD).");
  }
  const header = req.headers.authorization || "";
  const m = header.match(/^Basic (.+)$/);
  if (m) {
    const decoded = Buffer.from(m[1], "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    const user = idx >= 0 ? decoded.slice(0, idx) : decoded;
    const pass = idx >= 0 ? decoded.slice(idx + 1) : "";
    if (safeEqual(user, ADMIN_USER) && safeEqual(pass, ADMIN_PASSWORD)) return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="JVO Admin", charset="UTF-8"');
  return res.status(401).send("Authentication required.");
}

/** 503 helper when SQLite isn't available. */
function requireDb(res) {
  const db = getDb();
  if (!db) {
    res.status(503).json({ error: "database unavailable" });
    return null;
  }
  return db;
}

export const adminRouter = express.Router();
// Scope the auth gate to the admin paths only — this router is mounted at the
// app root, so a bare .use(requireAdmin) would challenge every request that
// flows through it (including /verify and the SPA fallback).
adminRouter.use(["/admin", "/api/admin"], requireAdmin);

/** List events, newest event date first. ?status= filters to one status. */
adminRouter.get("/api/admin/events", (req, res) => {
  const db = requireDb(res);
  if (!db) return;
  const status = req.query.status ? String(req.query.status) : "";
  const rows = status
    ? db.prepare("SELECT * FROM events WHERE status = ? ORDER BY event_date ASC, id ASC").all(status)
    : db.prepare("SELECT * FROM events ORDER BY event_date ASC, id ASC").all();
  res.json({ ok: true, statuses: STATUSES, events: rows });
});

/** One event with its status history, allowed transitions, and staffing. */
adminRouter.get("/api/admin/events/:id", (req, res) => {
  const db = requireDb(res);
  if (!db) return;
  const ev = db.prepare("SELECT * FROM events WHERE id = ?").get(Number(req.params.id));
  if (!ev) return res.status(404).json({ error: "event not found" });
  const history = db
    .prepare("SELECT * FROM status_history WHERE event_id = ? ORDER BY id ASC")
    .all(ev.id);
  let allowed = ALLOWED_TRANSITIONS[ev.status] || [];
  if (ev.status === "needs_review") {
    const back = reviewReturnStatus(db, ev.id);
    allowed = back ? [back, ...allowed] : [...allowed];
  }
  res.json({
    ok: true,
    event: ev,
    history,
    allowedTransitions: allowed,
    staffing: staffingForEvent(db, ev),
    assignmentRoles: ASSIGNMENT_ROLES,
  });
});

/** Move an event to a new status (validated by the pipeline rules). */
adminRouter.post("/api/admin/events/:id/transition", (req, res) => {
  const db = requireDb(res);
  if (!db) return;
  const to = String(req.body?.to || "");
  const note = req.body?.note ? String(req.body.note).slice(0, 2000) : "";
  const result = transition(db, Number(req.params.id), to, "staff", note);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ ok: true, event: result.event });
});

/** Update the staff notes and/or staff_needed on an event. */
adminRouter.patch("/api/admin/events/:id", (req, res) => {
  const db = requireDb(res);
  if (!db) return;
  const ev = db.prepare("SELECT id FROM events WHERE id = ?").get(Number(req.params.id));
  if (!ev) return res.status(404).json({ error: "event not found" });

  const sets = [];
  const params = { id: ev.id, at: nowIso() };
  if (typeof req.body?.notes === "string") {
    sets.push("notes = @notes");
    params.notes = String(req.body.notes).slice(0, 10000);
  }
  if (req.body?.staff_needed !== undefined) {
    const n = Number(req.body.staff_needed);
    if (!Number.isInteger(n) || n < 0 || n > 50) {
      return res.status(400).json({ error: "staff_needed must be an integer between 0 and 50" });
    }
    sets.push("staff_needed = @staff_needed");
    params.staff_needed = n;
  }
  if (!sets.length) {
    return res.status(400).json({ error: "nothing to update — send notes and/or staff_needed" });
  }
  db.prepare(`UPDATE events SET ${sets.join(", ")}, updated_at = @at WHERE id = @id`).run(params);
  res.json({ ok: true, event: db.prepare("SELECT * FROM events WHERE id = ?").get(ev.id) });
});

// --------------------------- Staff roster CRUD -----------------------------

/** The roster, active first. Includes each member's portal token so the
 *  dashboard can surface their /staff link (admin-only, behind Basic Auth). */
adminRouter.get("/api/admin/staff", (req, res) => {
  const db = requireDb(res);
  if (!db) return;
  const staff = db
    .prepare("SELECT * FROM staff ORDER BY active DESC, name COLLATE NOCASE ASC")
    .all();
  res.json({ ok: true, staff });
});

/** Add a staff member (crypto-random portal token minted here). */
adminRouter.post("/api/admin/staff", (req, res) => {
  const db = requireDb(res);
  if (!db) return;
  const name = String(req.body?.name || "").trim().slice(0, 200);
  const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 320);
  const phone = String(req.body?.phone || "").trim().slice(0, 50);
  const role = String(req.body?.role || "event_staff").trim().slice(0, 100) || "event_staff";
  if (!name) return res.status(400).json({ error: "name is required" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "a valid email is required" });
  }
  try {
    const info = db
      .prepare(
        `INSERT INTO staff (name, email, phone, role, active, portal_token, created_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`
      )
      .run(name, email, phone, role, newPortalToken(), nowIso());
    res.json({ ok: true, staff: db.prepare("SELECT * FROM staff WHERE id = ?").get(info.lastInsertRowid) });
  } catch (err) {
    if (/UNIQUE/.test(err.message)) {
      return res.status(409).json({ error: "a staff member with that email already exists" });
    }
    throw err;
  }
});

/** Edit a staff member (name/email/phone/role/active). */
adminRouter.patch("/api/admin/staff/:id", (req, res) => {
  const db = requireDb(res);
  if (!db) return;
  const member = db.prepare("SELECT * FROM staff WHERE id = ?").get(Number(req.params.id));
  if (!member) return res.status(404).json({ error: "staff member not found" });

  const sets = [];
  const params = { id: member.id };
  if (typeof req.body?.name === "string" && req.body.name.trim()) {
    sets.push("name = @name");
    params.name = req.body.name.trim().slice(0, 200);
  }
  if (typeof req.body?.email === "string") {
    const email = req.body.email.trim().toLowerCase().slice(0, 320);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "invalid email" });
    }
    sets.push("email = @email");
    params.email = email;
  }
  if (typeof req.body?.phone === "string") {
    sets.push("phone = @phone");
    params.phone = req.body.phone.trim().slice(0, 50);
  }
  if (typeof req.body?.role === "string" && req.body.role.trim()) {
    sets.push("role = @role");
    params.role = req.body.role.trim().slice(0, 100);
  }
  if (req.body?.active !== undefined) {
    sets.push("active = @active");
    params.active = req.body.active ? 1 : 0;
  }
  if (!sets.length) return res.status(400).json({ error: "nothing to update" });
  try {
    db.prepare(`UPDATE staff SET ${sets.join(", ")} WHERE id = @id`).run(params);
  } catch (err) {
    if (/UNIQUE/.test(err.message)) {
      return res.status(409).json({ error: "a staff member with that email already exists" });
    }
    throw err;
  }
  res.json({ ok: true, staff: db.prepare("SELECT * FROM staff WHERE id = ?").get(member.id) });
});

/** "Delete" = deactivate. History (availability, assignments, hours) is kept. */
adminRouter.delete("/api/admin/staff/:id", (req, res) => {
  const db = requireDb(res);
  if (!db) return;
  const member = db.prepare("SELECT * FROM staff WHERE id = ?").get(Number(req.params.id));
  if (!member) return res.status(404).json({ error: "staff member not found" });
  db.prepare("UPDATE staff SET active = 0 WHERE id = ?").run(member.id);
  res.json({ ok: true, staff: db.prepare("SELECT * FROM staff WHERE id = ?").get(member.id) });
});

// ------------------------- Event assignments -------------------------------

/**
 * Send (or dry-run) the one-time assignment confirmation for staffId on this
 * event — email_log kind assignment_<staffId> keeps it to one email even if
 * the member is unassigned and re-assigned later.
 */
async function sendAssignmentConfirmation(db, ev, member, role, hours) {
  const kind = `assignment_${member.id}`;
  if (db.prepare("SELECT 1 FROM email_log WHERE event_id = ? AND kind = ?").get(ev.id, kind)) return;
  const label = `${kind} → ${member.email} (${ev.public_id}, ${ev.event_date})`;
  if (!PIPELINE_EMAILS_ENABLED) {
    console.log(`[admin] DRY RUN — would send ${label}`);
    return;
  }
  try {
    const result = await sendStaffAssignmentConfirmation(member, ev, role, hours);
    if (result?.configured === false) {
      console.warn(`[admin] SMTP not configured — skipped ${label}`);
      return; // not logged, so it sends once SMTP exists
    }
    db.prepare(
      "INSERT OR IGNORE INTO email_log (event_id, kind, to_email, sent_at) VALUES (?, ?, ?, ?)"
    ).run(ev.id, kind, member.email || "", nowIso());
    console.log(`[admin] sent ${label}`);
  } catch (err) {
    console.error(`[admin] send failed ${label}:`, err.message);
  }
}

/** Assign a staff member to an event (re-assigning updates the role). */
adminRouter.post("/api/admin/events/:id/assignments", async (req, res) => {
  const db = requireDb(res);
  if (!db) return;
  const ev = db.prepare("SELECT * FROM events WHERE id = ?").get(Number(req.params.id));
  if (!ev) return res.status(404).json({ error: "event not found" });
  const member = db.prepare("SELECT * FROM staff WHERE id = ?").get(Number(req.body?.staffId));
  if (!member) return res.status(404).json({ error: "staff member not found" });
  if (!member.active) return res.status(400).json({ error: "that staff member is deactivated" });
  const role = String(req.body?.role || "staff");
  if (!ASSIGNMENT_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${ASSIGNMENT_ROLES.join(", ")}` });
  }
  const assignment = upsertAssignment(db, ev, member.id, role);
  await sendAssignmentConfirmation(db, ev, member, role, assignment.hours);
  res.json({ ok: true, assignment, staffing: staffingForEvent(db, ev) });
});

/** Adjust the hours on an assignment (payroll). */
adminRouter.patch("/api/admin/events/:id/assignments/:staffId", (req, res) => {
  const db = requireDb(res);
  if (!db) return;
  const eventId = Number(req.params.id);
  const staffId = Number(req.params.staffId);
  const existing = db
    .prepare("SELECT * FROM assignments WHERE event_id = ? AND staff_id = ?")
    .get(eventId, staffId);
  if (!existing) return res.status(404).json({ error: "assignment not found" });
  const hours = Number(req.body?.hours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return res.status(400).json({ error: "hours must be a number between 0 and 24" });
  }
  db.prepare("UPDATE assignments SET hours = ? WHERE id = ?").run(hours, existing.id);
  res.json({
    ok: true,
    assignment: db.prepare("SELECT * FROM assignments WHERE id = ?").get(existing.id),
  });
});

/** Unassign a staff member from an event. */
adminRouter.delete("/api/admin/events/:id/assignments/:staffId", (req, res) => {
  const db = requireDb(res);
  if (!db) return;
  const ev = db.prepare("SELECT * FROM events WHERE id = ?").get(Number(req.params.id));
  if (!ev) return res.status(404).json({ error: "event not found" });
  const gone = db
    .prepare("DELETE FROM assignments WHERE event_id = ? AND staff_id = ?")
    .run(ev.id, Number(req.params.staffId));
  if (!gone.changes) return res.status(404).json({ error: "assignment not found" });
  res.json({ ok: true, staffing: staffingForEvent(db, ev) });
});

// ------------------------- Hours / payroll report --------------------------

/** Per-staff totals (events worked, hours) for one calendar month. */
adminRouter.get("/api/admin/reports/hours", (req, res) => {
  const db = requireDb(res);
  if (!db) return;
  const month = String(req.query.month || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return res.status(400).json({ error: "month must be YYYY-MM" });
  }
  res.json({ ok: true, month, rows: hoursReport(db, month) });
});

/** The dashboard itself — a single self-contained page (inline CSS + JS). */
adminRouter.get("/admin", (_req, res) => {
  res.type("html").send(ADMIN_PAGE);
});

const ADMIN_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>JVO Events — Booking Pipeline</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Lato:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root { --bg:#080808; --panel:#111111; --line:#242424; --gold:#C9A96A; --gold70:rgba(201,169,106,.7); --text:#f5f2ec; --muted:#9a948a; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:var(--bg); color:var(--text); font-family:'Lato',Arial,sans-serif; min-height:100vh; }
  header { padding:26px 28px 18px; border-bottom:1px solid var(--line); display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; }
  header h1 { font-family:'Playfair Display',Georgia,serif; font-weight:700; font-size:26px; letter-spacing:.5px; }
  header h1 span { color:var(--gold); }
  header .sub { color:var(--muted); font-size:12px; letter-spacing:2px; text-transform:uppercase; }
  main { display:grid; grid-template-columns: 1fr 400px; gap:0; min-height:calc(100vh - 71px); }
  @media (max-width: 980px) { main { grid-template-columns:1fr; } #detail { border-left:none; border-top:1px solid var(--line); } }
  #board { padding:22px 28px; overflow-x:auto; }
  .group { margin-bottom:26px; }
  .group h2 { font-family:'Playfair Display',Georgia,serif; font-size:16px; color:var(--gold); letter-spacing:1px; margin-bottom:10px; text-transform:capitalize; }
  .group h2 .count { color:var(--muted); font-family:'Lato',sans-serif; font-size:12px; margin-left:8px; }
  .card { background:var(--panel); border:1px solid var(--line); border-left:2px solid var(--gold70); padding:12px 16px; margin-bottom:8px; cursor:pointer; display:flex; justify-content:space-between; gap:12px; align-items:center; transition:border-color .15s; }
  .card:hover, .card.sel { border-color:var(--gold); }
  .card .who { font-weight:700; }
  .card .meta { color:var(--muted); font-size:13px; }
  .card .pid { color:var(--gold70); font-size:12px; letter-spacing:1px; }
  #detail { border-left:1px solid var(--line); background:#0c0c0c; padding:22px 24px; }
  #detail h2 { font-family:'Playfair Display',Georgia,serif; font-size:20px; margin-bottom:2px; }
  #detail .pid { color:var(--gold); font-size:12px; letter-spacing:2px; }
  .status-pill { display:inline-block; border:1px solid var(--gold70); color:var(--gold); padding:3px 10px; font-size:11px; letter-spacing:2px; text-transform:uppercase; margin:10px 0 16px; }
  dl { display:grid; grid-template-columns:auto 1fr; gap:4px 14px; font-size:14px; margin-bottom:16px; }
  dt { color:var(--muted); }
  dd { word-break:break-word; }
  .sec { color:var(--gold); font-size:11px; letter-spacing:2px; text-transform:uppercase; margin:18px 0 8px; }
  .actions { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:6px; }
  button { font-family:'Lato',sans-serif; font-size:13px; font-weight:700; padding:9px 14px; cursor:pointer; background:#fff; color:#080808; border:1px solid #fff; }
  button:hover { background:var(--gold); border-color:var(--gold); }
  button.ghost { background:transparent; color:var(--text); border:1px solid var(--line); font-weight:400; }
  button.ghost:hover { border-color:var(--gold); color:var(--gold); }
  button:disabled { opacity:.35; cursor:not-allowed; }
  textarea { width:100%; background:var(--panel); color:var(--text); border:1px solid var(--line); padding:10px; font-family:'Lato',sans-serif; font-size:14px; min-height:84px; resize:vertical; }
  textarea:focus { outline:none; border-color:var(--gold70); }
  .hist { font-size:13px; color:var(--muted); border-left:1px solid var(--line); padding-left:12px; }
  .hist div { margin-bottom:6px; }
  .hist b { color:var(--text); font-weight:700; }
  .empty { color:var(--muted); padding:30px 0; }
  #msg { position:fixed; bottom:18px; right:18px; background:var(--panel); border:1px solid var(--gold); color:var(--text); padding:10px 16px; font-size:13px; display:none; }
  .tabs { margin-left:auto; display:flex; gap:8px; }
  .tab { background:transparent; color:var(--muted); border:1px solid var(--line); font-weight:700; padding:8px 14px; font-size:11px; letter-spacing:2px; text-transform:uppercase; }
  .tab:hover { background:transparent; color:var(--gold); border-color:var(--gold); }
  .tab.sel { color:var(--gold); border-color:var(--gold); background:transparent; }
  .tabview { padding:26px 28px; }
  .viewtitle { font-family:'Playfair Display',Georgia,serif; color:var(--gold); font-size:20px; letter-spacing:1px; margin-bottom:16px; }
  table.grid { border-collapse:collapse; width:100%; max-width:980px; font-size:14px; }
  table.grid th { text-align:left; color:var(--gold); font-size:11px; letter-spacing:2px; text-transform:uppercase; padding:8px 10px; border-bottom:1px solid var(--line); font-weight:700; }
  table.grid td { padding:9px 10px; border-bottom:1px solid var(--line); vertical-align:middle; }
  table.grid tr.inactive td { color:var(--muted); }
  input[type=text], input[type=email], input[type=tel], input[type=month], input[type=number], select { background:var(--panel); color:var(--text); border:1px solid var(--line); padding:8px 10px; font-family:'Lato',sans-serif; font-size:14px; }
  input:focus, select:focus { outline:none; border-color:var(--gold70); }
  #staff-form { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px; align-items:center; }
  .hint { color:var(--gold); font-size:13px; }
  .muted { color:var(--muted); }
  .roster .r { border:1px solid var(--line); padding:10px 12px; margin-bottom:8px; }
  .roster .nm { font-weight:700; }
  .roster .avail { font-size:13px; color:var(--muted); margin:2px 0 8px; }
  .ctl { display:flex; gap:6px; flex-wrap:wrap; align-items:center; font-size:13px; }
  .ctl button { padding:6px 10px; font-size:12px; }
  select.role, input.hours, input#needed { padding:6px 8px; font-size:13px; }
  input.hours, input#needed { width:74px; }
  .pillA { border:1px solid var(--gold); color:var(--gold); font-size:11px; letter-spacing:1px; text-transform:uppercase; padding:3px 8px; }
</style>
</head>
<body>
<header>
  <h1>JVO <span>Events</span> — Booking Pipeline</h1>
  <div class="sub">Staff dashboard</div>
  <nav class="tabs">
    <button type="button" class="tab sel" id="tab-pipeline" onclick="showTab('pipeline')">Pipeline</button>
    <button type="button" class="tab" id="tab-staff" onclick="showTab('staff')">Staff</button>
    <button type="button" class="tab" id="tab-reports" onclick="showTab('reports')">Reports</button>
  </nav>
</header>
<main id="view-pipeline">
  <section id="board"><div class="empty">Loading events…</div></section>
  <aside id="detail"><div class="empty">Select an event to see its details.</div></aside>
</main>
<section id="view-staff" class="tabview" style="display:none">
  <h2 class="viewtitle">Staff Roster</h2>
  <form id="staff-form" onsubmit="addStaff(event)">
    <input type="text" id="st-name" placeholder="Name" required>
    <input type="email" id="st-email" placeholder="Email" required>
    <input type="tel" id="st-phone" placeholder="Phone (optional)">
    <input type="text" id="st-role" placeholder="Role" value="event_staff">
    <button type="submit">Add Staff Member</button>
  </form>
  <div id="staff-list"><div class="empty">Loading staff…</div></div>
</section>
<section id="view-reports" class="tabview" style="display:none">
  <h2 class="viewtitle">Hours Report</h2>
  <div class="ctl" style="margin-bottom:16px">
    <input type="month" id="report-month">
    <button type="button" class="ghost" onclick="loadReport()">Load</button>
  </div>
  <div id="report-out"><div class="empty">Pick a month and press Load.</div></div>
</section>
<div id="msg"></div>
<script>
const STATUS_ORDER = ["needs_review","awaiting_deposit","booked","awaiting_final_payment","paid_in_full","staff_scheduling","ready","complete","archived","cancelled_customer","cancelled_nonpayment"];
const LABELS = {
  awaiting_deposit:"Awaiting Deposit", booked:"Booked", awaiting_final_payment:"Awaiting Final Payment",
  paid_in_full:"Paid in Full", staff_scheduling:"Staff Scheduling", ready:"Ready", complete:"Complete", archived:"Archived",
  needs_review:"Needs Review", cancelled_customer:"Cancelled — Customer", cancelled_nonpayment:"Cancelled — Non-Payment"
};
const AVAIL_LABELS = {
  full:"Can work the full event", setup_only:"Setup only", breakdown_only:"Breakdown only",
  partial:"Partially available", unavailable:"Can't work this one"
};
let selectedId = null;
let reportLoaded = false;

function showTab(t){
  document.getElementById("view-pipeline").style.display = t==="pipeline" ? "" : "none";
  document.getElementById("view-staff").style.display = t==="staff" ? "" : "none";
  document.getElementById("view-reports").style.display = t==="reports" ? "" : "none";
  for(const n of ["pipeline","staff","reports"]) document.getElementById("tab-"+n).classList.toggle("sel", n===t);
  if(t==="staff") loadStaff();
  if(t==="reports" && !reportLoaded) loadReport();
}

function toast(t){ const m=document.getElementById("msg"); m.textContent=t; m.style.display="block"; clearTimeout(m._t); m._t=setTimeout(()=>m.style.display="none", 3500); }
async function api(path, opts){
  const r = await fetch(path, Object.assign({headers:{"Content-Type":"application/json"}}, opts));
  const j = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error || ("HTTP "+r.status));
  return j;
}
function esc(s){ const d=document.createElement("div"); d.textContent = s==null? "" : String(s); return d.innerHTML; }

async function loadBoard(){
  const board = document.getElementById("board");
  try {
    const j = await api("/api/admin/events");
    const groups = {};
    for(const ev of j.events){ (groups[ev.status] = groups[ev.status]||[]).push(ev); }
    let html = "";
    for(const st of STATUS_ORDER){
      const evs = groups[st];
      if(!evs || !evs.length) continue;
      html += '<div class="group"><h2>'+esc(LABELS[st]||st)+'<span class="count">'+evs.length+'</span></h2>';
      for(const ev of evs){
        html += '<div class="card'+(ev.id===selectedId?" sel":"")+'" onclick="openEvent('+ev.id+')">'
          + '<div><div class="who">'+esc(ev.name||"(no name)")+'</div>'
          + '<div class="meta">'+esc(ev.event_date||"no date")+(ev.event_type?" · "+esc(ev.event_type):"")+(ev.package?" · "+esc(ev.package):"")+'</div></div>'
          + '<div class="pid">'+esc(ev.public_id||"")+'</div></div>';
      }
      html += '</div>';
    }
    board.innerHTML = html || '<div class="empty">No events yet. New JotForm bookings will appear here automatically.</div>';
  } catch(e){ board.innerHTML = '<div class="empty">Could not load events: '+esc(e.message)+'</div>'; }
}

async function openEvent(id){
  selectedId = id;
  const box = document.getElementById("detail");
  try {
    const j = await api("/api/admin/events/"+id);
    const ev = j.event, allowed = j.allowedTransitions;
    const row = (k,v)=> v==null||v===""? "" : "<dt>"+esc(k)+"</dt><dd>"+esc(v)+"</dd>";
    const btn = (label, to)=> allowed.includes(to)
      ? '<button onclick="doTransition('+ev.id+',\\''+to+'\\')">'+esc(label)+'</button>' : "";
    let html = '<div class="pid">'+esc(ev.public_id||"")+'</div><h2>'+esc(ev.name||"(no name)")+'</h2>'
      + '<div class="status-pill">'+esc(LABELS[ev.status]||ev.status)+'</div>'
      + '<dl>'
      + row("Email", ev.email) + row("Phone", ev.phone) + row("Address", ev.address)
      + row("Event date", ev.event_date) + row("Time", (ev.start_time||ev.end_time)? (ev.start_time||"?")+" – "+(ev.end_time||"?") : "")
      + row("Type", ev.event_type) + row("Package", ev.package)
      + row("Guests", ev.guest_count) + row("Vehicles", ev.vehicle_count)
      + row("Vendors", ev.vendors) + row("Add-ons", ev.addons)
      + row("JotForm ID", ev.jotform_id) + row("Calendar event", ev.calendar_event_id)
      + row("Deposit paid", ev.deposit_paid_at) + row("Final paid", ev.final_paid_at)
      + row("Details verified", ev.details_verified_at)
      + row("Requested changes", ev.details_changes)
      + row("Created", ev.created_at) + row("Updated", ev.updated_at)
      + '</dl>'
      + '<div class="sec">Actions</div><div class="actions">'
      + btn("Mark Deposit Paid","booked")
      + btn("Mark Final Payment Paid","paid_in_full")
      + btn("Begin Staffing","staff_scheduling")
      + btn("Mark Ready","ready")
      + btn("Mark Complete","complete")
      + btn("Archive","archived")
      + '</div><div class="actions">'
      + (allowed.includes("needs_review")? '<button class="ghost" onclick="doTransition('+ev.id+',\\'needs_review\\')">Needs Review</button>':"")
      + (ev.status==="needs_review" && allowed[0] && !["cancelled_customer","cancelled_nonpayment"].includes(allowed[0])
          ? '<button onclick="doTransition('+ev.id+',\\''+allowed[0]+'\\')">Resolve → '+esc(LABELS[allowed[0]]||allowed[0])+'</button>' : "")
      + (allowed.includes("cancelled_customer")||allowed.includes("cancelled_nonpayment")
          ? '<button class="ghost" onclick="doCancel('+ev.id+')">Cancel…</button>' : "")
      + '</div>'
      + staffingHtml(ev, j.staffing, j.assignmentRoles)
      + '<div class="sec">Staff notes</div>'
      + '<textarea id="notes">'+esc(ev.notes||"")+'</textarea>'
      + '<div class="actions" style="margin-top:8px"><button class="ghost" onclick="saveNotes('+ev.id+')">Save Notes</button></div>'
      + '<div class="sec">Status history</div><div class="hist">'
      + j.history.map(h=>'<div>'+esc(h.at||"")+' — <b>'+esc(h.from_status||"new")+' → '+esc(h.to_status)+'</b> ('+esc(h.actor||"")+')'+(h.note?' — '+esc(h.note):'')+'</div>').join("")
      + '</div>';
    box.innerHTML = html;
    loadBoard();
  } catch(e){ box.innerHTML = '<div class="empty">Could not load event: '+esc(e.message)+'</div>'; }
}

async function doTransition(id, to){
  const note = prompt("Optional note for the history log:", "") || "";
  try { await api("/api/admin/events/"+id+"/transition", {method:"POST", body:JSON.stringify({to, note})}); toast("Moved to "+(LABELS[to]||to)); openEvent(id); }
  catch(e){ toast("Error: "+e.message); }
}
async function doCancel(id){
  const kind = prompt('Cancel as "customer" or "nonpayment"?', "customer");
  if(!kind) return;
  const to = kind.trim().toLowerCase().startsWith("non") ? "cancelled_nonpayment" : "cancelled_customer";
  doTransition(id, to);
}
async function saveNotes(id){
  try { await api("/api/admin/events/"+id, {method:"PATCH", body:JSON.stringify({notes: document.getElementById("notes").value})}); toast("Notes saved"); }
  catch(e){ toast("Error: "+e.message); }
}

// --- Staffing (event detail) ---
function staffingHtml(ev, st, roles){
  if(!st) return "";
  roles = roles && roles.length ? roles : ["captain","staff","setup","cleanup"];
  let html = '<div class="sec">Staffing</div>'
    + '<div class="ctl" style="margin-bottom:10px">Needed:'
    + ' <input id="needed" type="number" min="0" max="50" value="'+st.staff_needed+'">'
    + ' <button class="ghost" onclick="saveNeeded('+ev.id+')">Save</button>'
    + ' <span class="'+(st.fully_staffed?"hint":"muted")+'">'+st.confirmed+' of '+st.staff_needed+' confirmed</span></div>';
  if(st.fully_staffed && ev.status==="staff_scheduling"){
    html += '<div class="hint" style="margin-bottom:10px">Fully staffed — use Mark Ready above to move this event along.</div>';
  }
  html += '<div class="roster">';
  if(!st.roster.length){
    html += '<div class="muted">No staff on the roster yet — add your team on the Staff tab.</div>';
  }
  for(const r of st.roster){
    const avail = r.availability_response ? (AVAIL_LABELS[r.availability_response]||r.availability_response) : "no answer yet";
    html += '<div class="r"><span class="nm">'+esc(r.name)+'</span>'+(r.active?"":' <span class="muted">(inactive)</span>')
      + '<div class="avail">'+esc(avail)+(r.availability_note? " — "+esc(r.availability_note):"")+'</div>'
      + '<div class="ctl">';
    if(r.assigned_role != null){
      html += '<span class="pillA">'+esc(r.assigned_role)+'</span>'
        + ' Hours: <input class="hours" id="hours-'+r.id+'" type="number" step="0.25" min="0.25" max="24" value="'+(r.assigned_hours!=null?r.assigned_hours:"")+'">'
        + ' <button class="ghost" onclick="saveHours('+ev.id+','+r.id+')">Save</button>'
        + ' <button class="ghost" onclick="unassignStaff('+ev.id+','+r.id+')">Unassign</button>';
    } else {
      html += '<select class="role" id="role-'+r.id+'">'
        + roles.map(function(x){ return '<option value="'+esc(x)+'">'+esc(x)+'</option>'; }).join("")
        + '</select> <button class="ghost" onclick="assignStaff('+ev.id+','+r.id+')">Assign</button>';
    }
    html += '</div></div>';
  }
  html += '</div>';
  return html;
}
async function saveNeeded(id){
  const n = Number(document.getElementById("needed").value);
  try { await api("/api/admin/events/"+id, {method:"PATCH", body:JSON.stringify({staff_needed:n})}); toast("Staff needed saved"); openEvent(id); }
  catch(e){ toast("Error: "+e.message); }
}
async function assignStaff(id, staffId){
  const role = document.getElementById("role-"+staffId).value;
  try { await api("/api/admin/events/"+id+"/assignments", {method:"POST", body:JSON.stringify({staffId:staffId, role:role})}); toast("Assigned"); openEvent(id); }
  catch(e){ toast("Error: "+e.message); }
}
async function unassignStaff(id, staffId){
  try { await api("/api/admin/events/"+id+"/assignments/"+staffId, {method:"DELETE"}); toast("Unassigned"); openEvent(id); }
  catch(e){ toast("Error: "+e.message); }
}
async function saveHours(id, staffId){
  const h = Number(document.getElementById("hours-"+staffId).value);
  try { await api("/api/admin/events/"+id+"/assignments/"+staffId, {method:"PATCH", body:JSON.stringify({hours:h})}); toast("Hours saved"); }
  catch(e){ toast("Error: "+e.message); }
}

// --- Staff tab ---
async function loadStaff(){
  const box = document.getElementById("staff-list");
  try {
    const j = await api("/api/admin/staff");
    if(!j.staff.length){ box.innerHTML = '<div class="empty">No staff yet — add your first team member above. They each get a personal portal link for availability.</div>'; return; }
    let html = '<table class="grid"><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Actions</th></tr>';
    for(const s of j.staff){
      html += '<tr'+(s.active?"":' class="inactive"')+'>'
        + '<td>'+esc(s.name)+'</td><td>'+esc(s.email)+'</td><td>'+esc(s.phone||"")+'</td><td>'+esc(s.role)+'</td>'
        + '<td>'+(s.active?"Active":"Inactive")+'</td>'
        + '<td><div class="ctl">'
        + '<button class="ghost" onclick="copyPortal(this)" data-token="'+esc(s.portal_token||"")+'">Copy portal link</button>'
        + (s.active
            ? '<button class="ghost" onclick="setStaffActive('+s.id+',false)">Deactivate</button>'
            : '<button class="ghost" onclick="setStaffActive('+s.id+',true)">Reactivate</button>')
        + '</div></td></tr>';
    }
    box.innerHTML = html + '</table>';
  } catch(e){ box.innerHTML = '<div class="empty">Could not load staff: '+esc(e.message)+'</div>'; }
}
async function addStaff(e){
  e.preventDefault();
  const body = {
    name: document.getElementById("st-name").value.trim(),
    email: document.getElementById("st-email").value.trim(),
    phone: document.getElementById("st-phone").value.trim(),
    role: document.getElementById("st-role").value.trim() || "event_staff"
  };
  try {
    await api("/api/admin/staff", {method:"POST", body:JSON.stringify(body)});
    document.getElementById("staff-form").reset();
    document.getElementById("st-role").value = "event_staff";
    toast("Staff member added"); loadStaff();
  } catch(err){ toast("Error: "+err.message); }
}
async function setStaffActive(id, active){
  try {
    if(active) await api("/api/admin/staff/"+id, {method:"PATCH", body:JSON.stringify({active:true})});
    else await api("/api/admin/staff/"+id, {method:"DELETE"});
    toast(active?"Reactivated":"Deactivated"); loadStaff();
  } catch(e){ toast("Error: "+e.message); }
}
function copyPortal(btn){
  const url = location.origin + "/staff/" + btn.getAttribute("data-token");
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(function(){ toast("Portal link copied"); }, function(){ prompt("Portal link:", url); });
  } else { prompt("Portal link:", url); }
}

// --- Reports tab ---
async function loadReport(){
  const box = document.getElementById("report-out");
  const input = document.getElementById("report-month");
  if(!input.value){
    const now = new Date();
    input.value = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0");
  }
  reportLoaded = true;
  try {
    const j = await api("/api/admin/reports/hours?month="+encodeURIComponent(input.value));
    if(!j.rows.length){ box.innerHTML = '<div class="empty">No assigned hours in '+esc(j.month)+' yet.</div>'; return; }
    let events = 0, hours = 0;
    let html = '<table class="grid"><tr><th>Staff</th><th>Role</th><th>Events worked</th><th>Total hours</th></tr>';
    for(const r of j.rows){
      events += r.events_worked; hours += (r.total_hours||0);
      html += '<tr><td>'+esc(r.name)+'</td><td>'+esc(r.staff_role)+'</td><td>'+r.events_worked+'</td><td>'+(r.total_hours!=null?r.total_hours:0)+'</td></tr>';
    }
    html += '<tr><td><strong>Total</strong></td><td></td><td><strong>'+events+'</strong></td><td><strong>'+(Math.round(hours*100)/100)+'</strong></td></tr>';
    box.innerHTML = html + '</table>';
  } catch(e){ box.innerHTML = '<div class="empty">Could not load report: '+esc(e.message)+'</div>'; }
}

loadBoard();
setInterval(loadBoard, 60000);
</script>
</body>
</html>`;
