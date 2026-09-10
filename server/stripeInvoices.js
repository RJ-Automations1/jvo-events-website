/**
 * Stripe invoicing for event bookings.
 * ------------------------------------
 * The event space is NOT pay-first (that's the JVO Mail room-booking flow, which
 * uses Stripe Checkout). An event is booked with a $150 security deposit, then
 * the balance falls due 14 days before the date — so what we need here is an
 * INVOICE the guest can be emailed and can pay whenever, not a checkout session.
 *
 * Same Stripe account as JVO Mail ("Jonesboro Virtual Office"), same
 * STRIPE_SECRET_KEY. Reuse the key rather than opening a second account, so all
 * JVO money lands in one dashboard.
 *
 * ── Draft by default ──────────────────────────────────────────────────────
 * createEventInvoice() leaves the invoice as a DRAFT unless you pass
 * { send: true }. Drafts are free to delete and invisible to the customer;
 * a finalized invoice is a real financial document and sending emails a real
 * person a real demand for money. Nothing here mails a guest by accident.
 *
 * ── Amounts are computed here, never passed in from a browser ─────────────
 * The caller hands us the package and what's already been paid; we do the
 * arithmetic. See amountOwedCents().
 */

const CURRENCY = "usd";

/** Plain-calendar date maths, no timezone drift. */
function addDaysYmd(ymd, n) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  const toUtc = (s) => {
    const [y, m, d] = String(s).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}
function todayYmd(timeZone = process.env.EVENT_TIMEZONE || "America/New_York") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * How many days the guest gets to pay.
 *
 * JVO's terms: the balance is due 14 days before the event, and a booking made
 * INSIDE that window is payable up front. So the window is derived from the
 * event date, not from a fixed offset — a flat "14 days from today" would put
 * the due date AFTER a near-term event, which is how you end up invoicing
 * someone for a party that already happened.
 *
 * A caller can still pass an explicit `requested`, but it is clamped: a due
 * date is never on or after the event, and never in the past.
 *
 * @param {string} eventDate - YYYY-MM-DD
 * @param {number} [requested] - caller's preferred number of days
 * @returns {number} days from today, at least 1
 */
export function dueDaysFor(eventDate, requested) {
  const today = todayYmd();
  const untilEvent = daysBetween(today, eventDate);

  // Past or same-day event: nothing sensible to schedule, make it due tomorrow.
  if (untilEvent <= 1) return 1;

  // The contractual cutoff, 14 days before the event.
  const cutoff = addDaysYmd(eventDate, -14);
  const derived = cutoff > today ? daysBetween(today, cutoff) : 1;

  const days = Number.isFinite(requested) ? requested : derived;
  // Never on or after the event day itself.
  return Math.max(1, Math.min(days, untilEvent - 1));
}

/** The security deposit taken at booking, in cents (see jvoKnowledge.js). */
export const SECURITY_DEPOSIT_CENTS = 150_00;

/**
 * Card processing surcharge, as a percentage of the invoice subtotal.
 *
 * Set CARD_FEE_PERCENT=0 to switch it off. It's added as its own visible line
 * item rather than folded into the package price — a surcharge a guest can't
 * see itemised is the kind of thing that gets disputed, and card networks
 * require it to be disclosed.
 *
 * NOTE: this applies to every invoice, because a Stripe invoice is priced when
 * it's raised and we can't know yet whether the guest will pay by card. If JVO
 * starts taking ACH or cash for balances, the fee needs to come off those by
 * hand (or be issued back as a credit note).
 */
export const CARD_FEE_PERCENT = Number(
  process.env.CARD_FEE_PERCENT != null ? process.env.CARD_FEE_PERCENT : 3
);

/** The surcharge on a subtotal, in cents. Rounded to the nearest cent. */
export function cardFeeCents(subtotalCents, percent = CARD_FEE_PERCENT) {
  if (!percent || percent <= 0) return 0;
  return Math.round(subtotalCents * (percent / 100));
}

