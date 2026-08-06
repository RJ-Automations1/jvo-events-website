import "dotenv/config";
import express from "express";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JVO_SYSTEM_PROMPT } from "./server/jvoKnowledge.js";
import cron from "node-cron";
import { createDeskworksReservation } from "./server/deskworks.js";
import { getBookedDates, createCalendarEvent, createTourEvent } from "./server/googleCalendar.js";
import { getDeskworksBookedDates } from "./server/deskworksAvailability.js";
import { sendBookingConfirmation, sendBookingNotification, sendTourConfirmation, sendTourNotification, sendInquiryNotification } from "./server/email.js";
import { runPaymentReminderSweep } from "./server/paymentReminders.js";
import { getDb } from "./server/db.js";
import { createEventRecord } from "./server/pipeline.js";
import { adminRouter } from "./server/admin.js";
import { verifyRouter } from "./server/verify.js";
import { staffPortalRouter } from "./server/staffPortal.js";
import { runPipelineSweep } from "./server/pipelineScheduler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8787;

// Parser for JotForm's multipart/form-data webhook (text fields only).
const upload = multer();

// Which space the booking is for. This site books the Outdoor Event Center; if
// the form starts collecting a space/venue choice, it carries through instead.
const DEFAULT_SPACE = process.env.DEFAULT_SPACE || "Outdoor Event Center";

app.use(express.json());

/**
 * Canonical host: redirect www.jvoevents.com → jvoevents.com (one clean URL,
 * better for SEO). Only affects the www host; the apex and onrender URLs pass
 * through untouched.
 */
app.use((req, res, next) => {
  const host = req.headers.host || "";
  if (host.toLowerCase().startsWith("www.")) {
    return res.redirect(301, `https://${host.slice(4)}${req.originalUrl}`);
  }
  next();
});

/**
 * Standalone Weddings site: when this deploy is the dedicated Weddings service
 * (SITE_MODE=weddings on Render), land the root on the Weddings page so the
 * bare domain opens straight to it. Everything else still serves the full app.
 */
// (The weddings build now renders the weddings page AT the root — see
// VITE_SITE_MODE in src/lib/siteMode.ts — so no server-side redirect is needed.)

/** Basic health check (useful for Render). */
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// --- Customer chatbot: answers questions from the JVO capability overview ---
const CHAT_MODEL = process.env.CHAT_MODEL || "claude-opus-5";
// Events vs. the standalone Weddings deploy — same venue facts, different framing.
const CHAT_SYSTEM_PROMPT = systemPromptFor(process.env.SITE_MODE);
const CHAT_FALLBACK =
  "Sorry — I'm having trouble right now. Please email eventsjvo@gmail.com or call 678-519-4723 and the JVO team will help you directly.";
let anthropicClient = null;
function getAnthropic() {
  if (!anthropicClient) anthropicClient = new Anthropic(); // reads ANTHROPIC_API_KEY
  return anthropicClient;
}

