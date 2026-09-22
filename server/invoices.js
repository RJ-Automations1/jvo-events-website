/**
 * Stripe invoicing for bookings.
 * ------------------------------
 * A booking's deposit is still paid on Cheddar Up. What Stripe does here is
 * bill the rest: as soon as a booking arrives we create an invoice for what the
 * customer owes and Stripe emails it to them.
 *
 *   Events   — $150 security deposit, refundable and SEPARATE from the rental.
 *              So the invoice is the full event price; nothing is credited.
 *   Weddings — $500 deposit, non-refundable but CREDITED against the total.
 *              So the invoice is (total − $500), matching what the weddings
 *              page promises couples.
 *
 * ── Why the idempotency matters more than usual ──────────────────────────
 * These invoices send with no human review, and JotForm retries a webhook it
 * doesn't get a 200 from. Without a guard, one submission becomes two bills in
 * a customer's inbox and an awkward phone call. Every send is therefore keyed
 * on the booking row: if stripe_invoice_id is already set we stop, and we set
 * it before finalising so a crash mid-send can't be replayed into a second
 * invoice.
 *
 * ── Why some bookings deliberately get no invoice ────────────────────────
 * An amount we couldn't work out with confidence is not an amount worth
 * emailing someone. When the total can't be determined — an unparseable
 * weddings payment field, a package we don't recognise, a balance of zero —
 * nothing is sent, the reason is recorded on the booking, and staff are told.
 * A missing invoice is a phone call; a wrong one is a refund and an apology.
 */
import Stripe from "stripe";
import { nowIso } from "./db.js";

const CURRENCY = "usd";
/** How long the customer has to pay once the invoice lands. */
const DAYS_UNTIL_DUE = Number(process.env.INVOICE_DAYS_UNTIL_DUE || "7");

let stripeClient = null;

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!stripeClient) stripeClient = new Stripe(key);
  return stripeClient;
}

export function invoicingConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Reuse a customer for this email rather than growing duplicates in Stripe. */
async function findOrCreateCustomer(stripe, { name, email }) {
  const existing = await stripe.customers.list({ email, limit: 1 });
  if (existing.data.length) return existing.data[0];
  return stripe.customers.create({ email, name: name || undefined });
}

/**
 * Build, finalise and email one invoice.
 *
 * @param {object} args
 * @param {string} args.name
 * @param {string} args.email
 * @param {Array<{description:string, amount:number}>} args.lines - dollars
 * @param {string} args.memo - shown to the customer on the invoice
 * @param {object} args.metadata
 * @returns {Promise<{id:string, total:number, hostedUrl:string, customerId:string}>}
 */
async function createAndSend(stripe, { name, email, lines, memo, metadata }) {
  const customer = await findOrCreateCustomer(stripe, { name, email });

  for (const line of lines) {
    await stripe.invoiceItems.create({
      customer: customer.id,
      currency: CURRENCY,
      amount: Math.round(line.amount * 100),
      description: line.description,
    });
  }

  const draft = await stripe.invoices.create({
    customer: customer.id,
    collection_method: "send_invoice",
    days_until_due: DAYS_UNTIL_DUE,
    // Without this the pending items above aren't pulled in and the invoice
    // finalises at $0 — which Stripe then auto-marks paid and refuses to send.
    pending_invoice_items_behavior: "include",
    description: memo,
    metadata,
  });

  const expected = Math.round(lines.reduce((sum, l) => sum + l.amount, 0) * 100);
  if (draft.total !== expected) {
    // Refuse to finalise something that doesn't add up to what we intended.
    await stripe.invoices.del(draft.id).catch(() => {});
    throw new Error(`invoice total ${draft.total} != expected ${expected}; draft discarded`);
  }

  const finalized = await stripe.invoices.finalizeInvoice(draft.id);
  const sent = await stripe.invoices.sendInvoice(finalized.id);
  return {
    id: sent.id,
    total: sent.total / 100,
    hostedUrl: sent.hosted_invoice_url,
    customerId: customer.id,
  };
}

/**
 * Invoice a booking, once. Records what happened on the booking row either way.
 *
 * @param {import('better-sqlite3').Database|null} db
 * @param {object} event - the row from the events table
 * @param {object} plan - { lines, bookingTotal, invoiceTotal, memo, metadata }
 * @returns {Promise<{sent:boolean, reason?:string, invoice?:object}>}
 */
export async function invoiceBooking(db, event, plan) {
  const stripe = getStripe();
  if (!stripe) return { sent: false, reason: "stripe_not_configured" };
  if (!event?.email) return { sent: false, reason: "no_email" };

  // Already invoiced — a webhook retry, not a second booking.
  if (event.stripe_invoice_id) {
    return { sent: false, reason: "already_invoiced" };
  }
  if (!plan || !Number.isFinite(plan.invoiceTotal)) {
    return { sent: false, reason: "amount_unknown" };
  }
  if (plan.invoiceTotal <= 0) {
    // Deposit covered it, or nothing priced was selected. Nothing owed.
    return { sent: false, reason: "nothing_owed" };
  }

  const invoice = await createAndSend(stripe, {
    name: event.name,
    email: event.email,
    lines: plan.lines,
    memo: plan.memo,
    metadata: { booking: event.public_id || String(event.id), ...(plan.metadata || {}) },
  });

  if (db) {
    try {
      db.prepare(
        `UPDATE events
            SET stripe_invoice_id = ?, stripe_customer_id = ?, invoice_total_cents = ?,
                booking_total_cents = ?, invoice_sent_at = ?, updated_at = ?
          WHERE id = ?`,
      ).run(
        invoice.id,
        invoice.customerId,
        Math.round(plan.invoiceTotal * 100),
        Math.round((plan.bookingTotal ?? plan.invoiceTotal) * 100),
        nowIso(),
        nowIso(),
        event.id,
      );
    } catch (err) {
      // The customer already has the invoice; losing our note of it is bad but
      // not worth throwing away a successful send.
      console.error("[invoice] could not record invoice on booking:", err.message);
    }
  }

  return { sent: true, invoice };
}

/** Note on the booking why no invoice went out, so /admin can show it. */
export function recordInvoiceSkip(db, eventId, reason) {
  if (!db || !eventId) return;
  try {
    db.prepare("UPDATE events SET invoice_skipped_reason = ?, updated_at = ? WHERE id = ?")
      .run(String(reason), nowIso(), eventId);
  } catch (err) {
    console.error("[invoice] could not record skip reason:", err.message);
  }
}
