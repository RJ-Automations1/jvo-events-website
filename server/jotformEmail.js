/**
 * Read JotForm registrations out of the JVO inbox.
 * ------------------------------------------------
 * The JotForm → /api/jotform-hook webhook has never fired, so registrations
 * only ever reach two places: the "Event Registration Master List" sheet, and
 * a submission email to jonesborovirtualoffice@gmail.com. The sheet is the
 * lossier of the two — it has NO "Add on Options" column, so chairs, tables and
 * insurance a guest paid for are invisible there. The email has everything.
 *
 * So we read the email. Same Gmail app password already used to SEND as JVO
 * (SMTP_USER / SMTP_PASS) — Gmail accepts it for IMAP too, no new credential.
 *
 * ── Add-ons ───────────────────────────────────────────────────────────────
 * JotForm renders the add-on field as one line per selection:
 *
 *   Add on Options:
 *   Additional Chairs (Amount: 2.00 USD, Quantity: 25) Total: $50.00
 *
 * and OMITS the field entirely when nothing was chosen — so "no Add on Options
 * line" means no add-ons, never a parse failure.
 *
 * We keep the price the FORM showed, because that's what the guest agreed to
 * pay. It's cross-checked against EVENT_ADDONS and any disagreement is
 * surfaced rather than silently resolved — a mismatch means the form and the
 * code have drifted, and a human needs to decide which is right.
 */

import { EVENT_ADDONS } from "../shared/eventSlots.js";

const HOST = process.env.IMAP_HOST || "imap.gmail.com";
const PORT = Number(process.env.IMAP_PORT || "993");
/** The form whose submissions we care about. */
const SUBJECT_MATCH = process.env.JOTFORM_EMAIL_SUBJECT || "Event Space Registration Form";

/**
 * Every submission also generates an e-signature receipt ("Your JVO Event Space
 * Registration Form was signed successfully!") that matches the same subject
 * search but carries none of the answers. Dropping it here keeps the caller
 * from seeing a phantom half-empty booking beside every real one.
 */
const NOT_A_SUBMISSION = /signed successfully|thank you for/i;

export function inboxConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** The known field labels, in the order JotForm renders them. */
const LABELS = [
  "Full Name",
  "Address",
  "Phone Number",
  "E-mail",
  "Type Of Event:",
  "Requested Event Date",
  "Requested Start Time",
  "Have you completed an in-person tour of the event space?",
  "Expected Number of Guest",
  "Expected Number of Vehicles",
  "Will you have outside vendors at your event?",
  "Vendor Phone",
  "Choose your Rental Package: ( 1/2 Day, or Full Day)",
  "Add on Options:",
  "How did you learn from us?",
  "Signature",
  "Name",
  "Date",
  "Upload a Copy of your Drivers License",
  "Terms and Conditions",
];