let stripeClient = null;

/** Lazily build the Stripe client; null when the key isn't configured. */
export async function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!stripeClient) {
    const mod = await import("stripe");
    const Stripe = mod.default || mod;
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

/** True once Stripe is configured well enough to raise an invoice. */
export function invoicesConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** True when the configured key is a LIVE key (real money, real customers). */
export function isLiveMode() {
  return String(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live");
}

/**
 * What the guest still owes, in cents.
 *
 * `depositApplied` decides how the $150 is treated and there is no safe default
 * — applying it when it's actually a refundable hold under-bills by $150, and
 * not applying it when it should count over-bills by the same. So the caller
 * must say. Pass `packageCents` from shared/eventSlots.js, never from a form.
 *
 * @param {object} opts
 * @param {number} opts.packageCents   - the booked package total, in cents
 * @param {number} [opts.extrasCents]  - add-ons (extra hours, weather insurance)
 * @param {boolean} opts.depositApplied - true if the $150 counts toward the total
 * @param {number} [opts.alreadyPaidCents] - anything else already collected
 * @returns {number} cents owed (never negative)
 */
export function amountOwedCents({
  packageCents,
  extrasCents = 0,
  depositApplied,
  alreadyPaidCents = 0,
}) {
  if (typeof depositApplied !== "boolean") {
    throw new Error("amountOwedCents: depositApplied must be set explicitly (true/false)");
  }
  if (!Number.isInteger(packageCents) || packageCents <= 0) {
    throw new Error(`amountOwedCents: bad packageCents ${packageCents}`);
  }
  const credit = (depositApplied ? SECURITY_DEPOSIT_CENTS : 0) + alreadyPaidCents;
  return Math.max(0, packageCents + extrasCents - credit);
}

/**
 * Find the Stripe customer for this guest, or make one. Matched on email so a
 * repeat guest keeps one customer record (and one payment-method history)
 * instead of accumulating a new customer per booking.
 */
async function findOrCreateCustomer(stripe, { name, email, phone }) {
  const clean = String(email || "").trim().toLowerCase();
  if (!clean) throw new Error("findOrCreateCustomer: no email");

  const found = await stripe.customers.list({ email: clean, limit: 1 });
  if (found.data.length) return found.data[0];

  return stripe.customers.create({
    email: clean,
    name: name || undefined,
    phone: phone || undefined,
    metadata: { source: "jvo-events" },
  });
}

/**
 * Raise the balance invoice for one event booking.
 *
 * @param {object} booking - { name, email, phone?, eventDate, eventType?,
 *   package?, guestCount?, publicId?, submissionId? }
 * @param {object} opts
 * @param {number} opts.amountCents  - what to bill (use amountOwedCents())
 * @param {number} [opts.daysUntilDue=14]
 * @param {boolean} [opts.send=false] - finalize AND email the guest. Default
 *   false leaves a reviewable draft that has not touched the customer.
 * @param {string} [opts.description] - line-item text; a sensible one is built
 *   from the booking when omitted.
 * @returns {Promise<{configured:boolean, id?:string, status?:string,
 *   hostedInvoiceUrl?:string|null, amountDue?:number, sent:boolean}>}
 */
export async function createEventInvoice(booking, opts = {}) {
  const stripe = await getStripe();
  if (!stripe) return { configured: false, sent: false };

  const { amountCents, send = false } = opts;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error(`createEventInvoice: bad amountCents ${amountCents}`);
  }

  const eventDate = String(booking.eventDate || "").slice(0, 10);
  const prettyDate = eventDate
    ? new Date(`${eventDate}T12:00:00Z`).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "your event";

  const description =
    opts.description ||
    [
      `${booking.eventType || "Event"} at JVO Events — ${prettyDate}`,
      booking.package ? `(${booking.package})` : "",
      booking.guestCount ? `· ${booking.guestCount} guests` : "",
    ]
      .filter(Boolean)
      .join(" ");

  const customer = await findOrCreateCustomer(stripe, booking);

  // Idempotency: if a draft/open invoice for this same event already exists,
  // hand it back instead of raising a second demand for the same money.
  const existing = await stripe.invoices.list({ customer: customer.id, limit: 20 });
  const dupe = existing.data.find(
    (i) =>
      ["draft", "open"].includes(i.status) &&
      i.metadata?.jvoEventDate === eventDate &&
      i.metadata?.jvoSource === "jvo-events"
  );
  if (dupe) {
    // An existing DRAFT plus send:true means "you made this, now send it" —
    // finalize and mail that one rather than returning it untouched, which
    // would silently do nothing. An already-open invoice has been sent; leave
    // it be so nobody gets billed twice for the same event.
    if (dupe.status === "draft" && send) {
      const finalized = await stripe.invoices.finalizeInvoice(dupe.id);
      const emailed = await stripe.invoices.sendInvoice(finalized.id);
      return {
        configured: true,
        duplicate: true,
        id: emailed.id,
        status: emailed.status,
        hostedInvoiceUrl: emailed.hosted_invoice_url || null,
        amountDue: emailed.amount_due,
        sent: true,
      };
    }
    return {
      configured: true,
      duplicate: true,
      id: dupe.id,
      status: dupe.status,
      hostedInvoiceUrl: dupe.hosted_invoice_url || null,
      amountDue: dupe.amount_due,
      sent: false,
    };
  }

  const metadata = {
    jvoSource: "jvo-events",
    jvoEventDate: eventDate,
    ...(booking.publicId ? { jvoPublicId: String(booking.publicId) } : {}),
    ...(booking.submissionId ? { jotformId: String(booking.submissionId) } : {}),
  };

  const invoice = await stripe.invoices.create({
    customer: customer.id,
    collection_method: "send_invoice",
    // Derived from the event date and clamped so it can never land on or after
    // the event — see dueDaysFor().
    days_until_due: dueDaysFor(eventDate, opts.daysUntilDue),
    description: `Balance due for your event at JVO Events on ${prettyDate}.`,
    metadata,
    // Keep the item attached to this invoice only — without this the item can
    // drift onto whatever invoice finalizes next for the same customer.
    pending_invoice_items_behavior: "exclude",
  });

  // `amount` (a flat total in cents), not `unit_amount` — the latter is only
  // valid alongside price_data, and the API rejects it here as parameter_unknown.
  await stripe.invoiceItems.create({
    customer: customer.id,
    invoice: invoice.id,
    currency: CURRENCY,
    amount: amountCents,
    description,
    metadata,
  });

  // Add-ons ride as their OWN line items so the guest sees what they're paying
  // for ("Additional Chairs (25 × $2)") instead of one opaque total. Each is
  // priced by shared/eventSlots.js, never by anything the guest typed.
  for (const line of opts.addOnLines || []) {
    await stripe.invoiceItems.create({
      customer: customer.id,
      invoice: invoice.id,
      currency: CURRENCY,
      amount: Math.round(line.total * 100),
      description: line.label,
      metadata: { ...metadata, jvoAddon: line.id },
    });
  }

  // Card surcharge, computed on the WHOLE subtotal (package + add-ons) and
  // shown as its own line so the guest can see exactly what it is.
  const feePercent = opts.cardFeePercent ?? CARD_FEE_PERCENT;
  const subtotal =
    amountCents +
    (opts.addOnLines || []).reduce((sum, l) => sum + Math.round(l.total * 100), 0);
  const fee = cardFeeCents(subtotal, feePercent);
  if (fee > 0) {
    await stripe.invoiceItems.create({
      customer: customer.id,
      invoice: invoice.id,
      currency: CURRENCY,
      amount: fee,
      description: `Card processing fee (${feePercent}%)`,
      metadata: { ...metadata, jvoCardFee: String(feePercent) },
    });
  }

  if (!send) {
    const draft = await stripe.invoices.retrieve(invoice.id);
    return {
      configured: true,
      id: draft.id,
      status: draft.status,
      hostedInvoiceUrl: draft.hosted_invoice_url || null,
      amountDue: draft.amount_due,
      sent: false,
    };
  }

  const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
  const emailed = await stripe.invoices.sendInvoice(finalized.id);
  return {
    configured: true,
    id: emailed.id,
    status: emailed.status,
    hostedInvoiceUrl: emailed.hosted_invoice_url || null,
    amountDue: emailed.amount_due,
    sent: true,
  };
}

/**
 * Void the open invoice for a booking whose balance missed the 14-day deadline.
 *
 * Refuses if ANY money has been received: a part-paid invoice can't be voided
 * by Stripe anyway, and a guest who has paid something deserves a conversation
 * rather than an automatic cancellation.
 *
 * @returns {Promise<{ok:boolean, reason?:string, id?:string, status?:string}>}
 */
export async function voidEventInvoice(booking) {
  const stripe = await getStripe();
  if (!stripe) return { ok: false, reason: "stripe_not_configured" };

  const status = await getInvoiceStatus(booking);
  if (!status.invoiceId) return { ok: false, reason: "no_invoice" };

  const inv = await stripe.invoices.retrieve(status.invoiceId);
  if (inv.status !== "open") return { ok: false, reason: `invoice is ${inv.status}` };
  if (inv.amount_paid > 0) {
    return { ok: false, reason: `partially paid ($${(inv.amount_paid / 100).toFixed(2)})` };
  }

  const voided = await stripe.invoices.voidInvoice(inv.id);
  return { ok: true, id: voided.id, status: voided.status };
}

/**
 * Payment status for a booking, for the reminder sweep. This is the real
 * implementation of what server/deskworksPayments.js only stubbed: it answers
 * "is this event paid?" from Stripe rather than from Deskworks.
 *
 * @param {object} booking - { email, eventDate }
 * @returns {Promise<{configured:boolean, paidInFull:boolean|null,
 *   balanceDue:number|null, invoiceUrl:string|null}>}
 */
export async function getInvoiceStatus(booking) {
  const stripe = await getStripe();
  if (!stripe) {
    return { configured: false, paidInFull: null, balanceDue: null, invoiceUrl: null };
  }
  const email = String(booking.email || "").trim().toLowerCase();
  const eventDate = String(booking.eventDate || "").slice(0, 10);
  if (!email || !eventDate) {
    return { configured: true, paidInFull: null, balanceDue: null, invoiceUrl: null };
  }

  const customers = await stripe.customers.list({ email, limit: 1 });
  if (!customers.data.length) {
    // No customer means no invoice was ever raised — "unknown", not "unpaid".
    return { configured: true, paidInFull: null, balanceDue: null, invoiceUrl: null };
  }

  const invoices = await stripe.invoices.list({ customer: customers.data[0].id, limit: 50 });
  const mine = invoices.data.filter(
    (i) => i.metadata?.jvoSource === "jvo-events" && i.metadata?.jvoEventDate === eventDate
  );
  if (!mine.length) {
    return { configured: true, paidInFull: null, balanceDue: null, invoiceUrl: null };
  }

  const paid = mine.find((i) => i.status === "paid");
  if (paid) {
    return {
      configured: true,
      paidInFull: true,
      balanceDue: 0,
      invoiceId: paid.id,
      invoiceUrl: paid.hosted_invoice_url || null,
    };
  }

  const open = mine.find((i) => i.status === "open") || mine[0];
  return {
    configured: true,
    paidInFull: false,
    // amount_remaining, not amount_due — once a partial payment lands, amount_due
    // still shows the original total and would over-state what's actually left.
    balanceDue:
      open.amount_remaining != null
        ? open.amount_remaining / 100
        : open.amount_due != null
          ? open.amount_due / 100
          : null,
    invoiceId: open.id,
    invoiceUrl: open.hosted_invoice_url || null,
  };
}
