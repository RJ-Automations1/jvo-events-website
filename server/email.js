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

// Where a guest pays the remaining balance. Payments run through Cheddar Up
// (the same processor as the $150 security deposit on the Book page) — set
// this to the Cheddar Up collection for event balances. While it's empty the
// payment emails simply omit the button and ask the guest to reply, which is
// exactly how they read before this was added.
const CHEDDARUP_BALANCE_URL = process.env.CHEDDARUP_BALANCE_URL || "";

/** Where the guest pays the $150 security deposit (the Book page sends them here). */
const DEPOSIT_URL =
  process.env.CHEDDARUP_DEPOSIT_URL ||
  "https://my.cheddarup.com/c/jvo-event-security-deposit/items";

const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || "465");
const MAIL_FROM =
  process.env.MAIL_FROM || (SMTP_USER ? `JVO Events <${SMTP_USER}>` : "");
const MAIL_REPLY_TO =
  process.env.MAIL_REPLY_TO || "eventsjvo@gmail.com";

/**
 * Who at JVO gets told when something happens — new booking, new tour, new
 * inquiry, guest changed their details, staffing short. A comma-separated list
 * so more than one person is in the loop; falls back to the reply-to inbox
 * alone, which is how this behaved before.
 *
 * This is the venue-facing "to" ONLY. Guest emails still reply to
 * MAIL_REPLY_TO — never add staff addresses to a guest's email.
 */
const NOTIFY_TO = (process.env.NOTIFY_TO || MAIL_REPLY_TO)
  .split(",")
  .map((a) => a.trim())
  .filter(Boolean)
  .join(", ");
/**
 * Email logo.
 * -----------
 * The logo ships with the app, so we attach it inline (a "cid:" reference)
 * rather than hotlinking it. That matters for two reasons:
 *   1. jvoevents.com used to be a domain forwarder that redirected "/" but
 *      404'd deep paths. It's now a verified Render custom domain and deep
 *      paths serve (checked 2026-09-22: /pay/<token> and /book both 200), so
 *      this reason no longer holds — but reason 2 still does.
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

/**
 * Registration-received confirmation.
 *
 * This goes out the moment a registration is read off the form, which is BEFORE
 * any money has arrived — so it must not claim the deposit was received. The
 * previous version opened with "We've received your $150 security deposit",
 * which was false for every guest who hadn't paid yet and made the deposit
 * request that follows read as a contradiction.
 *
 * @param {object} b - { name, dateStr, timeStr?, packageLabel?, guestCount?,
 *   addOnLines?: string[], totalStr?, depositUrl?, payUrl? }
 */
function buildText(b) {
  const items = [
    b.packageLabel ? `Package:  ${b.packageLabel}` : "",
    b.timeStr ? `Time:     ${b.timeStr}` : "",
    b.guestCount ? `Guests:   ${b.guestCount}` : "",
    ...(b.addOnLines || []).map((l) => `Add-on:   ${l}`),
    b.totalStr ? `Total:    ${b.totalStr}` : "",
  ].filter(Boolean);

  // Sent after the Cheddar Up deposit lands, so normally the deposit is DONE.
  // depositPaid=false keeps the older ask-for-it wording for a hand-sent email.
  const depositStep = b.depositPaid
    ? `1. SECURITY DEPOSIT — $150  ✓ RECEIVED
   Thank you — your $150 security deposit has been received and your date is
   reserved. It's a refundable damage deposit, separate from your balance.`
    : `1. SECURITY DEPOSIT — $150
   Your $150 security deposit reserves the date.${b.depositUrl ? `\n   Pay it here: ${b.depositUrl}` : ""}
   This is a refundable damage deposit and is separate from your balance.`;

  return `Hi ${b.name},

Thank you — ${
    b.depositPaid
      ? "we've received your deposit and your date is reserved."
      : "we've received your event registration and your details are confirmed."
  }

YOUR EVENT
Date:     ${b.dateStr}
${items.join("\n")}

${b.depositPaid ? "Your date is reserved." : "Your date is being held for you."} Here's what happens next.

${depositStep}

2. YOUR BALANCE
   ${b.totalStr ? `Your balance is ${b.totalStr}.` : "We'll send your invoice separately."} You can pay it all at once, or in as many
   part-payments as you like — pay whatever you can, whenever you like, and
   we'll always show you what's left.${b.payUrl ? `\n   Pay your balance here: ${b.payUrl}` : ""}

3. REMINDERS
   We'll send you a reminder 20 days before your event.

4. FINAL DEADLINE — 14 DAYS BEFORE YOUR EVENT
   Your full balance must be paid no later than 14 days before your event.
   If it isn't, your booking is voided and your $150 security deposit is
   not refunded. (If you booked within 14 days of your event, your full
   balance is due up front.)

A FEW HOUSE RULES
- No confetti, or balloons that may pop.
- Outside items and vendors (tables, chairs, bounce houses, DJs, food trucks)
  need prior written approval.
- Return the space as you found it. No animals unless pre-approved, and no
  selling alcohol without a city permit.

If you have any questions, just reply to this email or reach us at ${MAIL_REPLY_TO}.

We can't wait to host your event!

— JVO Events
Jonesboro, Georgia
jvoevents.com`;
}

