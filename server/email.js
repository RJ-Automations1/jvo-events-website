/**
 * Booking confirmation email.
 * ---------------------------
 * Sends a "thank you / your reservation is tentatively confirmed" email once a
 * booking has been recorded (deposit received). Delivery is best-effort: if SMTP
 * isn't configured the send is skipped silently so it never blocks a booking.
 *
 * Configure via env (set in Render → Environment, and locally in .env):
 *   SMTP_USER       the sending mailbox, e.g. jonesborovirtualoffice@gmail.com
 *   SMTP_PASS       an app password for that mailbox (NOT the normal password)
 *   SMTP_HOST       optional, defaults to smtp.gmail.com
 *   SMTP_PORT       optional, defaults to 465 (SSL)
 *   MAIL_FROM       optional "JVO Events <...>" display address, defaults to SMTP_USER
 *   MAIL_REPLY_TO   optional reply-to + venue contact/notify inbox, defaults to eventsjvo@gmail.com
 *
 * For Gmail you must turn on 2-Step Verification and create an App Password
 * (Google Account → Security → App passwords), then use that 16-char value as
 * SMTP_PASS.
 */

import nodemailer from "nodemailer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || "465");
const MAIL_FROM =
  process.env.MAIL_FROM || (SMTP_USER ? `JVO Events <${SMTP_USER}>` : "");
const MAIL_REPLY_TO =
  process.env.MAIL_REPLY_TO || "eventsjvo@gmail.com";
/**
 * Email logo.
 * -----------
 * The logo ships with the app, so we attach it inline (a "cid:" reference)
 * rather than hotlinking it. That matters for two reasons:
 *   1. jvoevents.com is a domain forwarder — it redirects "/" to the Render app
 *      but 404s deep paths, so a hotlinked /manus-storage/... URL never loads.
 *   2. Many mail clients block remote images by default; inline attachments
 *      render without the recipient clicking "show images".
 * LOGO_URL is only a fallback for when the file isn't on disk; point it at a
 * host that actually serves the asset (the Render URL does).
 */
const LOGO_CID = "jvo-logo";
const LOGO_FILE =
  [
    path.join(__dirname, "..", "public", "manus-storage", "jvo-logo.png"),
    path.join(__dirname, "..", "dist", "manus-storage", "jvo-logo.png"),
  ].find((p) => fs.existsSync(p)) || null;
const LOGO_URL =
  process.env.LOGO_URL ||
  "https://jvo-events.onrender.com/manus-storage/jvo-logo.png";
/** What the <img> points at: the inline attachment when we have the file. */
const LOGO_SRC = LOGO_FILE ? `cid:${LOGO_CID}` : LOGO_URL;
/** Attachment list that backs LOGO_SRC — empty when falling back to a URL. */
const LOGO_ATTACHMENTS = LOGO_FILE
  ? [
      {
        filename: "jvo-logo.png",
        path: LOGO_FILE,
        cid: LOGO_CID,
        contentDisposition: "inline",
      },
    ]
  : [];

if (!LOGO_FILE) {
  console.warn(`[email] logo file not found on disk — falling back to ${LOGO_URL}`);
}

