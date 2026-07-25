/**
 * Details-verification page (customer-facing).
 * --------------------------------------------
 * At ~15 days out the scheduler emails each guest a tokenized link:
 *   GET  /verify/:token  — branded form prefilled with their event details
 *   POST /verify/:token  — "Everything is correct" stamps details_verified_at;
 *                          "Submit changes" records the diff, moves the event
 *                          to needs_review, and emails staff.
 *
 * Tokens are crypto-random per event (events.verify_token). Unknown tokens get
 * a friendly branded error page. A light in-memory rate limit (20 req/min/IP)
 * discourages token guessing without hurting real guests.
 */

import express from "express";
import { getDb, nowIso } from "./db.js";
import { transition } from "./pipeline.js";
import { sendDetailsChangedNotification } from "./email.js";

export const verifyRouter = express.Router();
verifyRouter.use(express.urlencoded({ extended: true }));

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

verifyRouter.use("/verify", (req, res, next) => {
  if (rateLimited(req.ip || req.socket?.remoteAddress || "?")) {
    return res.status(429).type("html").send(page("Slow down", `
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
  .card { background:#111; border:1px solid #242424; border-top:2px solid #C9A96A; padding:30px 30px 26px; }
  h1 { font-family:'Playfair Display',Georgia,serif; font-size:24px; margin-bottom:14px; }
  p { font-size:15px; line-height:1.65; color:#cfc9bf; margin-bottom:16px; }
  label { display:block; font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#C9A96A; margin:16px 0 6px; }
  input, textarea { width:100%; background:#0c0c0c; border:1px solid #2c2c2c; color:#f5f2ec; padding:11px 12px; font-family:'Lato',sans-serif; font-size:15px; }
  input:focus, textarea:focus { outline:none; border-color:rgba(201,169,106,.7); }
  textarea { min-height:90px; resize:vertical; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:0 16px; }
  @media (max-width:520px){ .grid { grid-template-columns:1fr; } }
  .buttons { display:flex; gap:12px; margin-top:26px; flex-wrap:wrap; }
  button { font-family:'Lato',sans-serif; font-size:14px; font-weight:700; padding:13px 22px; cursor:pointer; }
  .primary { background:#fff; color:#080808; border:1px solid #fff; }
  .primary:hover { background:#C9A96A; border-color:#C9A96A; }
  .ghost { background:transparent; color:#f5f2ec; border:1px solid #3a3a3a; }
  .ghost:hover { border-color:#C9A96A; color:#C9A96A; }
  .foot { text-align:center; color:#7c766c; font-size:12px; margin-top:26px; }
  .foot a { color:#C9A96A; text-decoration:none; }
  .date-callout { font-family:'Playfair Display',Georgia,serif; font-size:20px; color:#f5f2ec; border-left:3px solid #C9A96A; background:#0c0c0c; padding:12px 16px; margin-bottom:8px; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand">
      <div class="jvo">JVO <span>Events</span></div>
      <div class="kicker">Jonesboro, Georgia</div>
    </div>
    <div class="card">
      ${bodyHtml}
    </div>
    <div class="foot">Questions? Email <a href="mailto:eventsjvo@gmail.com">eventsjvo@gmail.com</a> or call (678) 519-4723.</div>
  </div>
</body>
</html>`;
}

const NOT_FOUND_HTML = `
  <h1>We couldn't find that link</h1>
  <p>This verification link isn't valid — it may have been mistyped or replaced by a newer one.</p>
  <p>No worries: just reply to your confirmation email, or reach us at eventsjvo@gmail.com / (678) 519-4723, and we'll confirm your event details together.</p>`;

/** The editable fields on the form, mapped to their DB columns. */
const FIELDS = [
  { key: "event_date", label: "Event date", type: "date" },
  { key: "start_time", label: "Start time", type: "time" },
  { key: "end_time", label: "End time", type: "time" },
  { key: "guest_count", label: "Guest count", type: "number" },
  { key: "vehicle_count", label: "Expected vehicles (45 max)", type: "number" },
  { key: "vendors", label: "Vendors (caterer, DJ, etc.)", type: "text" },
  { key: "addons", label: "Add-ons", type: "text" },
];

function lookup(token) {
  const db = getDb();
  if (!db) return { db: null, event: null };
  const t = String(token || "").trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(t)) return { db, event: null };
  return { db, event: db.prepare("SELECT * FROM events WHERE verify_token = ?").get(t) };
}

verifyRouter.get("/verify/:token", (req, res) => {
  const { db, event: ev } = lookup(req.params.token);
  if (!db) return res.status(503).type("html").send(page("Temporarily unavailable", `
    <h1>One moment, please</h1>
    <p>This page is temporarily unavailable. Please try again shortly, or reply to your confirmation email and we'll take care of it.</p>`));
  if (!ev) return res.status(404).type("html").send(page("Link not found", NOT_FOUND_HTML));

  const already = ev.details_verified_at
    ? `<p style="border:1px solid rgba(201,169,106,.4);padding:10px 14px;">You confirmed these details on ${esc(ev.details_verified_at.slice(0, 10))}. You can review or update them below any time.</p>`
    : "";

  const inputs = FIELDS.map((f) => {
    const val = ev[f.key] == null ? "" : String(ev[f.key]);
    return `<div><label for="${f.key}">${esc(f.label)}</label>
      <input id="${f.key}" name="${f.key}" type="${f.type}" value="${esc(val)}"${f.type === "number" ? ' min="0"' : ""}></div>`;
  });

  res.type("html").send(page("Confirm your event details", `
    <h1>Confirm your event details</h1>
    <p>Hi ${esc((ev.name || "there").split(/\s+/)[0])} — your event is almost here! Please look over the details below. If everything is right, one click confirms it. If anything has changed, update it and submit — our team will follow up.</p>
    <div class="date-callout">${esc(ev.public_id || "Your event")} · ${esc(ev.event_date || "date TBC")}</div>
    ${already}
    <form method="POST" action="/verify/${esc(ev.verify_token)}">
      <div class="grid">${inputs.join("")}</div>
      <label for="special_requests">Special requests or notes</label>
      <textarea id="special_requests" name="special_requests" placeholder="Anything we should know?"></textarea>
      <div class="buttons">
        <button class="primary" type="submit" name="action" value="confirm">Everything is correct</button>
        <button class="ghost" type="submit" name="action" value="changes">Submit changes</button>
      </div>
    </form>`));
});

verifyRouter.post("/verify/:token", async (req, res) => {
  const { db, event: ev } = lookup(req.params.token);
  if (!db) return res.status(503).type("html").send(page("Temporarily unavailable", `
    <h1>One moment, please</h1>
    <p>We couldn't save that just now. Please try again shortly, or reply to your confirmation email and we'll take care of it.</p>`));
  if (!ev) return res.status(404).type("html").send(page("Link not found", NOT_FOUND_HTML));

  const body = req.body || {};
  const action = String(body.action || "confirm");
  const specialRequests = String(body.special_requests || "").trim().slice(0, 3000);

  // Diff the submitted fields against what's on file.
  const changes = {};
  if (action === "changes") {
    for (const f of FIELDS) {
      if (body[f.key] == null) continue;
      const submitted = String(body[f.key]).trim().slice(0, 500);
      const current = ev[f.key] == null ? "" : String(ev[f.key]);
      if (submitted !== current) changes[f.key] = { from: current, to: submitted };
    }
    if (specialRequests) {
      changes.special_requests = { from: "", to: specialRequests };
    }
  }

  const at = nowIso();

  if (Object.keys(changes).length === 0) {
    // Nothing changed (or the guest clicked confirm) → stamp verified.
    db.prepare("UPDATE events SET details_verified_at = ?, updated_at = ? WHERE id = ?").run(at, at, ev.id);
    return res.type("html").send(page("Details confirmed", `
      <h1>You're all set!</h1>
      <p>Thank you — your event details are confirmed. Our team will have everything ready for you on <strong style="color:#f5f2ec">${esc(ev.event_date || "your event date")}</strong>.</p>
      <p>If anything changes before then, just reply to your confirmation email or call (678) 519-4723.</p>`));
  }

  // Changes submitted → record them, flag for staff review, notify staff.
  const changeLines = Object.entries(changes)
    .map(([k, c]) => `${k}: "${c.from}" → "${c.to}"`)
    .join("\n");
  const noteBlock = `[${at}] Guest submitted changes on the verification page:\n${changeLines}`;
  db.prepare(
    "UPDATE events SET details_changes = ?, notes = ?, updated_at = ? WHERE id = ?"
  ).run(
    JSON.stringify(changes),
    ev.notes ? `${ev.notes}\n\n${noteBlock}` : noteBlock,
    at,
    ev.id
  );
  if (ev.status !== "needs_review") {
    const moved = transition(db, ev.id, "needs_review", "customer", "guest changed details via /verify");
    if (!moved.ok) console.warn(`[verify] could not flag event ${ev.id} for review: ${moved.error}`);
  }

  const fresh = db.prepare("SELECT * FROM events WHERE id = ?").get(ev.id);
  try {
    await sendDetailsChangedNotification(fresh, changes);
  } catch (err) {
    console.error("[verify] staff notification failed:", err.message);
  }

  return res.type("html").send(page("Changes received", `
    <h1>Got it — we're on it</h1>
    <p>Thank you for letting us know. Our team has received your requested changes and will be in touch shortly to confirm everything for your event.</p>
    <p>Need us sooner? Email eventsjvo@gmail.com or call (678) 519-4723.</p>`));
});