/**
 * Registration-received confirmation, HTML.
 *
 * Built on buildShellHtml() like the rest of the newer templates rather than
 * carrying its own copy of the header/footer table markup.
 *
 * Mirrors buildText() exactly: registration received, date held, then the four
 * steps (deposit → balance → 20-day reminder → 14-day void deadline). It must
 * NOT claim the deposit has been paid — this goes out before any money arrives.
 */
function buildHtml(b) {
  const rows = [
    ["Date", b.dateStr],
    b.timeStr ? ["Time", b.timeStr] : null,
    b.packageLabel ? ["Package", b.packageLabel] : null,
    b.guestCount ? ["Guests", String(b.guestCount)] : null,
    ...(b.addOnLines || []).map((l) => ["Add-on", l]),
    b.totalStr ? ["Total", b.totalStr] : null,
  ].filter(Boolean);

  const button = (href, label, dark = true) =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;background:${
      dark ? "#0b0b0b" : "#ffffff"
    };color:${
      dark ? "#ffffff" : "#0b0b0b"
    };text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;padding:12px 24px;border:1px solid #c9a96a;">${escapeHtml(
      label
    )}</a>`;

  const step = (n, title, body) => `
<tr>
  <td style="padding:0 0 18px 0;vertical-align:top;width:34px;">
    <div style="width:26px;height:26px;border:1px solid #c9a96a;color:#9a7b35;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;text-align:center;line-height:26px;">${n}</div>
  </td>
  <td style="padding:0 0 18px 0;vertical-align:top;">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#9a7b35;font-weight:bold;margin-bottom:6px;">${title}</div>
    <div style="font-size:15px;line-height:1.6;color:#2b2b2b;">${body}</div>
  </td>
</tr>`;

  const inner = `
