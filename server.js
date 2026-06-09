import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDeskworksReservation } from "./server/deskworks.js";
import { getBookedDates } from "./server/googleCalendar.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8787;

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

/**
 * Availability — returns booked dates (YYYY-MM-DD) from the Google Calendar so
 * the date picker can grey them out. Defaults to a ~13-month window.
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
    const { configured, bookedDates } = await getBookedDates(from, to);
    return res.json({ ok: true, configured, bookedDates });
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
    const result = await createDeskworksReservation({
      name: String(b.name).trim(),
      email: String(b.email).trim(),
      phone: b.phone ? String(b.phone).trim() : "",
      eventDate: String(b.eventDate).trim(),
      eventType: b.eventType ? String(b.eventType).trim() : "",
      package: String(b.package).trim(),
      guestCount: b.guestCount ? String(b.guestCount).trim() : "",
      message: b.message ? String(b.message).trim() : "",
    });

    return res.status(200).json({ ok: true, reference: result.reference ?? null });
  } catch (err) {
    console.error("[/api/book] failed:", err);
    return res.status(502).json({
      error:
        "We couldn't complete your booking right now. Please try again shortly or email info@jvoevents.com.",
    });
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