app.post("/api/chat", async (req, res) => {
  // Sanitize the transcript: keep only well-formed user/assistant turns, cap
  // per-message length and the number of turns we forward to the model.
  const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages = raw
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim() !== ""
    )
    .slice(-12)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return res.status(400).json({ error: "A user message is required." });
  }

  // Graceful degrade when the API key isn't configured yet.
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({
      reply:
        "Our live assistant isn't set up just yet. Email eventsjvo@gmail.com or call 678-519-4723 and the JVO team will be happy to help!",
    });
  }

  try {
    const client = getAnthropic();
    const msg = await client.messages.create({
      model: CHAT_MODEL,
      // Headroom for adaptive thinking plus the answer. Claude Opus 5 thinks by
      // default, and max_tokens caps thinking and reply together — the old 1024
      // would now truncate replies mid-sentence.
      max_tokens: 2048,
      // A FAQ bot wants answers fast; low effort keeps latency and cost down.
      output_config: { effort: "low" },
      system: [
        {
          type: "text",
          text: CHAT_SYSTEM_PROMPT,
          // Same prompt every request — cached reads cost ~a tenth of full price.
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
    });
    const reply = (msg.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return res.json({ reply: reply || "Sorry, I didn't catch that — could you rephrase?" });
  } catch (err) {
    console.error("[/api/chat] failed:", err?.message || err);
    return res.status(502).json({ error: "chat_unavailable", reply: CHAT_FALLBACK });
  }
});

// Small in-memory cache so repeated page loads are instant and we don't hit the
// calendar/Deskworks APIs on every request. Keyed by from|to, 5-minute TTL.
const availabilityCache = new Map();
const AVAIL_TTL_MS = 5 * 60 * 1000;

/**
 * Availability — returns booked dates (YYYY-MM-DD) from Google Calendar +
 * Deskworks so the date picker can grey them out. Defaults to a ~13-month window.
 */
app.get("/api/availability", async (req, res) => {
  try {
    const today = new Date();
    const from = req.query.from || today.toISOString().slice(0, 10);
    const to =
      req.query.to ||
      new Date(today.getFullYear() + 1, today.getMonth() + 1, 1)
        .toISOString()
        .slice(0, 10);

    const cacheKey = `${from}|${to}`;
    const cached = availabilityCache.get(cacheKey);
    if (cached && Date.now() - cached.at < AVAIL_TTL_MS) {
      return res.json(cached.payload);
    }
    // Combine both sources — a date is blocked if taken in Google Calendar OR Deskworks.
    const [gcal, dw] = await Promise.allSettled([
      getBookedDates(from, to),
      getDeskworksBookedDates(from, to),
    ]);
    const set = new Set();
    if (gcal.status === "fulfilled") gcal.value.bookedDates.forEach((d) => set.add(d));
    else console.error("[availability] google calendar failed:", gcal.reason?.message);
    if (dw.status === "fulfilled") dw.value.bookedDates.forEach((d) => set.add(d));
    else console.error("[availability] deskworks failed:", dw.reason?.message);
    const configured =
      (gcal.status === "fulfilled" && gcal.value.configured) ||
      (dw.status === "fulfilled" && dw.value.configured);
    const payload = {
      ok: true,
      configured,
      bookedDates: [...set].sort(),
      sources: {
        googleCalendar: gcal.status === "fulfilled" && gcal.value.configured,
        deskworks: dw.status === "fulfilled" && dw.value.configured,
      },
    };
    availabilityCache.set(cacheKey, { at: Date.now(), payload });
    return res.json(payload);
  } catch (err) {
    console.error("[/api/availability] failed:", err);
    // Fail open: an availability outage shouldn't block bookings entirely.
    return res.json({ ok: true, configured: false, bookedDates: [], error: "unavailable" });
  }
});

/** Booking endpoint — validates input then hands off to the Deskworks adapter. */
app.post("/api/book", async (req, res) => {
  const b = req.body || {};

  // Mirror the client-side required fields, plus a light email sanity check.
  const required = ["name", "email", "eventDate", "package"];
  const missing = required.filter((k) => !b[k] || String(b[k]).trim() === "");
  if (missing.length) {
    return res
      .status(400)
      .json({ error: `Missing required field(s): ${missing.join(", ")}` });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email))) {
    return res.status(400).json({ error: "Please provide a valid email address." });
  }

  // Reject dates already taken on the calendar (only when calendar is configured).
  const eventDate = String(b.eventDate).trim();
  try {
    const nextDay = new Date(new Date(eventDate).getTime() + 86400000)
      .toISOString()
      .slice(0, 10);
    const { configured, bookedDates } = await getBookedDates(eventDate, nextDay);
    if (configured && bookedDates.includes(eventDate)) {
      return res.status(409).json({
        error: "That date is already booked. Please choose another available date.",
      });
    }
  } catch {
    // Fail open — don't block a booking just because the availability check errored.
  }

  try {
    const result = await processBooking({
      name: String(b.name).trim(),
      email: String(b.email).trim(),
      phone: b.phone ? String(b.phone).trim() : "",
      eventDate: String(b.eventDate).trim(),
      eventType: b.eventType ? String(b.eventType).trim() : "",
      package: String(b.package).trim(),
      space: b.space ? String(b.space).trim() : "",
      guestCount: b.guestCount ? String(b.guestCount).trim() : "",
      message: b.message ? String(b.message).trim() : "",
    });

    if (!result.deskworks && !result.calendar) {
      throw new Error(result.errors.join("; ") || "booking failed");
    }
    return res
      .status(200)
      .json({ ok: true, reference: result.deskworks?.reference ?? null });
  } catch (err) {
    console.error("[/api/book] failed:", err);
    return res.status(502).json({
      error:
        "We couldn't complete your booking right now. Please try again shortly or email eventsjvo@gmail.com.",
    });
  }
});

