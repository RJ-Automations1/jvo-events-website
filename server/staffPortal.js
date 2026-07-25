/**
 * Staff availability portal (staff-facing).
 * -----------------------------------------
 * Every staff member has a personal crypto-random link (staff.portal_token),
 * emailed by the pipeline sweep when an upcoming event needs hands:
 *   GET  /staff/:token  — branded page listing upcoming events (≤30 days out)
 *                         with their current answer per event
 *   POST /staff/:token  — {eventId, response, note} upserts their availability
 *                         (full / setup_only / breakdown_only / partial /
 *                         unavailable)
 *
 * No login — the token IS the identity, exactly like /verify/:token for
 * guests. Unknown or deactivated tokens get a friendly branded error page,
 * and the same light in-memory rate limit (20 req/min/IP) discourages token
 * guessing without hurting real staff.
 */

import express from "express";
import { getDb } from "./db.js";
import { STAFFING_STATUSES } from "./pipeline.js";
import {
  AVAILABILITY_RESPONSES,
  RESPONSE_LABELS,
  upsertAvailability,
} from "./staffing.js";

export const staffPortalRouter = express.Router();
staffPortalRouter.use(express.urlencoded({ extended: true }));

// Statuses staff can see: confirmed events still being staffed, plus ready
// ones (so an assigned member still sees their upcoming shift).
const VISIBLE_STATUSES = [...STAFFING_STATUSES, "ready"];

// --- light in-memory rate limit: 20 requests per minute per IP -------------
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 1000;
const hits = new Map(); // ip → { count, windowStart }

function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.windowStart > RATE_WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  rec.count++;
  return rec.count > RATE_LIMIT;
}

// Keep the map from growing forever.
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of hits) {
    if (now - rec.windowStart > RATE_WINDOW_MS) hits.delete(ip);
  }
}, 5 * 60 * 1000).unref();

staffPortalRouter.use("/staff", (req, res, next) => {
  if (rateLimited(req.ip || req.socket?.remoteAddress || "?")) {
    return res.status(429).type("html").send(page("Slow down", `
      <h1>Slow down</h1>
      <p>Too many requests — please wait a minute and try again.</p>`));
  }
  next();
});

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

/** "Saturday, August 16, 2025" from YYYY-MM-DD (timezone-safe). */
function prettyDate(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(ymd || "").trim();
  const [, y, mo, d] = m.map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return `${WEEKDAYS[dt.getUTCDay()]}, ${MONTHS[mo - 1]} ${d}, ${y}`;
}

