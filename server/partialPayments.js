/**
 * "Pay any amount" — customer-driven partial payments against an event invoice.
 * -----------------------------------------------------------------------------
 * Stripe's Hosted Invoice Page CANNOT take a part-payment (their docs, Invoicing
 * → Partial payments → Limitations: "Your customers can't pay a partial amount
 * on the Hosted Invoice Page"). Partial payment is merchant-initiated only —
 * unless you build the flow yourself, which is what this is.
 *
 *   1. Guest opens /pay/<token> and sees the balance REMAINING on their invoice.
 *   2. They type any amount up to that remaining balance.
 *   3. We open a Stripe Checkout session for exactly that amount.
 *   4. On success we attach the resulting PaymentIntent to their invoice, so
 *      Stripe itself tracks amount_paid / amount_remaining and flips the invoice
 *      to `paid` on its own once the remainder reaches zero.
 *
 * The invoice stays the single source of truth for what's owed — we never keep
 * our own running total that could drift from Stripe's.
 *
 * ── Why a signed token, not the invoice id ────────────────────────────────
 * The pay link goes in an email, so the URL is the only thing standing between
 * a stranger and someone's booking details. Stripe invoice ids are guessable
 * enough to be worth not exposing directly, and we have no session/login here.
 * So the link carries an HMAC of the invoice id: unguessable without the
 * secret, stateless (no DB row to keep in sync — which matters because the
 * SQLite pipeline lives on Render's disk and isn't reachable everywhere), and
 * revocable en masse by rotating PAY_LINK_SECRET.
 */

import crypto from "node:crypto";
import { getStripe } from "./stripeInvoices.js";

/**
 * Secret backing the pay-link HMAC. Falls back to other server-side secrets so
 * the feature works on an existing deploy, but set PAY_LINK_SECRET explicitly:
 * rotating it invalidates every outstanding pay link at once, which is what you
 * want if one ever leaks, and you don't want that tangled up with cron auth.
 */
function linkSecret() {
  return (
    process.env.PAY_LINK_SECRET ||
    process.env.CRON_SECRET ||
    process.env.JOTFORM_WEBHOOK_SECRET ||
    ""
  );
}

