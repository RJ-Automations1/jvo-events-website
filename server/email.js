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
