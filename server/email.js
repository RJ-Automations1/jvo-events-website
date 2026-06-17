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
 *   MAIL_REPLY_TO   optional reply-to, defaults to jonesborovirtualoffice@gmail.com
 *
 * For Gmail you must turn on 2-Step Verification and create an App Password
 * (Google Account → Security → App passwords), then use that 16-char value as
 * SMTP_PASS.
 */

import nodemailer from "nodemailer";

const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || "465");
const MAIL_FROM =
  process.env.MAIL_FROM || (SMTP_USER ? `JVO Events <${SMTP_USER}>` : "");
const MAIL_REPLY_TO =
  process.env.MAIL_REPLY_TO || "jonesborovirtualoffice@gmail.com";

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