/** Turn the HTML submission email into the flat label/value lines it renders as. */
export function emailToLines(rawSource) {
  let body = String(rawSource);
  const start = body.search(/JVO Event Space Registration Form|<table/i);
  if (start > 0) body = body.slice(start);
  return body
    .replace(/=\r?\n/g, "") // quoted-printable soft breaks
    .replace(/=3D/g, "=")
    .replace(/=C2=A0|&nbsp;/g, " ")
    .replace(/<\/(td|tr|p|div|h\d)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** "09-12-2026" (MM-DD-YYYY) → "2026-09-12". */
function toYmd(s) {
  const m = String(s || "").match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[1]}-${m[2]}`;
  const iso = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : "";
}

/** "5:00 PM" → "17:00". */
function to24h(s) {
  const m = String(s || "").match(/^(\d{1,2}):(\d{2})\s*([AaPp])[Mm]?$/);
  if (!m) return /^\d{2}:\d{2}$/.test(String(s || "").trim()) ? String(s).trim() : "";
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "p") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/**
 * Pull every add-on line out of the body.
 * @returns {Array<{label:string,unitPrice:number,quantity:number,total:number,
 *   knownId:string|null,priceMismatch:boolean}>}
 */
export function parseAddOns(text) {
  const re =
    /([A-Za-z][A-Za-z0-9 &'/-]*?)\s*\(\s*Amount:\s*([\d.]+)\s*USD\s*,\s*Quantity:\s*(\d+)\s*\)\s*Total:\s*\$?\s*([\d,]+(?:\.\d{2})?)/g;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const label = m[1].trim();
    const unitPrice = Number(m[2]);
    const quantity = Number(m[3]);
    const total = Number(m[4].replace(/,/g, ""));
    const known = EVENT_ADDONS.find(
      (a) => a.label.toLowerCase() === label.toLowerCase()
    );
    out.push({
      label,
      unitPrice,
      quantity,
      total,
      knownId: known ? known.id : null,
      // The form is what the guest agreed to; flag drift instead of overriding.
      priceMismatch: Boolean(known && known.price !== unitPrice),
    });
  }
  return out;
}

/**
 * Parse one submission email into a booking.
 * @param {string} rawSource - the raw RFC822 message
 * @returns {object} booking-shaped object; `warnings` lists anything suspect.
 */
export function parseSubmissionEmail(rawSource) {
  const lines = emailToLines(rawSource);
  const isLabel = (l) => LABELS.includes(l);

  /** Values that follow a label, up to the next label. */
  const valuesFor = (label) => {
    const i = lines.indexOf(label);
    if (i < 0) return [];
    const out = [];
    for (let j = i + 1; j < lines.length && !isLabel(lines[j]); j++) out.push(lines[j]);
    return out;
  };
  const first = (label) => valuesFor(label)[0] || "";

  const addressLines = valuesFor("Address");
  const pick = (prefix) => {
    const hit = addressLines.find((l) => l.toLowerCase().startsWith(prefix.toLowerCase()));
    return hit ? hit.slice(hit.indexOf(":") + 1).trim() : "";
  };

  const addOns = parseAddOns(valuesFor("Add on Options:").join("\n"));

  // JotForm names uploaded/signature attachments <submissionId>_something.
  const idMatch = String(rawSource).match(/(\d{16,})_(?:signature|[a-z]+)/i);

  const booking = {
    name: first("Full Name"),
    email: first("E-mail"),
    phone: first("Phone Number"),
    address: [pick("Street Address"), pick("City"), pick("State"), pick("Postal")]
      .filter(Boolean)
      .join(", "),
    eventType: first("Type Of Event:"),
    eventDate: toYmd(first("Requested Event Date")),
    startTime: to24h(first("Requested Start Time")),
    guestCount: Number(first("Expected Number of Guest")) || null,
    vehicleCount: Number(first("Expected Number of Vehicles")) || null,
    package: first("Choose your Rental Package: ( 1/2 Day, or Full Day)"),
    tourCompleted: /^yes$/i.test(first("Have you completed an in-person tour of the event space?")),
    outsideVendors: /^yes$/i.test(first("Will you have outside vendors at your event?")),
    submissionId: idMatch ? idMatch[1] : "",
    addOns,
    addOnsTotal: addOns.reduce((sum, a) => sum + a.total, 0),
    warnings: [],
  };

  if (!booking.name) booking.warnings.push("no name parsed");
  if (!booking.email) booking.warnings.push("no email parsed");
  if (!booking.eventDate) booking.warnings.push("no event date parsed");
  if (!booking.startTime) {
    // Without a time the calendar hold silently becomes an all-day block.
    booking.warnings.push("no start time parsed — a hold would block the whole day");
  }
  for (const a of booking.addOns) {
    if (a.priceMismatch) {
      const known = EVENT_ADDONS.find((k) => k.id === a.knownId);
      booking.warnings.push(
        `"${a.label}" priced ${a.unitPrice} on the form but ${known.price} in EVENT_ADDONS`
      );
    }
    if (!a.knownId) booking.warnings.push(`add-on "${a.label}" is not in EVENT_ADDONS`);
  }
  return booking;
}

/**
 * Fetch and parse recent registration emails from the JVO inbox, newest last.
 *
 * @param {object} [opts]
 * @param {number} [opts.limit=20]  how many of the most recent to parse
 * @param {Date}   [opts.since]     only messages after this date
 * @returns {Promise<Array<object>>} parsed bookings (each with `receivedAt`)
 */
export async function fetchRecentSubmissions({ limit = 20, since } = {}) {
  if (!inboxConfigured()) throw new Error("SMTP_USER / SMTP_PASS are not set");
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: HOST,
    port: PORT,
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const query = { subject: SUBJECT_MATCH };
    if (since) query.since = since;
    const uids = await client.search(query, { uid: true });
    if (!uids.length) return [];

    // Over-fetch, because roughly half the matches are signature receipts that
    // get dropped below — slicing to `limit` first would return half as many.
    const wanted = uids.slice(-limit * 2);
    const out = [];
    for await (const msg of client.fetch(
      wanted.join(","),
      { source: true, envelope: true },
      { uid: true }
    )) {
      if (NOT_A_SUBMISSION.test(msg.envelope?.subject || "")) continue;
      try {
        const booking = parseSubmissionEmail(msg.source.toString("utf8"));
        booking.uid = msg.uid;
        booking.receivedAt = msg.envelope?.date?.toISOString() || null;
        booking.subject = msg.envelope?.subject || "";
        out.push(booking);
      } catch (err) {
        console.warn(`[jotform-email] uid ${msg.uid} failed to parse: ${err.message}`);
      }
    }

    // One submission can generate several emails (the notification, plus edit
    // and reminder variants built from a sparser template). Keep one record per
    // submission — the most complete, since the thin variants drop the name,
    // email and package and would otherwise look like a broken booking.
    const best = new Map();
    for (const b of out) {
      const key = b.submissionId || `${b.email}|${b.eventDate}|${b.uid}`;
      const score = (r) =>
        (r.name ? 1 : 0) + (r.email ? 1 : 0) + (r.package ? 1 : 0) +
        (r.eventDate ? 1 : 0) + (r.startTime ? 1 : 0) + r.addOns.length;
      const prev = best.get(key);
      if (!prev || score(b) > score(prev)) best.set(key, b);
    }
    return [...best.values()]
      .sort((a, b) => String(a.receivedAt).localeCompare(String(b.receivedAt)))
      .slice(-limit);
  } finally {
    lock.release();
    await client.logout();
  }
}
