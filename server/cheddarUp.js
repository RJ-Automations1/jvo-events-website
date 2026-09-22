/**
 * Cheddar Up deposit notifications, read from the JVO inbox.
 * ----------------------------------------------------------
 * The $150 security deposit is THE trigger for a booking. Until a guest pays
 * it, their registration is only stored — no calendar hold, no emails, no
 * invoice. When Cheddar Up emails jonesborovirtualoffice@gmail.com to say a
 * deposit landed, that's when the date gets blocked and the guest hears from us.
 *
 * Same IMAP credential as the JotForm reader (the SMTP app password).
 *
 * ── The two emails that matter ────────────────────────────────────────────
 *   "Payment Received:  Security Deposit for Outdoor Event"
 *      Name, Email, and — crucially — "Event Date: Dec 12, 2026". The event
 *      date is what lets a deposit be matched to the RIGHT registration: one
 *      guest can register several dates, and a name alone isn't unique.
 *
 *   "Refund Confirmation: <name>"
 *      Payer name and amount ONLY — no email, no event date. Too weak to match
 *      safely, so refunds are never acted on automatically; they're reported to
 *      JVO for a human to resolve. Releasing the wrong person's date because two
 *      guests share a name is not a mistake worth automating.
 */

const HOST = process.env.IMAP_HOST || "imap.gmail.com";
const PORT = Number(process.env.IMAP_PORT || "993");

/** Only deposits for this collection count — Cheddar Up may carry others. */
const DEPOSIT_COLLECTION = /Security Deposit for Outdoor Event/i;

export function cheddarConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** "Dec 12, 2026" → "2026-12-12"; "" when it doesn't parse. */
function monthDayYear(s) {
  const m = String(s || "").match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return "";
  const mo = MONTHS[m[1].toLowerCase()];
  if (!mo) return "";
  return `${m[3]}-${String(mo).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
}

/** Strip a Cheddar Up HTML email down to its readable lines. */
export function cheddarLines(rawSource) {
  const raw = String(rawSource);
  const start = raw.search(/<body|<table|<div/i);
  return (start >= 0 ? raw.slice(start) : raw)
    .replace(/=\r?\n/g, "")
    .replace(/=3D/g, "=")
    .replace(/=C2=A0|&nbsp;/g, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(td|tr|p|div|h\d|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&#8202;|=E2=80=8A|=09|=20/g, " ")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Parse one Cheddar Up email.
 * @returns {null|{kind:"deposit"|"refund", name:string, email:string,
 *   eventDate:string, amount:number|null, paidOn:string}}
 */
export function parseCheddarEmail(rawSource, subject = "") {
  const lines = cheddarLines(rawSource);
  const field = (label) => {
    const hit = lines.find((l) => l.toLowerCase().startsWith(`${label.toLowerCase()}:`));
    return hit ? hit.slice(hit.indexOf(":") + 1).trim() : "";
  };
  const money = (s) => {
    const m = String(s || "").match(/\$\s*([\d,]+(?:\.\d{2})?)/);
    return m ? Number(m[1].replace(/,/g, "")) : null;
  };

  if (/^Payment Received/i.test(subject)) {
    if (!DEPOSIT_COLLECTION.test(subject) && !lines.some((l) => DEPOSIT_COLLECTION.test(l))) {
      return null; // some other collection — not an event deposit
    }
    const total = lines.find((l) => /^Total Amount/i.test(l));
    return {
      kind: "deposit",
      name: field("Name"),
      email: field("Email").toLowerCase(),
      eventDate: monthDayYear(field("Event Date")),
      amount: money(total) ?? money(lines[1]),
      paidOn: monthDayYear(field("Date")),
    };
  }

  if (/^Refund Confirmation/i.test(subject)) {
    return {
      kind: "refund",
      name: field("Payer") || subject.replace(/^Refund Confirmation:\s*/i, "").trim(),
      email: "", // refund emails don't carry one
      eventDate: "", // nor an event date — which is why refunds aren't auto-acted on
      amount: money(field("Amount Refunded")),
      paidOn: monthDayYear(field("Date")),
    };
  }

  return null;
}

/**
 * Fetch recent deposit + refund notifications, oldest first.
 * @param {object} [opts] - { limit=50, since }
 */
export async function fetchCheddarEvents({ limit = 50, since } = {}) {
  if (!cheddarConfigured()) throw new Error("SMTP_USER / SMTP_PASS are not set");
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
    const query = { from: "cheddarup.com" };
    if (since) query.since = since;
    const uids = await client.search(query, { uid: true });
    if (!uids.length) return [];

    const out = [];
    for await (const msg of client.fetch(
      uids.slice(-limit * 3).join(","),
      { source: true, envelope: true },
      { uid: true }
    )) {
      const subject = msg.envelope?.subject || "";
      if (!/^(Payment Received|Refund Confirmation)/i.test(subject)) continue;
      const parsed = parseCheddarEmail(msg.source.toString("utf8"), subject);
      if (!parsed) continue;
      out.push({ ...parsed, uid: msg.uid, receivedAt: msg.envelope?.date?.toISOString() || null });
    }
    return out.slice(-limit);
  } finally {
    lock.release();
    await client.logout();
  }
}

/** Lowercase, collapse spaces, drop punctuation — for name comparison only. */
export function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find the registration a deposit belongs to.
 *
 * Email + event date first — the strongest match, and what the deposit email
 * gives us. Name + event date as a fallback for a guest who used a different
 * email on Cheddar Up than on the form. Never name alone: two guests can share
 * a name, and the event date is what disambiguates them.
 *
 * @returns {{registration:object|null, how:string}}
 */
export function matchDeposit(deposit, registrations) {
  const onDate = registrations.filter((r) => r.eventDate === deposit.eventDate);
  const newest = (list) =>
    [...list].sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)))[0];

  const byEmail = onDate.filter(
    (r) => (r.email || "").toLowerCase() === deposit.email && deposit.email
  );
  if (byEmail.length) return { registration: newest(byEmail), how: "email + event date" };

  const byName = onDate.filter((r) => normName(r.name) === normName(deposit.name));
  if (byName.length) return { registration: newest(byName), how: "name + event date" };

  return { registration: null, how: "no registration matches" };
}
