/**
 * Staff admin dashboard for the event-booking pipeline.
 * -----------------------------------------------------
 * Express-served (NOT part of the Vite SPA):
 *   GET  /admin                         — self-contained dashboard page
 *   GET  /api/admin/events?status=      — list events (optionally one status)
 *   GET  /api/admin/events/:id          — one event + its status history
 *   POST /api/admin/events/:id/transition  {to, note}
 *   PATCH /api/admin/events/:id         {notes}
 *
 * All routes sit behind HTTP Basic Auth (ADMIN_USER / ADMIN_PASSWORD env vars).
 * If those aren't set the routes answer 503 "not configured" — nothing is ever
 * exposed unauthenticated by accident. All admin actions record actor "staff".
 */

import crypto from "node:crypto";
import express from "express";
import { getDb, nowIso } from "./db.js";
import { STATUSES, ALLOWED_TRANSITIONS, reviewReturnStatus, transition } from "./pipeline.js";

const ADMIN_USER = process.env.ADMIN_USER || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

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

/** One event with its full status history and the transitions allowed from here. */
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
  res.json({ ok: true, event: ev, history, allowedTransitions: allowed });
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

/** Update the staff notes on an event. */
adminRouter.patch("/api/admin/events/:id", (req, res) => {
  const db = requireDb(res);
  if (!db) return;
  const ev = db.prepare("SELECT id FROM events WHERE id = ?").get(Number(req.params.id));
  if (!ev) return res.status(404).json({ error: "event not found" });
  if (typeof req.body?.notes !== "string") {
    return res.status(400).json({ error: "notes (string) is required" });
  }
  db.prepare("UPDATE events SET notes = ?, updated_at = ? WHERE id = ?").run(
    String(req.body.notes).slice(0, 10000),
    nowIso(),
    ev.id
  );
  res.json({ ok: true, event: db.prepare("SELECT * FROM events WHERE id = ?").get(ev.id) });
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
</style>
</head>
<body>
<header>
  <h1>JVO <span>Events</span> — Booking Pipeline</h1>
  <div class="sub">Staff dashboard</div>
</header>
<main>
  <section id="board"><div class="empty">Loading events…</div></section>
  <aside id="detail"><div class="empty">Select an event to see its details.</div></aside>
</main>
<div id="msg"></div>
<script>
const STATUS_ORDER = ["needs_review","awaiting_deposit","booked","awaiting_final_payment","paid_in_full","ready","complete","archived","cancelled_customer","cancelled_nonpayment"];
const LABELS = {
  awaiting_deposit:"Awaiting Deposit", booked:"Booked", awaiting_final_payment:"Awaiting Final Payment",
  paid_in_full:"Paid in Full", ready:"Ready", complete:"Complete", archived:"Archived",
  needs_review:"Needs Review", cancelled_customer:"Cancelled — Customer", cancelled_nonpayment:"Cancelled — Non-Payment"
};
let selectedId = null;

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

loadBoard();
setInterval(loadBoard, 60000);
</script>
</body>
</html>`;