// --- Book a Tour: schedule a timed visit that lands on the JVO calendar ---
// Tours run Mon–Fri, 9:00 AM–5:00 PM in 30-minute slots (last start 4:30 PM).
// Kept in sync with the front-end slot list in src/pages/Tour.tsx.
const TOUR_ALLOWED_WEEKDAYS = new Set([1, 2, 3, 4, 5]); // 1=Mon … 5=Fri
const TOUR_SLOTS = (() => {
  const slots = [];
  for (let mins = 9 * 60; mins <= 16 * 60 + 30; mins += 30) {
    const p = (n) => String(n).padStart(2, "0");
    slots.push(`${p(Math.floor(mins / 60))}:${p(mins % 60)}`);
  }
  return new Set(slots); // "09:00" … "16:30"
})();

/** Weekday (0=Sun … 6=Sat) of a YYYY-MM-DD date, timezone-safe. */
function weekdayOf(ymd) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Tour scheduling endpoint — validates the slot, then creates a calendar hold + emails. */
app.post("/api/book-tour", async (req, res) => {
  const b = req.body || {};

  const required = ["name", "email", "tourDate", "tourTime"];
  const missing = required.filter((k) => !b[k] || String(b[k]).trim() === "");
  if (missing.length) {
    return res.status(400).json({ error: `Missing required field(s): ${missing.join(", ")}` });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email))) {
    return res.status(400).json({ error: "Please provide a valid email address." });
  }

  const tourDate = String(b.tourDate).trim().slice(0, 10);
  const tourTime = String(b.tourTime).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tourDate)) {
    return res.status(400).json({ error: "Please choose a valid tour date." });
  }
  if (!TOUR_SLOTS.has(tourTime)) {
    return res.status(400).json({ error: "Please choose an available tour time." });
  }
  // No tours in the past, and weekdays only.
  const todayYmd = new Date().toISOString().slice(0, 10);
  if (tourDate < todayYmd) {
    return res.status(400).json({ error: "Please choose a future date for your tour." });
  }
  if (!TOUR_ALLOWED_WEEKDAYS.has(weekdayOf(tourDate))) {
    return res.status(400).json({ error: "Tours are available Monday through Friday." });
  }

  const tour = {
    name: String(b.name).trim(),
    email: String(b.email).trim(),
    phone: b.phone ? String(b.phone).trim() : "",
    tourDate,
    tourTime,
    message: b.message ? String(b.message).trim() : "",
  };

  try {
    const calendar = await createTourEvent(tour);
    if (!calendar.configured) {
      // Calendar not set up — can't actually schedule anything.
      throw new Error("calendar not configured");
    }

    // Best-effort emails — never fail a booked tour because mail hiccuped.
    const [guest, venue] = await Promise.allSettled([
      sendTourConfirmation(tour),
      sendTourNotification(tour),
    ]);
    if (guest.status === "rejected") console.error("[/api/book-tour] guest email:", guest.reason?.message);
    if (venue.status === "rejected") console.error("[/api/book-tour] venue email:", venue.reason?.message);

    return res.status(200).json({ ok: true, htmlLink: calendar.htmlLink ?? null });
  } catch (err) {
    console.error("[/api/book-tour] failed:", err);
    return res.status(502).json({
      error:
        "We couldn't schedule your tour right now. Please try again shortly or email eventsjvo@gmail.com.",
    });
  }
});

/**
 * Contact-form inquiry — "Ask a Question". Emails the message to the JVO inbox
 * with reply-to set to the guest.
 */
app.post("/api/inquiry", async (req, res) => {
  const b = req.body || {};

  const required = ["name", "email", "message"];
  const missing = required.filter((k) => !b[k] || String(b[k]).trim() === "");
  if (missing.length) {
    return res.status(400).json({ error: `Missing required field(s): ${missing.join(", ")}` });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email))) {
    return res.status(400).json({ error: "Please provide a valid email address." });
  }

  const inquiry = {
    name: String(b.name).trim().slice(0, 200),
    email: String(b.email).trim().slice(0, 200),
    phone: b.phone ? String(b.phone).trim().slice(0, 50) : "",
    message: String(b.message).trim().slice(0, 5000),
  };

  try {
    const result = await sendInquiryNotification(inquiry);
    if (!result.configured) throw new Error("email not configured");
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[/api/inquiry] failed:", err);
    return res.status(502).json({
      error:
        "We couldn't send your message right now. Please email eventsjvo@gmail.com directly.",
    });
  }
});

