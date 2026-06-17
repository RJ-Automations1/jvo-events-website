import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDeskworksReservation } from "./server/deskworks.js";
import { getBookedDates, createCalendarEvent } from "./server/googleCalendar.js";
import { getDeskworksBookedDates } from "./server/deskworksAvailability.js";

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

/** Basic health check (useful for Render). */
app.get("/api/health", (_req, res) => res.json({ ok: true }));

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
        "We couldn't complete your booking right now. Please try again shortly or email jonesborovirtualoffice@gmail.com.",
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
  const result = { deskworks: null, calendar: null, errors: [] };

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

  let explicit = {};
  if (process.env.JOTFORM_FIELD_MAP) {
    try {
      explicit = JSON.parse(process.env.JOTFORM_FIELD_MAP);
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
      errors: result.errors,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[jotform-hook] error:", err);
    return res.status(200).json({ ok: true, error: "logged" });
  }
});

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