/** "2:30 PM" from "HH:MM". */
function prettyTime(hhmm) {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(hhmm || "").trim();
  let h = Number(m[1]);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ampm}`;
}

/** Branded page shell — dark + gold, Playfair/Lato, self-contained. */
function page(title, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)} — JVO Events</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Lato:wght@400;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:#080808; color:#f5f2ec; font-family:'Lato',Arial,sans-serif; min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:40px 18px; }
  .wrap { width:100%; max-width:640px; }
  .brand { text-align:center; margin-bottom:28px; }
  .brand .jvo { font-family:'Playfair Display',Georgia,serif; font-weight:700; font-size:34px; letter-spacing:1px; }
  .brand .jvo span { color:#C9A96A; }
  .brand .kicker { color:#C9A96A; font-size:11px; letter-spacing:3px; text-transform:uppercase; margin-top:6px; }
  .card { background:#111; border:1px solid #242424; border-top:2px solid #C9A96A; padding:26px 26px 22px; margin-bottom:18px; }
  h1 { font-family:'Playfair Display',Georgia,serif; font-size:24px; margin-bottom:14px; }
  h2 { font-family:'Playfair Display',Georgia,serif; font-size:19px; margin-bottom:4px; }
  p { font-size:15px; line-height:1.65; color:#cfc9bf; margin-bottom:14px; }
  .meta { color:#9a948a; font-size:13px; margin-bottom:14px; }
  .date-callout { font-family:'Playfair Display',Georgia,serif; font-size:18px; color:#f5f2ec; border-left:3px solid #C9A96A; background:#0c0c0c; padding:10px 14px; margin-bottom:14px; }
  .pill { display:inline-block; border:1px solid rgba(201,169,106,.7); color:#C9A96A; padding:3px 10px; font-size:11px; letter-spacing:2px; text-transform:uppercase; margin-bottom:12px; }
  .pill.assigned { background:#C9A96A; color:#080808; font-weight:700; }
  .saved { border:1px solid rgba(201,169,106,.5); background:#0c0c0c; color:#C9A96A; padding:10px 14px; font-size:14px; margin-bottom:18px; }
  label.opt { display:flex; align-items:flex-start; gap:10px; font-size:15px; color:#f5f2ec; padding:9px 10px; border:1px solid #2c2c2c; margin-bottom:6px; cursor:pointer; }
  label.opt:hover { border-color:rgba(201,169,106,.7); }
  input[type=radio] { accent-color:#C9A96A; margin-top:3px; }
  textarea { width:100%; background:#0c0c0c; border:1px solid #2c2c2c; color:#f5f2ec; padding:10px 12px; font-family:'Lato',sans-serif; font-size:14px; min-height:60px; resize:vertical; margin-top:8px; }
  textarea:focus { outline:none; border-color:rgba(201,169,106,.7); }
  .note-label { display:block; font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#C9A96A; margin-top:12px; }
  button { font-family:'Lato',sans-serif; font-size:14px; font-weight:700; padding:12px 20px; cursor:pointer; background:#fff; color:#080808; border:1px solid #fff; margin-top:14px; }
  button:hover { background:#C9A96A; border-color:#C9A96A; }
  .foot { text-align:center; color:#7c766c; font-size:12px; margin-top:26px; }
  .foot a { color:#C9A96A; text-decoration:none; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand">
      <div class="jvo">JVO <span>Events</span></div>
      <div class="kicker">Staff Portal</div>
    </div>
    ${bodyHtml}
    <div class="foot">Questions? Email <a href="mailto:eventsjvo@gmail.com">eventsjvo@gmail.com</a> or call (678) 519-4723.</div>
  </div>
</body>
</html>`;
}

const NOT_FOUND_HTML = `<div class="card">
  <h1>We couldn't find that link</h1>
  <p>This staff link isn't valid — it may have been mistyped, replaced, or deactivated.</p>
  <p>If you work with JVO Events, just reach out at eventsjvo@gmail.com or (678) 519-4723 and we'll send you a fresh link.</p>
</div>`;

const UNAVAILABLE_HTML = `<div class="card">
  <h1>One moment, please</h1>
  <p>The staff portal is temporarily unavailable. Please try again shortly, or reach us at eventsjvo@gmail.com / (678) 519-4723.</p>
</div>`;

function lookup(token) {
  const db = getDb();
  if (!db) return { db: null, staff: null };
  const t = String(token || "").trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(t)) return { db, staff: null };
  return {
    db,
    staff: db.prepare("SELECT * FROM staff WHERE portal_token = ? AND active = 1").get(t),
  };
}

/** Upcoming (≤30 days out) events a staff member can respond to, with their
 *  current availability answer and any assignment attached. */