/**
 * Shared booking executor: create the reservation in Deskworks AND a hold on
 * the Google Calendar. Each side is independent — if one fails we still attempt
 * the other (so the date gets blocked even if Deskworks errors) and collect the
 * errors. Returns { deskworks, calendar, errors }.
 */
async function processBooking(rawBooking) {
  // Always stamp the space so both the Deskworks reservation and the calendar
  // hold say which space (default Outdoor Event Center).
  const booking = {
    ...rawBooking,
    space: (rawBooking.space && String(rawBooking.space).trim()) || DEFAULT_SPACE,
  };
  const result = { deskworks: null, calendar: null, email: null, notification: null, errors: [] };

  try {
    result.deskworks = await createDeskworksReservation(booking);
  } catch (err) {
    console.error("[processBooking] deskworks failed:", err.message);
    result.errors.push(`deskworks: ${err.message}`);
  }

  try {
    result.calendar = await createCalendarEvent(booking);
  } catch (err) {
    console.error("[processBooking] calendar failed:", err.message);
    result.errors.push(`calendar: ${err.message}`);
  }

  // Always email the venue a copy of the submission (to the JVO contact inbox),
  // even if the calendar/Deskworks write failed — so no booking is ever lost.
  try {
    result.notification = await sendBookingNotification(booking);
  } catch (err) {
    console.error("[processBooking] booking notification failed:", err.message);
    result.errors.push(`notify: ${err.message}`);
  }

  // Record the booking in the SQLite pipeline (status awaiting_deposit) so it
  // shows up on the /admin dashboard and gets the timeline emails. Idempotent
  // on the JotForm submission id, and independent of the calendar/Deskworks
  // outcome — a valid payload always gets a record. Never fatal: without a DB
  // the site still books via calendar + email exactly as before.
  try {
    const db = getDb();
    if (db) {
      const { event, created } = createEventRecord(db, {
        ...booking,
        calendarEventId: result.calendar?.id || null,
      });
      result.pipeline = { publicId: event.public_id, created };
    }
  } catch (err) {
    console.error("[processBooking] pipeline record failed:", err.message);
    result.errors.push(`pipeline: ${err.message}`);
  }

  // Only send the guest confirmation once the booking actually landed somewhere
  // (Deskworks or the calendar). Best-effort — a mail failure never fails a booking.
  if (result.deskworks || result.calendar) {
    try {
      result.email = await sendBookingConfirmation(booking);
    } catch (err) {
      console.error("[processBooking] confirmation email failed:", err.message);
      result.errors.push(`email: ${err.message}`);
    }
  }

  return result;
}

// --- JotForm submission webhook → auto-book Deskworks + Google Calendar ---
const JOTFORM_FORM_ID = process.env.JOTFORM_FORM_ID || "222155218269153";
const JOTFORM_WEBHOOK_SECRET = process.env.JOTFORM_WEBHOOK_SECRET || "";

/** Coerce a JotForm field value (string or {first,last}/{month,day,year}/…) to text. */
function jfText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object") {
    if (v.first || v.last) return [v.first, v.last].filter(Boolean).join(" ").trim();
    if (v.year && v.month && v.day) {
      const p = (n) => String(n).padStart(2, "0");
      return `${v.year}-${p(v.month)}-${p(v.day)}`;
    }
    if (v.datetime) return String(v.datetime).trim();
    if (v.full) return String(v.full).trim();
    if (v.area && v.phone) return `(${v.area}) ${v.phone}`;
    return Object.values(v).filter(Boolean).join(" ").trim();
  }
  return String(v).trim();
}

/** Normalize a JotForm date field to YYYY-MM-DD. */
function jfDate(v) {
  if (v && typeof v === "object") {
    if (v.year && v.month && v.day) {
      const p = (n) => String(n).padStart(2, "0");
      return `${v.year}-${p(v.month)}-${p(v.day)}`;
    }
    if (v.datetime) return String(v.datetime).slice(0, 10);
  }
  const s = String(v ?? "").trim();
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  return s;
}