let transporter = null;
function getTransporter() {
  if (!SMTP_USER || !SMTP_PASS) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // 465 = implicit SSL; 587 = STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

export function emailConfigured() {
  return Boolean(SMTP_USER && SMTP_PASS);
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

/**
 * Format a YYYY-MM-DD string as "Saturday, August 16, 2025" without tripping over
 * timezone offsets (parsing the parts directly rather than via Date(string)).
 */
function prettyDate(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(ymd || "").trim();
  const [, y, mo, d] = m.map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  const weekday = WEEKDAYS[dt.getUTCDay()];
  return `${weekday}, ${MONTHS[mo - 1]} ${d}, ${y}`;
}

/** Format a 24h "HH:MM" clock string as "2:30 PM". */
function prettyTime(hhmm) {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(hhmm || "").trim();
  let h = Number(m[1]);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ampm}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildText(name, dateStr) {
  return `Hi ${name},

Thank you for booking with JVOevents.com. Your reservation is tentatively confirmed for ${dateStr}.

We've received your $150 security deposit and your date is now being held.

IMPORTANT — FULL PAYMENT
The full balance for your event is required within 14 days of your event date. If your full payment has not been received within those 14 days, your booking will be canceled and your $150 security deposit will not be refunded.

If you have any questions, just reply to this email or reach us at ${MAIL_REPLY_TO}.

We can't wait to host your event!

— JVO Events
Jonesboro, Georgia
jvoevents.com`;
}

function buildHtml(name, dateStr) {
  const safeName = escapeHtml(name);
  const safeDate = escapeHtml(dateStr);
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f2ee;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee;padding:28px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e7e2d8;">
            <tr>
              <td style="background:#0b0b0b;padding:30px 36px;text-align:center;">
                <div style="font-family:Georgia,'Times New Roman',serif;color:#ffffff;font-size:24px;letter-spacing:1px;">JVO Events</div>
                <div style="font-family:Arial,Helvetica,sans-serif;color:#c9a96a;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin-top:6px;">Jonesboro, Georgia</div>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 36px 8px 36px;font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;">
                <p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">Hi ${safeName},</p>
                <p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">
                  Thank you for booking with <strong>JVOevents.com</strong>. Your reservation is
                  <strong>tentatively confirmed</strong> for:
                </p>
                <p style="font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#0b0b0b;background:#f7f4ee;border-left:3px solid #c9a96a;padding:14px 18px;margin:0 0 22px 0;">
                  ${safeDate}
                </p>
                <p style="font-size:16px;line-height:1.6;margin:0 0 22px 0;">
                  We've received your <strong>$150 security deposit</strong> and your date is now being held.
                </p>
                <div style="border:1px solid #e7d9bf;background:#fbf7ee;padding:18px 20px;margin:0 0 22px 0;">
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#9a7b35;font-weight:bold;margin-bottom:8px;">Important — Full Payment</div>
                  <p style="font-size:15px;line-height:1.6;margin:0;color:#2b2b2b;">
                    The full balance for your event is required <strong>within 14 days of your event date</strong>.
                    If your full payment has not been received within those 14 days, your booking will be
                    canceled and your <strong>$150 security deposit will not be refunded</strong>.
                  </p>
                </div>
                <p style="font-size:15px;line-height:1.6;margin:0 0 22px 0;color:#555;">
                  If you have any questions, just reply to this email or reach us at
                  <a href="mailto:${escapeHtml(MAIL_REPLY_TO)}" style="color:#9a7b35;">${escapeHtml(MAIL_REPLY_TO)}</a>.
                </p>
                <p style="font-size:16px;line-height:1.6;margin:0 0 4px 0;">We can't wait to host your event!</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 36px 32px 36px;font-family:Georgia,'Times New Roman',serif;color:#0b0b0b;">
                <div style="border-top:1px solid #e7e2d8;padding-top:18px;font-size:15px;">
                  — JVO Events<br>
                  <span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#777;">jvoevents.com</span>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildReminderText(name, dateStr, balanceStr, invoiceUrl) {
  return `Hi ${name},

A friendly reminder from JVO Events — your event on ${dateStr} is about 30 days away, and your full balance is still due${balanceStr ? ` (${balanceStr})` : ""}.

Please complete your payment to keep your reservation.${invoiceUrl ? `\n\nPay your balance here: ${invoiceUrl}` : ""}

IMPORTANT — 14-DAY CUTOFF
Full payment is required no later than 14 days before your event. If your full payment has not been received by then, your booking will be canceled and your $150 security deposit will not be refunded.

Questions? Just reply to this email or reach us at ${MAIL_REPLY_TO}.

— JVO Events
Jonesboro, Georgia
jvoevents.com`;
}

function buildReminderHtml(name, dateStr, balanceStr, invoiceUrl) {
  const safeName = escapeHtml(name);
  const safeDate = escapeHtml(dateStr);
  const balanceLine = balanceStr
    ? `<p style="font-size:16px;line-height:1.6;margin:0 0 22px 0;">Your outstanding balance is <strong>${escapeHtml(balanceStr)}</strong>.</p>`
    : "";
  const payButton = invoiceUrl
    ? `<p style="margin:0 0 26px 0;"><a href="${escapeHtml(invoiceUrl)}" style="display:inline-block;background:#0b0b0b;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;padding:13px 26px;border:1px solid #c9a96a;">Pay Your Balance</a></p>`
    : "";
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f2ee;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee;padding:28px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e7e2d8;">
            <tr>
              <td style="background:#0b0b0b;padding:30px 36px;text-align:center;">
                <div style="font-family:Georgia,'Times New Roman',serif;color:#ffffff;font-size:24px;letter-spacing:1px;">JVO Events</div>
                <div style="font-family:Arial,Helvetica,sans-serif;color:#c9a96a;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin-top:6px;">Payment Reminder</div>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 36px 8px 36px;font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;">
                <p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">Hi ${safeName},</p>
                <p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">
                  A friendly reminder that your event with JVO Events is coming up on:
                </p>
                <p style="font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#0b0b0b;background:#f7f4ee;border-left:3px solid #c9a96a;padding:14px 18px;margin:0 0 22px 0;">
                  ${safeDate} &nbsp;·&nbsp; about 30 days away
                </p>
                ${balanceLine}
                <p style="font-size:16px;line-height:1.6;margin:0 0 22px 0;">
                  Your <strong>full balance is still due</strong>. Please complete your payment to keep your reservation.
                </p>
                ${payButton}
                <div style="border:1px solid #e7d9bf;background:#fbf7ee;padding:18px 20px;margin:0 0 22px 0;">
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#9a7b35;font-weight:bold;margin-bottom:8px;">Important — 14-Day Cutoff</div>
                  <p style="font-size:15px;line-height:1.6;margin:0;color:#2b2b2b;">
                    Full payment is required <strong>no later than 14 days before your event</strong>.
                    If your full payment has not been received by then, your booking will be canceled
                    and your <strong>$150 security deposit will not be refunded</strong>.
                  </p>
                </div>
                <p style="font-size:15px;line-height:1.6;margin:0 0 22px 0;color:#555;">
                  Questions? Just reply to this email or reach us at
                  <a href="mailto:${escapeHtml(MAIL_REPLY_TO)}" style="color:#9a7b35;">${escapeHtml(MAIL_REPLY_TO)}</a>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 36px 32px 36px;font-family:Georgia,'Times New Roman',serif;color:#0b0b0b;">
                <div style="border-top:1px solid #e7e2d8;padding-top:18px;font-size:15px;">
                  — JVO Events<br>
                  <span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#777;">jvoevents.com</span>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Send the 30-day "your balance is due" reminder.
 * @param {object} booking - { name, email, eventDate, balanceDue?, invoiceUrl? }
 */
export async function sendPaymentReminder(booking) {
  const t = getTransporter();
  if (!t) {
    console.warn("[email] SMTP not configured — skipping payment reminder.");
    return { configured: false, sent: false };
  }
  const to = (booking.email || "").trim();
  if (!to) return { configured: true, sent: false, skipped: "no recipient" };

  const firstName = ((booking.name || "there").trim() || "there").split(/\s+/)[0];
  const dateStr = prettyDate(booking.eventDate);
  const balanceStr =
    typeof booking.balanceDue === "number"
      ? `$${booking.balanceDue.toLocaleString("en-US")}`
      : "";

  await t.sendMail({
    from: MAIL_FROM,
    to,
    replyTo: MAIL_REPLY_TO,
    subject: `Reminder: full payment due for your JVO Events booking — ${dateStr}`,
    text: buildReminderText(firstName, dateStr, balanceStr, booking.invoiceUrl),
    html: buildReminderHtml(firstName, dateStr, balanceStr, booking.invoiceUrl),
  });

  return { configured: true, sent: true };
}

/**
 * Send the booking confirmation. Resolves to { configured, sent, skipped? } and
 * only throws on an actual SMTP send failure (so the caller can log it).
 */
export async function sendBookingConfirmation(booking) {
  const t = getTransporter();
  if (!t) {
    console.warn("[email] SMTP not configured — skipping confirmation email.");
    return { configured: false, sent: false };
  }

  const name = (booking.name || "there").trim() || "there";
  const firstName = name.split(/\s+/)[0];
  const dateStr = prettyDate(booking.eventDate);
  const to = (booking.email || "").trim();
  if (!to) return { configured: true, sent: false, skipped: "no recipient" };

  await t.sendMail({
    from: MAIL_FROM,
    to,
    replyTo: MAIL_REPLY_TO,
    subject: `Your JVO Events reservation is confirmed — ${dateStr}`,
    text: buildText(firstName, dateStr),
    html: buildHtml(firstName, dateStr),
  });

  return { configured: true, sent: true };
}

function buildTourText(name, dateStr, timeStr) {
  return `Hi ${name},

Thank you for scheduling a tour with JVO Events. Your tour of the Outdoor Event Center is confirmed for:

${dateStr} at ${timeStr}

We'll meet you at the venue in Jonesboro, Georgia. The tour takes about 30 minutes — come with any questions about pricing, packages, and how you'd like to use the space.

Need to reschedule or can't make it? Just reply to this email or reach us at ${MAIL_REPLY_TO}.

We look forward to showing you around!

— JVO Events
Jonesboro, Georgia
jvoevents.com`;
}

function buildTourHtml(name, dateStr, timeStr) {
  const safeName = escapeHtml(name);
  const safeWhen = escapeHtml(`${dateStr} · ${timeStr}`);
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f2ee;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee;padding:28px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e7e2d8;">
            <tr>
              <td style="background:#0b0b0b;padding:28px 36px 26px 36px;text-align:center;">
                <img src="${LOGO_SRC}" width="132" alt="Jonesboro Virtual Offices &amp; Suites" style="display:block;width:132px;max-width:55%;height:auto;margin:0 auto 14px auto;border:0;" />
                <div style="font-family:Arial,Helvetica,sans-serif;color:#c9a96a;font-size:11px;letter-spacing:3px;text-transform:uppercase;">Tour Confirmed</div>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 36px 8px 36px;font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;">
                <p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">Hi ${safeName},</p>
                <p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">
                  Thank you for scheduling a tour with <strong>JVO Events</strong>. Your tour of the
                  Outdoor Event Center is <strong>confirmed</strong> for:
                </p>
                <p style="font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#0b0b0b;background:#f7f4ee;border-left:3px solid #c9a96a;padding:14px 18px;margin:0 0 22px 0;">
                  ${safeWhen}
                </p>
                <p style="font-size:16px;line-height:1.6;margin:0 0 22px 0;">
                  We'll meet you at the venue in Jonesboro, Georgia. The tour takes about
                  <strong>30 minutes</strong> — come with any questions about pricing, packages,
                  and how you'd like to use the space.
                </p>
                <p style="font-size:15px;line-height:1.6;margin:0 0 22px 0;color:#555;">
                  Need to reschedule or can't make it? Just reply to this email or reach us at
                  <a href="mailto:${escapeHtml(MAIL_REPLY_TO)}" style="color:#9a7b35;">${escapeHtml(MAIL_REPLY_TO)}</a>.
                </p>
                <p style="font-size:16px;line-height:1.6;margin:0 0 4px 0;">We look forward to showing you around!</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 36px 32px 36px;font-family:Georgia,'Times New Roman',serif;color:#0b0b0b;">
                <div style="border-top:1px solid #e7e2d8;padding-top:18px;font-size:15px;">
                  — JVO Events<br>
                  <span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#777;">jvoevents.com</span>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Send the tour confirmation to the guest. Resolves to { configured, sent,
 * skipped? } and only throws on an actual SMTP send failure.
 * @param {object} tour - { name, email, tourDate (YYYY-MM-DD), tourTime ("HH:MM") }
 */
export async function sendTourConfirmation(tour) {
  const t = getTransporter();
  if (!t) {
    console.warn("[email] SMTP not configured — skipping tour confirmation.");
    return { configured: false, sent: false };
  }
  const name = (tour.name || "there").trim() || "there";
  const firstName = name.split(/\s+/)[0];
  const dateStr = prettyDate(tour.tourDate);
  const timeStr = prettyTime(tour.tourTime);
  const to = (tour.email || "").trim();
  if (!to) return { configured: true, sent: false, skipped: "no recipient" };

  await t.sendMail({
    from: MAIL_FROM,
    to,
    replyTo: MAIL_REPLY_TO,
    subject: `Your JVO Events tour is confirmed — ${dateStr} at ${timeStr}`,
    text: buildTourText(firstName, dateStr, timeStr),
    html: buildTourHtml(firstName, dateStr, timeStr),
    attachments: LOGO_ATTACHMENTS,
  });

  return { configured: true, sent: true };
}

/**
 * Notify JVO (the venue) that a guest booked a tour. Sent to MAIL_REPLY_TO.
 * @param {object} tour - { name, email, phone?, tourDate, tourTime, message? }
 */
export async function sendTourNotification(tour) {
  const t = getTransporter();
  if (!t) return { configured: false, sent: false };
  const dateStr = prettyDate(tour.tourDate);
  const timeStr = prettyTime(tour.tourTime);
  const lines = [
    `New tour booked for ${dateStr} at ${timeStr}.`,
    "",
    `Name:  ${tour.name || "—"}`,
    `Email: ${tour.email || "—"}`,
    `Phone: ${tour.phone || "—"}`,
    tour.message ? `Notes: ${tour.message}` : null,
    "",
    "It's on the JVO Google Calendar as a 30-minute appointment.",
  ].filter((l) => l !== null);

  await t.sendMail({
    from: MAIL_FROM,
    to: MAIL_REPLY_TO,
    replyTo: (tour.email || "").trim() || MAIL_REPLY_TO,
    subject: `New tour: ${tour.name || "Guest"} — ${dateStr} at ${timeStr}`,
    text: lines.join("\n"),
  });

  return { configured: true, sent: true };
}

/**
 * Notify JVO that a guest left a question/inquiry through the contact form.
 * Sent to MAIL_REPLY_TO with reply-to set to the guest, so answering is one
 * click. @param {object} inquiry - { name, email, phone?, message }
 */
export async function sendInquiryNotification(inquiry) {
  const t = getTransporter();
  if (!t) return { configured: false, sent: false };
  const lines = [
    "New question/inquiry from the website contact form.",
    "",
    `Name:  ${inquiry.name || "—"}`,
    `Email: ${inquiry.email || "—"}`,
    `Phone: ${inquiry.phone || "—"}`,
    "",
    "Message:",
    inquiry.message || "—",
  ];

  await t.sendMail({
    from: MAIL_FROM,
    to: MAIL_REPLY_TO,
    replyTo: (inquiry.email || "").trim() || MAIL_REPLY_TO,
    subject: `New inquiry: ${inquiry.name || "Guest"}`,
    text: lines.join("\n"),
  });

  return { configured: true, sent: true };
}

/**
 * Notify JVO (the venue) that an event booking was submitted — a full copy of
 * the submission, sent to MAIL_REPLY_TO (the JVO contact inbox). Fires for every
 * booking, including JotForm webhook submissions.
 * @param {object} booking - { name, email, phone?, eventDate, eventType?,
 *   package?, space?, guestCount?, message?, submissionId? }
 */
export async function sendBookingNotification(booking) {
  const t = getTransporter();
  if (!t) return { configured: false, sent: false };
  const dateStr = prettyDate(booking.eventDate);
  const lines = [
    `New event booking submitted for ${dateStr}.`,
    "",
    `Name:     ${booking.name || "—"}`,
    `Email:    ${booking.email || "—"}`,
    `Phone:    ${booking.phone || "—"}`,
    `Date:     ${dateStr}`,
    booking.eventType ? `Type:     ${booking.eventType}` : null,
    booking.package ? `Package:  ${booking.package}` : null,
    booking.space ? `Space:    ${booking.space}` : null,
    booking.guestCount ? `Guests:   ${booking.guestCount}` : null,
    booking.message ? `Notes:    ${booking.message}` : null,
    booking.submissionId ? `JotForm submission: ${booking.submissionId}` : null,
    "",
    "The date is held on the JVO Google Calendar (deposit pending until paid).",
  ].filter((l) => l !== null);

  await t.sendMail({
    from: MAIL_FROM,
    to: MAIL_REPLY_TO,
    replyTo: (booking.email || "").trim() || MAIL_REPLY_TO,
    subject: `New booking: ${booking.name || "Guest"} — ${dateStr}`,
    text: lines.join("\n"),
  });

  return { configured: true, sent: true };
}

// ---------------------------------------------------------------------------
// Pipeline timeline emails (45/30/15/14/3 days out) — see pipelineScheduler.js
// ---------------------------------------------------------------------------

/**
 * Shared branded shell for pipeline emails: the dark JVO Events header with a
 * gold kicker label, an inner content block, and the standard footer — so every
 * timeline email matches the look of the confirmation/reminder emails above.
 */
function buildShellHtml(label, innerHtml) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f2ee;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee;padding:28px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e7e2d8;">
            <tr>
              <td style="background:#0b0b0b;padding:30px 36px;text-align:center;">
                <div style="font-family:Georgia,'Times New Roman',serif;color:#ffffff;font-size:24px;letter-spacing:1px;">JVO Events</div>
                <div style="font-family:Arial,Helvetica,sans-serif;color:#c9a96a;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin-top:6px;">${escapeHtml(label)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 36px 8px 36px;font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;">
                ${innerHtml}
                <p style="font-size:15px;line-height:1.6;margin:0 0 22px 0;color:#555;">
                  Questions? Just reply to this email or reach us at
                  <a href="mailto:${escapeHtml(MAIL_REPLY_TO)}" style="color:#9a7b35;">${escapeHtml(MAIL_REPLY_TO)}</a>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 36px 32px 36px;font-family:Georgia,'Times New Roman',serif;color:#0b0b0b;">
                <div style="border-top:1px solid #e7e2d8;padding-top:18px;font-size:15px;">
                  — JVO Events<br>
                  <span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#777;">jvoevents.com</span>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** The gold-bordered date callout used across the branded emails. */
function dateCalloutHtml(textInside) {
  return `<p style="font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#0b0b0b;background:#f7f4ee;border-left:3px solid #c9a96a;padding:14px 18px;margin:0 0 22px 0;">${textInside}</p>`;
}

/** First name of a guest, falling back to "there". */
function firstNameOf(name) {
  return ((name || "there").trim() || "there").split(/\s+/)[0];
}

/**
 * 45-day courtesy reminder — a warm "your event is coming up" check-in.
 * @param {object} ev - { name, email, event_date, package? }
 */
export async function sendCourtesyReminder(ev) {
  const t = getTransporter();
  if (!t) {
    console.warn("[email] SMTP not configured — skipping courtesy reminder.");
    return { configured: false, sent: false };
  }
  const to = (ev.email || "").trim();
  if (!to) return { configured: true, sent: false, skipped: "no recipient" };
  const name = firstNameOf(ev.name);
  const dateStr = prettyDate(ev.event_date);

  const text = `Hi ${name},

Just a friendly note from JVO Events — your event on ${dateStr} is about 45 days away, and we're already looking forward to hosting you.

A few reminders so everything stays effortless:
- Your $150 security deposit holds your date.
- Venue rental is $800 for a half day (5 hours) or $1,300 for a full day (10 hours).
- Your full balance is due no later than 14 days before your event.

Closer to your date we'll send you a quick link to confirm your event details (times, guest count, and any special requests), so you don't have to remember a thing.

Questions? Just reply to this email or reach us at ${MAIL_REPLY_TO}.

— JVO Events
Jonesboro, Georgia
jvoevents.com`;

  const inner = `
<p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">Hi ${escapeHtml(name)},</p>
<p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">
  Just a friendly note from <strong>JVO Events</strong> — your event is about
  <strong>45 days away</strong>, and we're already looking forward to hosting you:
</p>
${dateCalloutHtml(escapeHtml(dateStr))}
<p style="font-size:16px;line-height:1.6;margin:0 0 12px 0;">A few reminders so everything stays effortless:</p>
<ul style="font-size:15px;line-height:1.7;margin:0 0 22px 0;padding-left:20px;color:#2b2b2b;">
  <li>Your <strong>$150 security deposit</strong> holds your date.</li>
  <li>Venue rental is <strong>$800</strong> for a half day (5 hours) or <strong>$1,300</strong> for a full day (10 hours).</li>
  <li>Your full balance is due <strong>no later than 14 days</strong> before your event.</li>
</ul>
<p style="font-size:16px;line-height:1.6;margin:0 0 22px 0;">
  Closer to your date we'll send a quick link to confirm your event details — times,
  guest count, and any special requests — so you don't have to remember a thing.
</p>`;

  await t.sendMail({
    from: MAIL_FROM,
    to,
    replyTo: MAIL_REPLY_TO,
    subject: `45 days to go — your JVO Events booking on ${dateStr}`,
    text,
    html: buildShellHtml("45-Day Check-In", inner),
  });
  return { configured: true, sent: true };
}

/**
 * 15-day details-verification request — asks the guest to confirm (or correct)
 * their event details via the tokenized /verify link.
 * @param {object} ev - { name, email, event_date }
 * @param {string} verifyUrl - absolute link to the verification page
 */
export async function sendDetailsVerificationRequest(ev, verifyUrl) {
  const t = getTransporter();
  if (!t) {
    console.warn("[email] SMTP not configured — skipping verification request.");
    return { configured: false, sent: false };
  }
  const to = (ev.email || "").trim();
  if (!to) return { configured: true, sent: false, skipped: "no recipient" };
  const name = firstNameOf(ev.name);
  const dateStr = prettyDate(ev.event_date);

  const text = `Hi ${name},

Your event at JVO Events on ${dateStr} is just about two weeks away — time to make sure every detail is exactly right.

Please take one minute to confirm your event details (times, guest count, vehicles, vendors, and any special requests):

${verifyUrl}

If everything looks good, one click confirms it. If anything has changed, you can tell us right on that page and our team will follow up.

Questions? Just reply to this email or reach us at ${MAIL_REPLY_TO}.

— JVO Events
Jonesboro, Georgia
jvoevents.com`;

  const inner = `
<p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">Hi ${escapeHtml(name)},</p>
<p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">
  Your event at <strong>JVO Events</strong> is just about two weeks away — time to
  make sure every detail is exactly right:
</p>
${dateCalloutHtml(escapeHtml(dateStr))}
<p style="font-size:16px;line-height:1.6;margin:0 0 22px 0;">
  Please take one minute to confirm your event details — times, guest count,
  vehicles, vendors, and any special requests.
</p>
<p style="margin:0 0 26px 0;"><a href="${escapeHtml(verifyUrl)}" style="display:inline-block;background:#0b0b0b;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;padding:13px 26px;border:1px solid #c9a96a;">Confirm My Event Details</a></p>
<p style="font-size:15px;line-height:1.6;margin:0 0 22px 0;color:#555;">
  If everything looks good, one click confirms it. If anything has changed, you can
  tell us right on that page and our team will follow up.
</p>`;

  await t.sendMail({
    from: MAIL_FROM,
    to,
    replyTo: MAIL_REPLY_TO,
    subject: `Please confirm your event details — ${dateStr} at JVO Events`,
    text,
    html: buildShellHtml("Confirm Your Details", inner),
  });
  return { configured: true, sent: true };
}

/**
 * 14-day final-payment-due notice — the hard cutoff from the booking terms.
 * @param {object} ev - { name, email, event_date }
 */
export async function sendFinalPaymentDue(ev) {
  const t = getTransporter();
  if (!t) {
    console.warn("[email] SMTP not configured — skipping final-payment notice.");
    return { configured: false, sent: false };
  }
  const to = (ev.email || "").trim();
  if (!to) return { configured: true, sent: false, skipped: "no recipient" };
  const name = firstNameOf(ev.name);
  const dateStr = prettyDate(ev.event_date);

  const text = `Hi ${name},

Your event at JVO Events on ${dateStr} is 14 days away — which means your full balance is now due.

Per your booking agreement, full payment is required no later than 14 days before your event. If the full balance is not received, your booking will be canceled and your $150 security deposit will not be refunded.

If you've already sent your payment, thank you — you can disregard this notice. If you're not sure of your remaining balance, just reply to this email and we'll confirm it right away.

— JVO Events
Jonesboro, Georgia
jvoevents.com`;

  const inner = `
<p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">Hi ${escapeHtml(name)},</p>
<p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">
  Your event at <strong>JVO Events</strong> is <strong>14 days away</strong> — which
  means your full balance is now due:
</p>
${dateCalloutHtml(escapeHtml(dateStr))}
<div style="border:1px solid #e7d9bf;background:#fbf7ee;padding:18px 20px;margin:0 0 22px 0;">
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#9a7b35;font-weight:bold;margin-bottom:8px;">Final Payment Due</div>
  <p style="font-size:15px;line-height:1.6;margin:0;color:#2b2b2b;">
    Per your booking agreement, full payment is required <strong>no later than 14 days
    before your event</strong>. If the full balance is not received, your booking will be
    canceled and your <strong>$150 security deposit will not be refunded</strong>.
  </p>
</div>
<p style="font-size:15px;line-height:1.6;margin:0 0 22px 0;color:#555;">
  If you've already sent your payment, thank you — you can disregard this notice.
  Not sure of your remaining balance? Just reply and we'll confirm it right away.
</p>`;

  await t.sendMail({
    from: MAIL_FROM,
    to,
    replyTo: MAIL_REPLY_TO,
    subject: `Final payment due — your JVO Events booking on ${dateStr}`,
    text,
    html: buildShellHtml("Final Payment Due", inner),
  });
  return { configured: true, sent: true };
}

/**
 * 3-day final event reminder to the guest — arrival details, venue address, and
 * the house-rules highlights.
 * @param {object} ev - { name, email, event_date, start_time?, end_time? }
 */
export async function sendEventFinalReminder(ev) {
  const t = getTransporter();
  if (!t) {
    console.warn("[email] SMTP not configured — skipping final event reminder.");
    return { configured: false, sent: false };
  }
  const to = (ev.email || "").trim();
  if (!to) return { configured: true, sent: false, skipped: "no recipient" };
  const name = firstNameOf(ev.name);
  const dateStr = prettyDate(ev.event_date);
  const timeStr =
    ev.start_time && ev.end_time
      ? `${prettyTime(ev.start_time)} – ${prettyTime(ev.end_time)}`
      : "";

  const text = `Hi ${name},

It's almost time — your event at JVO Events is this ${dateStr}${timeStr ? ` (${timeStr})` : ""}! Here's everything you need for a smooth day:

WHERE TO FIND US
127 Jonesboro Rd, Suite 100, Jonesboro, GA 30236

A FEW HOUSE REMINDERS
- Parking is limited to 45 vehicles — let your guests know to carpool where they can.
- No confetti, please, and only pre-approved vendors on site.
- Please return the space the way you found it at the end of your rental window.

Our team will have the venue prepped and ready when you arrive. If anything comes up before then, just reply to this email or call (678) 519-4723.

We can't wait to celebrate with you!

— JVO Events
Jonesboro, Georgia
jvoevents.com`;

  const inner = `
<p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">Hi ${escapeHtml(name)},</p>
<p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">
  It's almost time — your event at <strong>JVO Events</strong> is this:
</p>
${dateCalloutHtml(escapeHtml(dateStr) + (timeStr ? ` &nbsp;·&nbsp; ${escapeHtml(timeStr)}` : ""))}
<p style="font-size:16px;line-height:1.6;margin:0 0 8px 0;"><strong>Where to find us</strong></p>
<p style="font-size:15px;line-height:1.6;margin:0 0 22px 0;">127 Jonesboro Rd, Suite 100, Jonesboro, GA 30236</p>
<p style="font-size:16px;line-height:1.6;margin:0 0 8px 0;"><strong>A few house reminders</strong></p>
<ul style="font-size:15px;line-height:1.7;margin:0 0 22px 0;padding-left:20px;color:#2b2b2b;">
  <li>Parking is limited to <strong>45 vehicles</strong> — encourage guests to carpool.</li>
  <li>No confetti, please, and only pre-approved vendors on site.</li>
  <li>Please return the space the way you found it at the end of your rental window.</li>
</ul>
<p style="font-size:16px;line-height:1.6;margin:0 0 22px 0;">
  Our team will have the venue prepped and ready when you arrive. If anything comes
  up before then, just reply to this email or call <strong>(678) 519-4723</strong>.
</p>
<p style="font-size:16px;line-height:1.6;margin:0 0 4px 0;">We can't wait to celebrate with you!</p>`;

  await t.sendMail({
    from: MAIL_FROM,
    to,
    replyTo: MAIL_REPLY_TO,
    subject: `See you soon — your JVO Events event on ${dateStr}`,
    text,
    html: buildShellHtml("Your Event Is Almost Here", inner),
  });
  return { configured: true, sent: true };
}

/**
 * 3-day event summary to staff (MAIL_REPLY_TO) — everything the team needs to
 * prep the venue, in one plain-text email.
 * @param {object} ev - a full events DB row
 */
export async function sendEventSummaryToStaff(ev) {
  const t = getTransporter();
  if (!t) return { configured: false, sent: false };
  const dateStr = prettyDate(ev.event_date);
  const lines = [
    `Event prep summary — ${ev.public_id || `event #${ev.id}`} is 3 days out.`,
    "",
    `Guest:    ${ev.name || "—"}`,
    `Email:    ${ev.email || "—"}`,
    `Phone:    ${ev.phone || "—"}`,
    `Date:     ${dateStr}`,
    ev.start_time || ev.end_time
      ? `Time:     ${ev.start_time || "?"} – ${ev.end_time || "?"}`
      : null,
    ev.event_type ? `Type:     ${ev.event_type}` : null,
    ev.package ? `Package:  ${ev.package}` : null,
    ev.guest_count != null ? `Guests:   ${ev.guest_count}` : null,
    ev.vehicle_count != null ? `Vehicles: ${ev.vehicle_count}` : null,
    ev.vendors ? `Vendors:  ${ev.vendors}` : null,
    ev.addons ? `Add-ons:  ${ev.addons}` : null,
    `Status:   ${ev.status}`,
    `Deposit paid:  ${ev.deposit_paid_at || "NOT RECORDED"}`,
    `Final payment: ${ev.final_paid_at || "NOT RECORDED"}`,
    `Details verified: ${ev.details_verified_at || "not confirmed by guest"}`,
    ev.notes ? `\nNotes:\n${ev.notes}` : null,
  ].filter((l) => l !== null);

  await t.sendMail({
    from: MAIL_FROM,
    to: MAIL_REPLY_TO,
    replyTo: (ev.email || "").trim() || MAIL_REPLY_TO,
    subject: `Prep: ${ev.name || "Guest"} — ${dateStr} (3 days out)`,
    text: lines.join("\n"),
  });
  return { configured: true, sent: true };
}

/**
 * Notify staff that a guest submitted CHANGES on the details-verification page
 * (the event has been moved to needs_review).
 * @param {object} ev - the events DB row
 * @param {object} changes - { field: { from, to }, ... }
 */
export async function sendDetailsChangedNotification(ev, changes) {
  const t = getTransporter();
  if (!t) return { configured: false, sent: false };
  const dateStr = prettyDate(ev.event_date);
  const changeLines = Object.entries(changes || {}).map(
    ([field, c]) => `  ${field}: "${c.from ?? ""}" → "${c.to ?? ""}"`
  );
  const lines = [
    `${ev.name || "A guest"} submitted CHANGES on the details-verification page.`,
    `Event ${ev.public_id || `#${ev.id}`} (${dateStr}) has been moved to NEEDS REVIEW.`,
    "",
    "Requested changes:",
    ...(changeLines.length ? changeLines : ["  (see notes)"]),
    "",
    `Guest: ${ev.name || "—"} · ${ev.email || "—"} · ${ev.phone || "—"}`,
    "",
    "Review it on the admin dashboard (/admin), then resolve the review to put the event back on track.",
  ];

  await t.sendMail({
    from: MAIL_FROM,
    to: MAIL_REPLY_TO,
    replyTo: (ev.email || "").trim() || MAIL_REPLY_TO,
    subject: `Needs review: ${ev.name || "Guest"} changed event details — ${dateStr}`,
    text: lines.join("\n"),
  });
  return { configured: true, sent: true };
}

// ---------------------------------------------------------------------------
// Staff-scheduling emails (availability requests, assignment confirmations,
// shortage alerts) — see server/staffing.js + pipelineScheduler.js
// ---------------------------------------------------------------------------

/** One-line human summary of an event for staff-facing emails. */
function eventLineForStaff(ev) {
  const bits = [
    prettyDate(ev.event_date),
    ev.start_time && ev.end_time
      ? `${prettyTime(ev.start_time)} – ${prettyTime(ev.end_time)}`
      : null,
    ev.event_type || null,
    ev.guest_count != null ? `${ev.guest_count} guests` : null,
  ].filter(Boolean);
  return bits.join(" · ");
}

/**
 * Ask a staff member whether they can work an upcoming event, linking their
 * personal portal page where they answer (full / setup only / breakdown only /
 * partial / can't).
 * @param {object} staff - a staff DB row ({ name, email })
 * @param {object} ev - the events DB row
 * @param {string} portalUrl - absolute link to /staff/<portal_token>
 */
export async function sendStaffAvailabilityRequest(staff, ev, portalUrl) {
  const t = getTransporter();
  if (!t) {
    console.warn("[email] SMTP not configured — skipping staff availability request.");
    return { configured: false, sent: false };
  }
  const to = (staff.email || "").trim();
  if (!to) return { configured: true, sent: false, skipped: "no recipient" };
  const name = firstNameOf(staff.name);
  const dateStr = prettyDate(ev.event_date);
  const summary = eventLineForStaff(ev);

  const text = `Hi ${name},

We have an event coming up at JVO Events and we're building the team for the day:

${summary}

Can you work it? Please take 30 seconds to answer on your staff page — full day, setup only, breakdown only, partially available, or can't make it:

${portalUrl}

That link is yours alone (no login needed) and always shows every upcoming event that still needs staff, so feel free to bookmark it.

Thank you!

— JVO Events
Jonesboro, Georgia
jvoevents.com`;

  const inner = `
<p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">Hi ${escapeHtml(name)},</p>
<p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">
  We have an event coming up at <strong>JVO Events</strong> and we're building the
  team for the day:
</p>
${dateCalloutHtml(escapeHtml(summary))}
<p style="font-size:16px;line-height:1.6;margin:0 0 22px 0;">
  Can you work it? Please take 30 seconds to answer on your staff page — full day,
  setup only, breakdown only, partially available, or can't make it.
</p>
<p style="margin:0 0 26px 0;"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#0b0b0b;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;padding:13px 26px;border:1px solid #c9a96a;">Set My Availability</a></p>
<p style="font-size:15px;line-height:1.6;margin:0 0 22px 0;color:#555;">
  That link is yours alone (no login needed) and always shows every upcoming event
  that still needs staff, so feel free to bookmark it.
</p>`;

  await t.sendMail({
    from: MAIL_FROM,
    to,
    replyTo: MAIL_REPLY_TO,
    subject: `Can you work ${dateStr}? — JVO Events staffing`,
    text,
    html: buildShellHtml("Staffing Request", inner),
  });
  return { configured: true, sent: true };
}

/**
 * Confirm to a staff member that they're on the team for an event, with the
 * event summary and their role + expected hours.
 * @param {object} staff - a staff DB row
 * @param {object} ev - the events DB row
 * @param {string} role - captain | staff | setup | cleanup
 * @param {number|null} hours - expected hours for the day
 */
export async function sendStaffAssignmentConfirmation(staff, ev, role, hours) {
  const t = getTransporter();
  if (!t) {
    console.warn("[email] SMTP not configured — skipping assignment confirmation.");
    return { configured: false, sent: false };
  }
  const to = (staff.email || "").trim();
  if (!to) return { configured: true, sent: false, skipped: "no recipient" };
  const name = firstNameOf(staff.name);
  const dateStr = prettyDate(ev.event_date);
  const summary = eventLineForStaff(ev);
  const roleLabel = String(role || "staff").replace(/_/g, " ");
  const hoursLabel = Number.isFinite(hours) ? `${hours}` : null;

  const text = `Hi ${name},

You're confirmed on the team for an upcoming JVO Events event:

${summary}

Your role:  ${roleLabel}${hoursLabel ? `\nExpected hours: ${hoursLabel}` : ""}

Where: 127 Jonesboro Rd, Suite 100, Jonesboro, GA 30236

If anything changes and you can no longer make it, reply to this email or call (678) 519-4723 as soon as you can so we can cover the shift.

Thank you — see you there!

— JVO Events
Jonesboro, Georgia
jvoevents.com`;

  const inner = `
<p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">Hi ${escapeHtml(name)},</p>
<p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">
  You're <strong>confirmed on the team</strong> for an upcoming JVO Events event:
</p>
${dateCalloutHtml(escapeHtml(summary))}
<p style="font-size:16px;line-height:1.6;margin:0 0 8px 0;"><strong>Your role:</strong> ${escapeHtml(roleLabel)}${hoursLabel ? ` &nbsp;·&nbsp; <strong>Expected hours:</strong> ${escapeHtml(hoursLabel)}` : ""}</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 22px 0;">127 Jonesboro Rd, Suite 100, Jonesboro, GA 30236</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 22px 0;color:#555;">
  If anything changes and you can no longer make it, reply to this email or call
  <strong>(678) 519-4723</strong> as soon as you can so we can cover the shift.
</p>
<p style="font-size:16px;line-height:1.6;margin:0 0 4px 0;">Thank you — see you there!</p>`;

  await t.sendMail({
    from: MAIL_FROM,
    to,
    replyTo: MAIL_REPLY_TO,
    subject: `You're confirmed — ${dateStr} at JVO Events (${roleLabel})`,
    text,
    html: buildShellHtml("Shift Confirmed", inner),
  });
  return { configured: true, sent: true };
}

/**
 * STAFFING ALERT to the venue inbox (MAIL_REPLY_TO): an event inside the alert
 * window still has fewer confirmed assignments than it needs.
 * @param {object} ev - the events DB row
 * @param {number} needed - staff_needed
 * @param {number} confirmed - confirmed assignment count
 * @param {number} daysOut - whole days until the event
 */
export async function sendStaffingAlert(ev, needed, confirmed, daysOut) {
  const t = getTransporter();
  if (!t) return { configured: false, sent: false };
  const dateStr = prettyDate(ev.event_date);
  const lines = [
    `STAFFING ALERT — ${ev.public_id || `event #${ev.id}`} is ${daysOut} day${daysOut === 1 ? "" : "s"} out and still short-staffed.`,
    "",
    `Event:     ${ev.name || "—"}${ev.event_type ? ` (${ev.event_type})` : ""}`,
    `Date:      ${dateStr}`,
    ev.start_time || ev.end_time
      ? `Time:      ${ev.start_time || "?"} – ${ev.end_time || "?"}`
      : null,
    ev.guest_count != null ? `Guests:    ${ev.guest_count}` : null,
    `Needed:    ${needed}`,
    `Confirmed: ${confirmed}`,
    "",
    "Staff who haven't answered their availability request can still respond on",
    "their personal portal link (the /staff/<token> page from the request email).",
    "Assign confirmed staff on the admin dashboard (/admin) — once assignments",
    "reach the needed count you can mark the event Ready.",
  ].filter((l) => l !== null);

  await t.sendMail({
    from: MAIL_FROM,
    to: MAIL_REPLY_TO,
    replyTo: MAIL_REPLY_TO,
    subject: `STAFFING ALERT: ${confirmed}/${needed} staffed — ${dateStr} (${daysOut}d out)`,
    text: lines.join("\n"),
  });
  return { configured: true, sent: true };
}