export function payLinksConfigured() {
  return Boolean(linkSecret() && process.env.STRIPE_SECRET_KEY);
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");

function sign(value) {
  return crypto.createHmac("sha256", linkSecret()).update(value).digest("base64url");
}

/** Build the opaque token for an invoice's pay link. */
export function payLinkToken(invoiceId) {
  if (!linkSecret()) throw new Error("payLinkToken: no PAY_LINK_SECRET configured");
  const id = b64url(String(invoiceId));
  return `${id}.${sign(id)}`;
}

/** Full URL a guest can be emailed. */
export function payLinkUrl(invoiceId, siteUrl) {
  const base = (siteUrl || process.env.SITE_URL || "https://jvoevents.com").replace(/\/+$/, "");
  return `${base}/pay/${payLinkToken(invoiceId)}`;
}

/**
 * Recover the invoice id from a token, or null if it doesn't verify.
 * Uses a timing-safe compare so the signature can't be brute-forced a byte at
 * a time.
 */
export function invoiceIdFromToken(token) {
  if (!linkSecret()) return null;
  const [id, sig] = String(token || "").split(".");
  if (!id || !sig) return null;
  const expected = sign(id);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return Buffer.from(id, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

/**
 * What the pay page shows. Only ever returns fields safe to render to whoever
 * holds the link — no customer id, no other bookings, no payment methods.
 *
 * @returns {Promise<null|{invoiceId:string,status:string,currency:string,
 *   total:number,paid:number,remaining:number,eventDate:string|null,
 *   guestName:string|null,lines:Array<{description:string,amount:number}>,
 *   hostedInvoiceUrl:string|null,payable:boolean}>}
 */
export async function getPayableInvoice(token) {
  const invoiceId = invoiceIdFromToken(token);
  if (!invoiceId) return null;
  const stripe = await getStripe();
  if (!stripe) return null;

  let inv;
  try {
    inv = await stripe.invoices.retrieve(invoiceId);
  } catch {
    return null;
  }
  // Only ever expose invoices this app raised.
  if (inv.metadata?.jvoSource !== "jvo-events") return null;

  const remaining = inv.amount_remaining ?? Math.max(0, inv.amount_due - inv.amount_paid);
  return {
    invoiceId: inv.id,
    number: inv.number || null,
    status: inv.status,
    currency: inv.currency,
    total: inv.total,
    paid: inv.amount_paid,
    remaining,
    eventDate: inv.metadata?.jvoEventDate || null,
    guestName: inv.customer_name || null,
    lines: (inv.lines?.data || []).map((l) => ({
      description: l.description || "",
      amount: l.amount,
    })),
    hostedInvoiceUrl: inv.hosted_invoice_url || null,
    // Voided, uncollectible, draft and fully-paid invoices are not payable.
    payable: inv.status === "open" && remaining > 0,
  };
}

/** Smallest part-payment we'll take, so fees don't eat the whole thing. */
export const MIN_PARTIAL_CENTS = 500;

/**
 * Open a Stripe Checkout session for a part-payment against the invoice.
 *
 * The amount is validated against Stripe's own `amount_remaining` here, server
 * side — the browser posts what the guest typed, and a browser can post
 * anything. Overpaying an invoice silently becomes customer credit balance
 * rather than an error, so this is the only thing stopping a typo from taking
 * more money than is owed.
 */
export async function createPartialCheckout(token, amountCents, { origin } = {}) {
  const info = await getPayableInvoice(token);
  if (!info) return { ok: false, error: "not_found" };
  if (!info.payable) return { ok: false, error: "not_payable", info };

  const amount = Math.round(Number(amountCents));
  if (!Number.isInteger(amount) || amount < MIN_PARTIAL_CENTS) {
    return { ok: false, error: "too_small", min: MIN_PARTIAL_CENTS, info };
  }
  if (amount > info.remaining) {
    return { ok: false, error: "too_large", info };
  }

  const stripe = await getStripe();
  const invoice = await stripe.invoices.retrieve(info.invoiceId);
  const base = (origin || process.env.SITE_URL || "https://jvoevents.com").replace(/\/+$/, "");
  const isFull = amount === info.remaining;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: invoice.customer,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: info.currency,
          unit_amount: amount,
          product_data: {
            name: isFull ? "Balance payment — JVO Events" : "Partial payment — JVO Events",
            description: info.eventDate
              ? `Toward your event on ${info.eventDate}${info.number ? ` (invoice ${info.number})` : ""}`
              : undefined,
          },
        },
      },
    ],
    // Carried through to the webhook and the return page so both know which
    // invoice to credit without trusting anything the browser sends back.
    metadata: {
      jvoSource: "jvo-events",
      jvoInvoiceId: info.invoiceId,
      jvoPartial: isFull ? "false" : "true",
    },
    payment_intent_data: {
      metadata: { jvoSource: "jvo-events", jvoInvoiceId: info.invoiceId },
    },
    success_url: `${base}/pay/${token}?paid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/pay/${token}?cancelled=1`,
  });

  return { ok: true, url: session.url, sessionId: session.id, amount };
}

/**
 * Credit a completed Checkout session to its invoice.
 *
 * Called from BOTH the Stripe webhook and the return page. Webhooks get delayed
 * and lost, and "the guest paid but the invoice still says unpaid" is the worst
 * outcome here — so the return page reconciles too, and both funnel through
 * this one idempotent function.
 *
 * @returns {Promise<{ok:boolean, already?:boolean, error?:string,
 *   remaining?:number, paid?:number, status?:string}>}
 */
export async function creditSessionToInvoice(sessionId) {
  const stripe = await getStripe();
  if (!stripe) return { ok: false, error: "stripe_not_configured" };

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent"],
  });
  if (session.metadata?.jvoSource !== "jvo-events") {
    return { ok: false, error: "not_ours" };
  }
  if (session.payment_status !== "paid") {
    return { ok: false, error: "not_paid_yet" };
  }

  const invoiceId = session.metadata?.jvoInvoiceId;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
  if (!invoiceId || !paymentIntentId) return { ok: false, error: "missing_ids" };

  // Idempotency: if this PaymentIntent is already on the invoice, stop. Both
  // the webhook and the return page routinely arrive for the same session.
  const existing = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 100 });
  const already = existing.data.some(
    (p) => p.payment?.payment_intent === paymentIntentId
  );

  if (!already) {
    await stripe.invoices.attachPayment(invoiceId, { payment_intent: paymentIntentId });
  }

  const inv = await stripe.invoices.retrieve(invoiceId);
  return {
    ok: true,
    already,
    status: inv.status,
    paid: inv.amount_paid,
    remaining: inv.amount_remaining ?? Math.max(0, inv.amount_due - inv.amount_paid),
  };
}