// Heuristic keyword → field mapping (JotForm keys look like "q5_eventDate").
// Pin exact qids without a code change via JOTFORM_FIELD_MAP, e.g.
// {"eventDate":"q5_eventDate","name":"q3_name", ...}.
const JF_KEYWORDS = {
  name: ["name", "fullname"],
  email: ["email", "emailaddress"],
  phone: ["phone", "phonenumber", "mobile", "contactnumber"],
  eventDate: ["eventdate", "dateofevent", "eventday", "date"],
  package: ["package", "eventpackage", "rentalpackage", "selectpackage"],
  space: ["space", "venue", "whichspace", "eventspace", "selectspace", "rentalspace", "whichroom"],
  eventType: ["eventtype", "typeofevent", "typeof", "occasion"],
  guestCount: ["guestcount", "numberofguests", "guests", "numberof", "headcount"],
  message: ["message", "additionalcomments", "comments", "notes", "details", "tellus"],
};

// Explicit field pin for the live booking form (JOTFORM_FORM_ID 222155218269153).
// The heuristic above can't infer these from the field names — e.g. the event
// date lives in "requestedEvent" (no "date" in it), and there's a separate
// "q142_date" agreement-signature date the keyword matcher would grab by
// mistake. Pinning here makes parsing deterministic. Any key set in the
// JOTFORM_FIELD_MAP env var overrides the matching entry below.
const DEFAULT_JF_FIELD_MAP = {
  name: "q3_fullName3",
  email: "q4_email4",
  phone: "q6_phoneNumber6",
  eventDate: "q102_requestedEvent",
  package: "q17_chooseYour",
  eventType: "q15_youAre15",
  guestCount: "q80_expectedNumber",
};

/** Map a JotForm rawRequest object (+ webhook body) to our booking schema. */
function mapJotformSubmission(raw, body) {
  const out = {
    name: "",
    email: "",
    phone: "",
    eventDate: "",
    package: "",
    space: "",
    eventType: "",
    guestCount: "",
    message: "",
    submissionId: body.submissionID || body.submissionId || raw.submissionID || "",
  };

  let explicit = { ...DEFAULT_JF_FIELD_MAP };
  if (process.env.JOTFORM_FIELD_MAP) {
    try {
      explicit = { ...explicit, ...JSON.parse(process.env.JOTFORM_FIELD_MAP) };
    } catch {
      console.warn("[jotform-hook] JOTFORM_FIELD_MAP is not valid JSON; ignoring.");
    }
  }
  for (const [field, key] of Object.entries(explicit)) {
    if (raw[key] != null) {
      out[field] = field === "eventDate" ? jfDate(raw[key]) : jfText(raw[key]);
    }
  }

  for (const [key, val] of Object.entries(raw)) {
    const norm = key.replace(/^q\d+_/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const [field, kws] of Object.entries(JF_KEYWORDS)) {
      if (out[field]) continue;
      if (kws.some((kw) => norm === kw || norm.startsWith(kw) || norm.includes(kw))) {
        out[field] = field === "eventDate" ? jfDate(val) : jfText(val);
        break;
      }
    }
  }
  return out;
}