<p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">Hi ${escapeHtml(b.name)},</p>
<p style="font-size:16px;line-height:1.6;margin:0 0 22px 0;">${
  b.depositPaid
    ? "Thank you — we've received your deposit and your date is <strong>reserved</strong>."
    : "Thank you — we've received your event registration and your details are <strong>confirmed</strong>. Your date is being held for you."
}
</p>

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e7d9bf;background:#fbf7ee;margin:0 0 26px 0;">
  <tr><td style="padding:18px 20px;">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#9a7b35;font-weight:bold;margin-bottom:10px;">Your Event</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:15px;color:#2b2b2b;">
      ${rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:3px 12px 3px 0;color:#777;white-space:nowrap;">${escapeHtml(
              k
            )}</td><td style="padding:3px 0;">${escapeHtml(v)}</td></tr>`
        )
        .join("")}
    </table>
  </td></tr>
</table>

<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#9a7b35;font-weight:bold;margin:0 0 14px 0;">What Happens Next</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
${step(
  "1",
  b.depositPaid ? "Security deposit — $150 &nbsp;✓ Received" : "Security deposit — $150",
  b.depositPaid
    ? "Thank you — your $150 security deposit has been received and your date is reserved. It's a refundable damage deposit, separate from your balance."
    : `Your $150 security deposit reserves the date. It's a refundable damage deposit, separate from your balance.${
        b.depositUrl ? `<div style="margin-top:10px;">${button(b.depositUrl, "Pay My $150 Deposit")}</div>` : ""
      }`
)}
${step(
  "2",
  "Your balance",
  `${
    b.totalStr
      ? `Your balance is <strong>${escapeHtml(b.totalStr)}</strong>.`
      : "We'll send your invoice separately."
  } Pay it all at once or in as many part-payments as you like — whatever you can, whenever you like. We'll always show you what's left.${
    b.payUrl ? `<div style="margin-top:10px;">${button(b.payUrl, "Pay My Balance", false)}</div>` : ""
  }`
)}
${step("3", "Reminders", "We'll send you a reminder 20 days before your event.")}
${step(
  "4",
  "Final deadline — 14 days before",
  `Your full balance must be paid <strong>no later than 14 days before your event</strong>. If it isn't, your booking is <strong>voided</strong> and your $150 security deposit is not refunded. If you booked within 14 days of your event, your full balance is due up front.`
)}
</table>

<div style="border-top:1px solid #e7e2d8;margin:8px 0 20px 0;"></div>
<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#9a7b35;font-weight:bold;margin:0 0 10px 0;">A Few House Rules</div>
<ul style="font-size:15px;line-height:1.7;color:#555;margin:0 0 22px 0;padding-left:20px;">
  <li>No confetti, or balloons that may pop.</li>
  <li>Outside items and vendors (tables, chairs, bounce houses, DJs, food trucks) need prior written approval.</li>
  <li>Return the space as you found it. No animals unless pre-approved, and no selling alcohol without a city permit.</li>
</ul>

<p style="font-size:15px;line-height:1.6;margin:0 0 22px 0;color:#555;">
  Questions? Just reply to this email or reach us at
  <a href="mailto:${escapeHtml(MAIL_REPLY_TO)}" style="color:#9a7b35;">${escapeHtml(MAIL_REPLY_TO)}</a>.
</p>
<p style="font-size:16px;line-height:1.6;margin:0;">We can't wait to host your event!</p>`;

  return buildShellHtml("Registration Received", inner);
}

function buildReminderText(name, dateStr, balanceStr, invoiceUrl, daysOut) {
  // The chase runs at 28 / 21 / 17 days, so the old hardcoded "about 30 days"
  // would have been wrong on every send. Fall back to vaguer wording rather
  // than a made-up number when the caller doesn't say.
  const away = Number.isFinite(daysOut) ? `${daysOut} days away` : "coming up";
  return `Hi ${name},

A friendly reminder from JVO Events — your event on ${dateStr} is ${away}, and your full balance is still due${balanceStr ? ` (${balanceStr})` : ""}.

Please complete your payment to keep your reservation.${invoiceUrl ? `\n\nPay your balance here: ${invoiceUrl}` : ""}

IMPORTANT — 14-DAY CUTOFF
Full payment is required no later than 14 days before your event. If your full payment has not been received by then, your booking will be canceled and your $150 security deposit will not be refunded.

Questions? Just reply to this email or reach us at ${MAIL_REPLY_TO}.

— JVO Events
Jonesboro, Georgia
jvoevents.com`;
}

