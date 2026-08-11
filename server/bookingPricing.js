/**
 * What a booking gets invoiced for.
 * ---------------------------------
 * Turns a booking into the line items Stripe should bill, or null when we can't
 * work the amount out with confidence. Invoices send automatically, so null is
 * a real answer here — see the note in invoices.js about why we'd rather send
 * nothing than send a number we guessed.
 *
 * Events   — the rental package price ($550 / $800 / $1,300, plus any extra
 *            hours at $150). The $150 security deposit is refundable and
 *            separate, so it is NOT credited against this.
 * Weddings — whatever the couple selected on the form's payment element, minus
 *            the $500 deposit they've already paid on Cheddar Up.
 */
import { EVENT_PACKAGES, EXTRA_HOUR_PRICE, priceFor, hoursFor } from "../shared/eventSlots.js";
import { depositCreditFor, depositFor } from "../shared/deposits.js";
import { weddingBalance } from "./jotformPayment.js";

/**
 * Invoice plan for an EVENTS booking.
 *
 * @param {object} booking - mapped submission ({ package, packageId, extraHours })
 * @param {object|undefined} pkg - the resolved package from shared/eventSlots.js
 * @returns {{lines:Array, bookingTotal:number, invoiceTotal:number, memo:string, metadata:object}|null}
 */
export function eventsInvoicePlan(booking, pkg) {
  if (!pkg) return null; // unrecognised package — don't invent a price

  const extraHours = Number(booking.extraHours) || 0;
  const hours = hoursFor(pkg, extraHours);
  const total = priceFor(pkg, extraHours);
  if (!Number.isFinite(total) || total <= 0) return null;

  const lines = [
    {
      description:
        `${pkg.name} — ${pkg.baseHours} hours` +
        (booking.eventDate ? ` · ${booking.eventDate}` : ""),
      amount: pkg.basePrice,
    },
  ];
  if (extraHours > 0) {
    lines.push({
      description: `${extraHours} extra ${extraHours === 1 ? "hour" : "hours"} @ $${EXTRA_HOUR_PRICE}/hour`,
      amount: extraHours * EXTRA_HOUR_PRICE,
    });
  }

  const terms = depositFor("events");
  return {
    lines,
    bookingTotal: total,
    // Nothing credited: the events deposit is refunded, not applied.
    invoiceTotal: total,
    memo:
      `Outdoor Event Center — ${hours} hours.` +
      ` Your $${terms.amount} security deposit is separate and is refunded after the event.`,
    metadata: { site: "events", package: pkg.id, hours: String(hours) },
  };
}

/**
 * Invoice plan for a WEDDINGS booking.
 *
 * @param {object} payment - from readJotformPayment(); null if unreadable
 * @returns {{lines:Array, bookingTotal:number, invoiceTotal:number, memo:string, metadata:object}|null}
 */
export function weddingsInvoicePlan(payment) {
  const credit = depositCreditFor("weddings");
  const balance = weddingBalance(payment, credit);
  if (!balance) return null; // couldn't read a total — don't guess at a wedding bill

  /*
   * Bill as the selections, then a negative deposit line, rather than one
   * flattened number. The couple can see their package and enhancements listed
   * and the $500 they already paid coming off, which is what the weddings page
   * told them would happen.
   */
  const lines = payment.products?.length
    ? payment.products
        .filter((p) => Number.isFinite(p.amount) && p.amount > 0)
        .map((p) => ({
          description: p.quantity > 1 ? `${p.name} × ${p.quantity}` : p.name,
          amount: p.amount * (p.quantity || 1),
        }))
    : [];

  // If the itemised lines don't reconcile to JotForm's own total, trust the
  // total — it's what the couple saw — and bill it as one line rather than
  // shipping an invoice whose numbers don't add up.
  const itemised = lines.reduce((sum, l) => sum + l.amount, 0);
  const useLines = lines.length > 0 && Math.abs(itemised - balance.total) < 0.01;

  const finalLines = useLines
    ? [...lines, { description: "Deposit already paid (Cheddar Up)", amount: -credit }]
    : [
        { description: "Wedding package and enhancements", amount: balance.total },
        { description: "Deposit already paid (Cheddar Up)", amount: -credit },
      ];

  return {
    lines: finalLines,
    bookingTotal: balance.total,
    invoiceTotal: balance.invoice,
    memo:
      `Your wedding at Jonesboro Virtual Office. Your $${credit} deposit is` +
      ` non-refundable and has been credited against this balance.`,
    metadata: { site: "weddings", booking_total: String(balance.total) },
  };
}

/** All package names, for logging an unrecognised one usefully. */
export const KNOWN_PACKAGES = EVENT_PACKAGES.map((p) => p.id).join(", ");