app.post("/api/jotform-hook", upload.none(), async (req, res) => {
  // Shared-secret check (configure the webhook URL with ?token=<secret>).
  if (JOTFORM_WEBHOOK_SECRET) {
    const token = req.query.token || req.headers["x-webhook-token"];
    if (token !== JOTFORM_WEBHOOK_SECRET) {
      console.warn("[jotform-hook] rejected: bad/missing token");
      return res.status(401).json({ ok: false });
    }
  }

  // Always answer 200 — JotForm aggressively retries non-2xx responses.
  try {
    const body = req.body || {};
    const formId = body.formID || body.formId;
    if (JOTFORM_FORM_ID && formId && String(formId) !== String(JOTFORM_FORM_ID)) {
      console.warn(`[jotform-hook] ignoring submission for form ${formId}`);
      return res.status(200).json({ ok: true, ignored: true });
    }

    let raw = {};
    if (body.rawRequest) {
      try {
        raw = JSON.parse(body.rawRequest);
      } catch {
        console.warn("[jotform-hook] could not parse rawRequest");
      }
    }

    const booking = mapJotformSubmission(raw, body);
    if (!booking.name || !booking.email || !booking.eventDate) {
      console.warn("[jotform-hook] incomplete after mapping:", booking);
      return res.status(200).json({ ok: true, incomplete: true });
    }

    const result = await processBooking(booking);
    console.log("[jotform-hook] processed:", {
      submissionId: booking.submissionId,
      eventDate: booking.eventDate,
      deskworks: result.deskworks,
      calendar: result.calendar,
      pipeline: result.pipeline,
      errors: result.errors,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[jotform-hook] error:", err);
    return res.status(200).json({ ok: true, error: "logged" });
  }
});

// --- 30-day payment reminder sweep (manual trigger + daily schedule) ---
// Shares JOTFORM_WEBHOOK_SECRET (or CRON_SECRET) so only an authorized caller
// can trigger it. POST /api/cron/payment-reminders?token=...&dryRun=1
const CRON_SECRET = process.env.CRON_SECRET || process.env.JOTFORM_WEBHOOK_SECRET || "";

app.post("/api/cron/payment-reminders", async (req, res) => {
  if (CRON_SECRET) {
    const token = req.query.token || req.headers["x-cron-token"];
    if (token !== CRON_SECRET) {
      console.warn("[cron] payment-reminders rejected: bad/missing token");
      return res.status(401).json({ ok: false });
    }
  }
  try {
    const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";
    const summary = await runPaymentReminderSweep({ dryRun });
    return res.status(200).json({ ok: true, summary });
  } catch (err) {
    console.error("[cron] payment-reminders failed:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Manual trigger for the pipeline timeline sweep (same token protection).
// POST /api/cron/pipeline?token=...&dryRun=1
app.post("/api/cron/pipeline", async (req, res) => {
  if (CRON_SECRET) {
    const token = req.query.token || req.headers["x-cron-token"];
    if (token !== CRON_SECRET) {
      console.warn("[cron] pipeline rejected: bad/missing token");
      return res.status(401).json({ ok: false });
    }
  }
  try {
    const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";
    const summary = await runPipelineSweep({ dryRun });
    return res.status(200).json({ ok: true, summary });
  } catch (err) {
    console.error("[cron] pipeline sweep failed:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Daily in-process schedule. Default 9:00am Eastern; override with
// PAYMENT_REMINDER_CRON (5-field cron) / EVENT_TIMEZONE. Runs both the legacy
// 30-day payment sweep and the pipeline timeline sweep (45/30/15/14/3-day).
const REMINDER_CRON = process.env.PAYMENT_REMINDER_CRON || "0 9 * * *";
const REMINDER_TZ = process.env.EVENT_TIMEZONE || "America/New_York";
if (cron.validate(REMINDER_CRON)) {
  cron.schedule(
    REMINDER_CRON,
    () => {
      runPaymentReminderSweep().catch((err) =>
        console.error("[cron] scheduled payment-reminders failed:", err.message)
      );
      runPipelineSweep().catch((err) =>
        console.error("[cron] scheduled pipeline sweep failed:", err.message)
      );
    },
    { timezone: REMINDER_TZ }
  );
  console.log(`[cron] payment reminders + pipeline sweep scheduled "${REMINDER_CRON}" (${REMINDER_TZ})`);
} else {
  console.warn(`[cron] invalid PAYMENT_REMINDER_CRON "${REMINDER_CRON}" — daily sweep disabled`);
}

// --- Booking pipeline: staff admin dashboard + guest details verification ---
// /admin and /api/admin/* sit behind HTTP Basic Auth (ADMIN_USER/ADMIN_PASSWORD;
// 503 until those are set). /verify/:token is the guest-facing confirmation
// page linked from the 15-day email, and /staff/:token is the staff
// availability portal linked from the staffing-request email. All live
// OUTSIDE the Vite SPA.
app.use(adminRouter);
app.use(verifyRouter);
app.use(staffPortalRouter);

// --- Serve the built front-end (production) ---
const distDir = path.join(__dirname, "dist");
app.use(express.static(distDir));

// SPA fallback: anything not matched above returns index.html so React Router
// can handle client-side routes like /book directly.
app.get("*", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`JVO Events server listening on http://localhost:${PORT}`);
});