function upcomingEventsFor(db, staffId) {
  const today = todayYmd();
  const placeholders = VISIBLE_STATUSES.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT e.*, av.response AS my_response, av.note AS my_note,
              a.role AS my_assignment_role, a.hours AS my_assignment_hours
       FROM events e
       LEFT JOIN availability av ON av.event_id = e.id AND av.staff_id = ?
       LEFT JOIN assignments a  ON a.event_id  = e.id AND a.staff_id  = ?
       WHERE e.event_date > ? AND e.status IN (${placeholders})
       ORDER BY e.event_date ASC, e.id ASC`
    )
    .all(staffId, staffId, today, ...VISIBLE_STATUSES)
    .filter((ev) => daysUntil(ev.event_date, today) <= 30);
}

function eventCardHtml(token, ev, savedId) {
  const timeStr =
    ev.start_time && ev.end_time
      ? `${prettyTime(ev.start_time)} – ${prettyTime(ev.end_time)}`
      : "";
  const meta = [
    ev.event_type || null,
    timeStr || null,
    ev.guest_count != null ? `${ev.guest_count} guests` : null,
    ev.package || null,
  ]
    .filter(Boolean)
    .join(" · ");

  const options = AVAILABILITY_RESPONSES.map((r) => {
    const checked = ev.my_response === r ? " checked" : "";
    return `<label class="opt"><input type="radio" name="response" value="${r}"${checked} required> ${esc(RESPONSE_LABELS[r])}</label>`;
  }).join("");

  return `<div class="card">
    ${ev.my_assignment_role
      ? `<div class="pill assigned">You're assigned — ${esc(ev.my_assignment_role)}${ev.my_assignment_hours != null ? ` · ${esc(ev.my_assignment_hours)}h` : ""}</div>`
      : ev.my_response
        ? `<div class="pill">Your answer: ${esc(RESPONSE_LABELS[ev.my_response] || ev.my_response)}</div>`
        : `<div class="pill">Needs your answer</div>`}
    ${savedId === ev.id ? `<div class="saved">Saved — thank you!</div>` : ""}
    <h2>${esc(ev.event_type || "Event")} — ${esc(ev.public_id || "")}</h2>
    <div class="date-callout">${esc(prettyDate(ev.event_date))}</div>
    ${meta ? `<div class="meta">${esc(meta)}</div>` : ""}
    <form method="POST" action="/staff/${esc(token)}">
      <input type="hidden" name="eventId" value="${ev.id}">
      ${options}
      <span class="note-label">Note (optional — e.g. hours you're free for "partial")</span>
      <textarea name="note" placeholder="Anything we should know?">${esc(ev.my_note || "")}</textarea>
      <div><button type="submit">Save my answer</button></div>
    </form>
  </div>`;
}

staffPortalRouter.get("/staff/:token", (req, res) => {
  const { db, staff } = lookup(req.params.token);
  if (!db) return res.status(503).type("html").send(page("Temporarily unavailable", UNAVAILABLE_HTML));
  if (!staff) return res.status(404).type("html").send(page("Link not found", NOT_FOUND_HTML));

  const events = upcomingEventsFor(db, staff.id);
  const savedId = Number(req.query.saved) || 0;
  const firstName = ((staff.name || "there").trim() || "there").split(/\s+/)[0];

  const intro = `<div class="card">
    <h1>Hi ${esc(firstName)}!</h1>
    <p>These are the upcoming JVO events over the next 30 days. For each one, let us know if you can work it — one tap per event, and you can change your answer any time from this same link.</p>
  </div>`;

  const list = events.length
    ? events.map((ev) => eventCardHtml(staff.portal_token, ev, savedId)).join("")
    : `<div class="card"><h2>No upcoming events right now</h2>
       <p>There's nothing on the calendar in the next 30 days that needs staffing. We'll email you from this page the moment something comes up.</p></div>`;

  res.type("html").send(page("Your upcoming events", intro + list));
});

staffPortalRouter.post("/staff/:token", (req, res) => {
  const { db, staff } = lookup(req.params.token);
  const wantsJson = req.is("application/json");
  if (!db) {
    return wantsJson
      ? res.status(503).json({ error: "temporarily unavailable" })
      : res.status(503).type("html").send(page("Temporarily unavailable", UNAVAILABLE_HTML));
  }
  if (!staff) {
    return wantsJson
      ? res.status(404).json({ error: "unknown staff link" })
      : res.status(404).type("html").send(page("Link not found", NOT_FOUND_HTML));
  }

  const body = req.body || {};
  const eventId = Number(body.eventId);
  const response = String(body.response || "");
  const note = String(body.note || "").trim().slice(0, 2000);

  const fail = (msg) =>
    wantsJson
      ? res.status(400).json({ error: msg })
      : res.status(400).type("html").send(page("Something went wrong", `<div class="card">
          <h1>Something went wrong</h1>
          <p>${esc(msg)}</p>
          <p><a style="color:#C9A96A" href="/staff/${esc(staff.portal_token)}">Back to your events</a></p></div>`));

  if (!Number.isInteger(eventId) || eventId <= 0) return fail("That event link looks off — please try again from your events page.");
  if (!AVAILABILITY_RESPONSES.includes(response)) return fail("Please pick one of the availability options.");

  // The event must be one the portal actually shows this staff member.
  const visible = upcomingEventsFor(db, staff.id).some((ev) => ev.id === eventId);
  if (!visible) return fail("That event is no longer open for availability responses.");

  const saved = upsertAvailability(db, eventId, staff.id, response, note);

  if (wantsJson) return res.json({ ok: true, availability: saved });
  return res.redirect(303, `/staff/${staff.portal_token}?saved=${eventId}`);
});