function buildReminderHtml(name, dateStr, balanceStr, invoiceUrl, daysOut) {
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
                  ${safeDate}${Number.isFinite(daysOut) ? ` &nbsp;·&nbsp; ${daysOut} days away` : ""}
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
    text: buildReminderText(firstName, dateStr, balanceStr, booking.invoiceUrl, booking.daysOut),
    html: buildReminderHtml(firstName, dateStr, balanceStr, booking.invoiceUrl, booking.daysOut),
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

  const money = (n) =>
    "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 });

  const details = {
    name: firstName,
    dateStr,
    timeStr:
      booking.startTime && booking.endTime
        ? `${prettyTime(booking.startTime)} – ${prettyTime(booking.endTime)}`
        : "",
    packageLabel: booking.package || "",
    guestCount: booking.guestCount || "",
    // "Additional Chairs — 30 × $2.00 = $60.00" per add-on the guest chose.
    addOnLines: (booking.addOns || []).map(
      (a) => `${a.label} — ${a.quantity} × ${money(a.unitPrice)} = ${money(a.total)}`
    ),
    totalStr: Number.isFinite(booking.totalDue) ? money(booking.totalDue) : "",
    depositUrl: DEPOSIT_URL,
    payUrl: booking.payUrl || "",
    // True when this email was triggered BY the deposit — the normal path now.
    depositPaid: Boolean(booking.depositPaid),
  };

  await t.sendMail({
    from: MAIL_FROM,
    to,
    replyTo: MAIL_REPLY_TO,
    subject: `We've received your registration — ${dateStr} at JVO Events`,
    text: buildText(details),
    html: buildHtml(details),
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
    to: NOTIFY_TO,
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
    to: NOTIFY_TO,
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
    to: NOTIFY_TO,
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
 * @param {object} ev - { name, email, event_date, invoiceUrl? } — invoiceUrl is
 *   the Stripe hosted invoice for this booking (see server/stripeInvoices.js);
 *   when absent the email falls back to CHEDDARUP_BALANCE_URL, and when neither
 *   is set it simply asks the guest to reply for their balance.
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
  // A Stripe invoice raised for this booking is the preferred way to pay — it
  // knows the actual amount. CHEDDARUP_BALANCE_URL is the generic fallback for
  // bookings that never got an invoice.
  const payUrl = ev.invoiceUrl || CHEDDARUP_BALANCE_URL || "";
  // Only ever state a figure Stripe actually gave us. When the balance is
  // unknown the email keeps its original wording and invites a reply, rather
  // than guessing at what someone owes.
  const balanceStr =
    typeof ev.balanceDue === "number"
      ? `$${ev.balanceDue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
      : "";

  const text = `Hi ${name},

Your event at JVO Events on ${dateStr} is 14 days away — which means your full balance is now due.
${balanceStr ? `\nBalance remaining: ${balanceStr}\n` : ""}
Per your booking agreement, full payment is required no later than 14 days before your event. If the full balance is not received, your booking will be canceled and your $150 security deposit will not be refunded.
${payUrl ? `\nPay your balance here: ${payUrl}\n` : ""}
If you've already sent your payment, thank you — you can disregard this notice.${
    balanceStr ? "" : " If you're not sure of your remaining balance, just reply to this email and we'll confirm it right away."
  }

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
${
  balanceStr
    ? `<div style="border:1px solid #c9a96a;background:#ffffff;padding:18px 20px;margin:0 0 22px 0;text-align:center;">
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#9a7b35;font-weight:bold;margin-bottom:6px;">Balance Remaining</div>
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:30px;color:#0b0b0b;font-weight:bold;">${escapeHtml(balanceStr)}</div>
</div>`
    : ""
}
<div style="border:1px solid #e7d9bf;background:#fbf7ee;padding:18px 20px;margin:0 0 22px 0;">
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#9a7b35;font-weight:bold;margin-bottom:8px;">Final Payment Due</div>
  <p style="font-size:15px;line-height:1.6;margin:0;color:#2b2b2b;">
    Per your booking agreement, full payment is required <strong>no later than 14 days
    before your event</strong>. If the full balance is not received, your booking will be
    canceled and your <strong>$150 security deposit will not be refunded</strong>.
  </p>
</div>
${
  payUrl
    ? `<p style="margin:0 0 26px 0;"><a href="${escapeHtml(payUrl)}" style="display:inline-block;background:#0b0b0b;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;padding:13px 26px;border:1px solid #c9a96a;">Pay Your Balance</a></p>`
    : ""
}
<p style="font-size:15px;line-height:1.6;margin:0 0 22px 0;color:#555;">
  If you've already sent your payment, thank you — you can disregard this notice.${
    balanceStr
      ? ""
      : "\n  Not sure of your remaining balance? Just reply and we'll confirm it right away."
  }
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
 * PAST DUE notice — the balance missed the 14-day cutoff and the reservation is
 * now at risk of being cancelled.
 *
 * This is the sharpest email JVO sends a guest, so it is deliberately specific:
 * it names the date the money was due, the date by which it must now arrive,
 * and exactly what is lost if it doesn't. Vague warnings ("soon", "shortly") are
 * what lead to an argument at the door on the event day.
 *
 * @param {object} ev - { name, email, event_date, cutoffDate, graceDays,
 *   balanceDue?, invoiceUrl? }
 */
export async function sendPastDueNotice(ev) {
  const t = getTransporter();
  if (!t) {
    console.warn("[email] SMTP not configured — skipping past-due notice.");
    return { configured: false, sent: false };
  }
  const to = (ev.email || "").trim();
  if (!to) return { configured: true, sent: false, skipped: "no recipient" };

  const name = firstNameOf(ev.name);
  const dateStr = prettyDate(ev.event_date);
  const cutoffStr = ev.cutoffDate ? prettyDate(ev.cutoffDate) : "";
  const payUrl = ev.invoiceUrl || CHEDDARUP_BALANCE_URL || "";
  const balanceStr =
    typeof ev.balanceDue === "number"
      ? `$${ev.balanceDue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
      : "";

  // The date the guest must pay by to keep the booking. Never quote a deadline
  // on or after the event itself — that would be meaningless.
  const graceDays = Number.isFinite(ev.graceDays) ? ev.graceDays : 3;
  const deadline = (() => {
    const d = new Date();
    d.setDate(d.getDate() + graceDays);
    const iso = d.toISOString().slice(0, 10);
    return iso >= ev.event_date ? ev.event_date : iso;
  })();
  const deadlineStr = prettyDate(deadline);

  // Someone who booked inside the 14-day window never had a cutoff to miss.
  const owedUpFront = ev.bookedAfterCutoff === true;
  const owedLine = owedUpFront
    ? `Because your event is within 14 days, your full balance is required up front, and we have not received it.`
    : cutoffStr
      ? `Your full balance was due on ${cutoffStr} — 14 days before your event — and we have not received it.`
      : "";

  const text = `Hi ${name},

Your balance for your event at JVO Events on ${dateStr} is ${owedUpFront ? "outstanding" : "past due"}.
${balanceStr ? `\nAmount still outstanding: ${balanceStr}\n` : ""}${owedLine ? `\n${owedLine}\n` : ""}
To keep your reservation, we must receive payment in full by ${deadlineStr}. If your balance is not paid by then, your event will be cancelled and your $150 security deposit will be forfeited.
${payUrl ? `\nPay your balance here: ${payUrl}\n` : ""}
If you've already sent payment, please reply and let us know so we can clear this up right away — we don't want to cancel your event.

— JVO Events
Jonesboro, Georgia
jvoevents.com`;

  const inner = `
<p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">Hi ${escapeHtml(name)},</p>
<p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">
  Your balance for your event at <strong>JVO Events</strong> is <strong>past due</strong>.
</p>
${dateCalloutHtml(escapeHtml(dateStr))}
${
  balanceStr
    ? `<div style="border:1px solid #b4232a;background:#ffffff;padding:18px 20px;margin:0 0 22px 0;text-align:center;">
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#b4232a;font-weight:bold;margin-bottom:6px;">Amount Outstanding</div>
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:30px;color:#0b0b0b;font-weight:bold;">${escapeHtml(balanceStr)}</div>
</div>`
    : ""
}
<div style="border:2px solid #b4232a;background:#fdf3f3;padding:18px 20px;margin:0 0 22px 0;">
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#b4232a;font-weight:bold;margin-bottom:8px;">Your Reservation Is At Risk</div>
  <p style="font-size:15px;line-height:1.6;margin:0 0 10px 0;color:#2b2b2b;">${
    owedUpFront
      ? "Because your event is within 14 days, your full balance is required <strong>up front</strong>, and we have not received it."
      : cutoffStr
        ? `Your full balance was due on <strong>${escapeHtml(cutoffStr)}</strong> — 14 days before your event — and we have not received it.`
        : "Your full balance has not been received."
  }</p>
  <p style="font-size:15px;line-height:1.6;margin:0;color:#2b2b2b;">
    To keep your reservation we must receive payment in full by
    <strong>${escapeHtml(deadlineStr)}</strong>. If your balance is not paid by then,
    your event will be <strong>cancelled</strong> and your
    <strong>$150 security deposit will be forfeited</strong>.
  </p>
</div>
${
  payUrl
    ? `<p style="margin:0 0 26px 0;"><a href="${escapeHtml(payUrl)}" style="display:inline-block;background:#b4232a;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;padding:13px 26px;border:1px solid #8d1a20;">Pay My Balance Now</a></p>`
    : ""
}
<p style="font-size:15px;line-height:1.6;margin:0 0 22px 0;color:#555;">
  If you've already sent payment, please reply and let us know so we can clear
  this up right away — we don't want to cancel your event.
</p>`;

  await t.sendMail({
    from: MAIL_FROM,
    to,
    replyTo: MAIL_REPLY_TO,
    subject: owedUpFront
      ? `Payment required — your JVO Events booking on ${dateStr}`
      : `PAST DUE — your JVO Events booking on ${dateStr} is at risk`,
    text,
    html: buildShellHtml("Past Due", inner),
  });
  return { configured: true, sent: true };
}

/**
 * Booking VOIDED for non-payment — the balance never arrived and the date has
 * been released.
 *
 * The hardest email JVO sends, so it states plainly what happened, what it
 * cost, and leaves a door open: a guest who pays attention to this one is
 * usually a guest who still wants the date, and the date may still be free.
 *
 * @param {object} ev - { name, email, event_date, balanceDue?, cutoffDate? }
 */
export async function sendBookingVoided(ev) {
  const t = getTransporter();
  if (!t) {
    console.warn("[email] SMTP not configured — skipping void notice.");
    return { configured: false, sent: false };
  }
  const to = (ev.email || "").trim();
  if (!to) return { configured: true, sent: false, skipped: "no recipient" };

  const name = firstNameOf(ev.name);
  const dateStr = prettyDate(ev.event_date);
  const cutoffStr = ev.cutoffDate ? prettyDate(ev.cutoffDate) : "";

  const text = `Hi ${name},

We're sorry to say your booking with JVO Events for ${dateStr} has been voided.

Your full balance was required no later than 14 days before your event${cutoffStr ? ` (${cutoffStr})` : ""}, and we did not receive it. As set out in your booking agreement, your reservation has been cancelled and your $150 security deposit has not been refunded.

Your date has been released and is now available to other guests.

If you believe this is a mistake, or you'd still like to hold your event with us, please reply to this email or call 678-519-4723 as soon as you can — if your date is still open we will do everything we can to help.

— JVO Events
Jonesboro, Georgia
jvoevents.com`;

  const inner = `
<p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">Hi ${escapeHtml(name)},</p>
<p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">
  We're sorry to say your booking with <strong>JVO Events</strong> has been
  <strong>voided</strong>.
</p>
${dateCalloutHtml(escapeHtml(dateStr))}
<div style="border:2px solid #b4232a;background:#fdf3f3;padding:18px 20px;margin:0 0 22px 0;">
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#b4232a;font-weight:bold;margin-bottom:8px;">Booking Cancelled</div>
  <p style="font-size:15px;line-height:1.6;margin:0 0 10px 0;color:#2b2b2b;">
    Your full balance was required no later than <strong>14 days before your event</strong>${
      cutoffStr ? ` (${escapeHtml(cutoffStr)})` : ""
    }, and we did not receive it. As set out in your booking agreement, your
    reservation has been cancelled and your <strong>$150 security deposit has not
    been refunded</strong>.
  </p>
  <p style="font-size:15px;line-height:1.6;margin:0;color:#2b2b2b;">
    Your date has been released and is now available to other guests.
  </p>
</div>
<p style="font-size:15px;line-height:1.6;margin:0 0 22px 0;color:#555;">
  If you believe this is a mistake, or you'd still like to hold your event with
  us, please reply to this email or call <strong>678-519-4723</strong> as soon as
  you can — if your date is still open we will do everything we can to help.
</p>`;

  await t.sendMail({
    from: MAIL_FROM,
    to,
    replyTo: MAIL_REPLY_TO,
    subject: `Your JVO Events booking on ${dateStr} has been voided`,
    text,
    html: buildShellHtml("Booking Voided", inner),
  });
  return { configured: true, sent: true };
}

/**
 * Copy JVO in on an invoice, or warn them one has gone past due.
 *
 * Stripe has no "CC" on invoice emails — an invoice goes to the customer and
 * nobody else — so instead of trying to bend that, JVO gets its own message
 * carrying the same figures and a link to the invoice in Stripe.
 *
 * @param {object} ev - { name, email, event_date, publicId?, invoiceNumber?,
 *   invoiceUrl?, dashboardUrl?, amountDue?, amountPaid?, dueDate? }
 * @param {"raised"|"past_due"|"voided"} kind
 */
export async function sendInvoiceNoticeToVenue(ev, kind = "raised") {
  const t = getTransporter();
  if (!t) {
    console.warn("[email] SMTP not configured — skipping venue invoice notice.");
    return { configured: false, sent: false };
  }
  const dateStr = prettyDate(ev.event_date || ev.eventDate);
  const money = (n) =>
    typeof n === "number"
      ? "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2 })
      : "—";

  const headline = {
    raised: "Invoice sent to guest",
    past_due: "INVOICE PAST DUE",
    voided: "Booking voided — invoice cancelled",
  }[kind];

  const subject = {
    raised: `Invoice ${ev.invoiceNumber || ""} sent — ${ev.name} (${dateStr})`.replace(/\s+/g, " "),
    past_due: `PAST DUE — ${ev.name}'s invoice for ${dateStr} is unpaid`,
    voided: `VOIDED — ${ev.name}'s booking on ${dateStr}`,
  }[kind];

  const facts = [
    ["Guest", `${ev.name || "—"} <${ev.email || "—"}>`],
    ["Event", dateStr],
    ev.publicId ? ["Booking", ev.publicId] : null,
    ev.invoiceNumber ? ["Invoice", ev.invoiceNumber] : null,
    ["Amount due", money(ev.amountDue)],
    typeof ev.amountPaid === "number" ? ["Paid so far", money(ev.amountPaid)] : null,
    ev.dueDate ? ["Due date", prettyDate(ev.dueDate)] : null,
  ].filter(Boolean);

  const text = `${headline}

${facts.map(([k, v]) => `${(k + ":").padEnd(13)}${v}`).join("\n")}
${ev.invoiceUrl ? `\nInvoice: ${ev.invoiceUrl}` : ""}${
    ev.dashboardUrl ? `\nIn Stripe: ${ev.dashboardUrl}` : ""
  }

— JVO Events automation`;

  const accent = kind === "past_due" ? "#b4232a" : kind === "voided" ? "#777" : "#9a7b35";
  const inner = `
<div style="border:2px solid ${accent};background:${kind === "past_due" ? "#fdf3f3" : "#fbf7ee"};padding:16px 20px;margin:0 0 22px 0;">
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:${accent};font-weight:bold;">${escapeHtml(headline)}</div>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:15px;color:#2b2b2b;margin:0 0 22px 0;">
  ${facts
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 14px 4px 0;color:#777;white-space:nowrap;">${escapeHtml(k)}</td><td style="padding:4px 0;">${escapeHtml(String(v))}</td></tr>`
    )
    .join("")}
</table>
${
  ev.invoiceUrl
    ? `<p style="margin:0 0 12px 0;"><a href="${escapeHtml(ev.invoiceUrl)}" style="display:inline-block;background:#0b0b0b;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;padding:12px 24px;border:1px solid #c9a96a;">View the invoice</a></p>`
    : ""
}
${
  ev.dashboardUrl
    ? `<p style="font-size:14px;margin:0;"><a href="${escapeHtml(ev.dashboardUrl)}" style="color:#9a7b35;">Open in Stripe</a></p>`
    : ""
}`;

  await t.sendMail({
    from: MAIL_FROM,
    to: NOTIFY_TO,
    replyTo: (ev.email || "").trim() || MAIL_REPLY_TO,
    subject,
    text,
    html: buildShellHtml(headline, inner),
  });
  return { configured: true, sent: true };
}

/**
 * Tell JVO about a Cheddar Up event the automation deliberately won't act on.
 *
 *   "unmatched" — a deposit arrived but no registration fits it (the guest used
 *                 a different name AND email, or typed the wrong event date).
 *                 Money is in; the booking isn't live. Someone has to connect
 *                 the two by hand.
 *   "refund"    — Cheddar Up's refund email carries a name and nothing else, so
 *                 matching it to a booking would be a guess. The date is NOT
 *                 released automatically.
 *
 * @param {object} a - { kind, name, email?, eventDate?, amount?, date? }
 */
export async function sendIntakeAlertToVenue(a) {
  const t = getTransporter();
  if (!t) return { configured: false, sent: false };
  const money = (n) => (typeof n === "number" ? `$${n.toFixed(2)}` : "—");

  const isRefund = a.kind === "refund";
  const headline = isRefund
    ? "Deposit refunded — check the booking"
    : "Deposit received, but no matching registration";
  const subject = isRefund
    ? `REFUND — ${a.name}'s deposit (${money(a.amount)}) was refunded`
    : `ACTION NEEDED — ${a.name} paid a deposit we can't match`;

  const explain = isRefund
    ? "Cheddar Up's refund notice only carries the payer's name, so the automation can't tell which booking it belongs to and has NOT released any date. If this refund cancels a booking, release the date on the calendar by hand."
    : "The deposit has been paid, but no registration on the form matches it by email and event date — so the booking is NOT live: no calendar hold, no email to the guest, no invoice. Usually the guest paid under a different name or email, or typed the wrong event date on Cheddar Up. Find their registration and process it by hand.";

  const facts = [
    ["Name", a.name || "—"],
    a.email ? ["Email", a.email] : null,
    a.eventDate ? ["Event date (Cheddar Up)", prettyDate(a.eventDate)] : null,
    ["Amount", money(a.amount)],
    a.date ? ["Received", prettyDate(a.date)] : null,
  ].filter(Boolean);

  const text = `${headline}

${facts.map(([k, v]) => `${(k + ":").padEnd(26)}${v}`).join("\n")}

${explain}

— JVO Events automation`;

  const inner = `
<div style="border:2px solid #b4232a;background:#fdf3f3;padding:16px 20px;margin:0 0 22px 0;">
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#b4232a;font-weight:bold;">${escapeHtml(headline)}</div>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:15px;color:#2b2b2b;margin:0 0 22px 0;">
  ${facts
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 14px 4px 0;color:#777;white-space:nowrap;">${escapeHtml(k)}</td><td style="padding:4px 0;">${escapeHtml(String(v))}</td></tr>`
    )
    .join("")}
</table>
<p style="font-size:15px;line-height:1.6;margin:0;color:#2b2b2b;">${escapeHtml(explain)}</p>`;

  await t.sendMail({
    from: MAIL_FROM,
    to: NOTIFY_TO,
    replyTo: (a.email || "").trim() || MAIL_REPLY_TO,
    subject,
    text,
    html: buildShellHtml(headline, inner),
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
    to: NOTIFY_TO,
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
    to: NOTIFY_TO,
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
    to: NOTIFY_TO,
    replyTo: MAIL_REPLY_TO,
    subject: `STAFFING ALERT: ${confirmed}/${needed} staffed — ${dateStr} (${daysOut}d out)`,
    text: lines.join("\n"),
  });
  return { configured: true, sent: true };
}
