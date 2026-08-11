/**
 * Security deposit terms, per site.
 * ---------------------------------
 * These are quoted to customers before they pay and they drive what we invoice,
 * so they're contract terms — change them only when JVO changes the policy.
 *
 * Events   — $150, refundable after the event, SEPARATE from the rental rate.
 *            The invoice is therefore the full event price; the deposit is not
 *            credited against it.
 * Weddings — $500, non-refundable, but CREDITED against the wedding total.
 *            The invoice is therefore (total − $500).
 *
 * The deposit itself is still collected on Cheddar Up; Stripe only bills the
 * balance. Shared by the server (server/bookingPricing.js) and the front end
 * (src/lib/deposit.ts) so the number a couple is shown and the number we bill
 * can never drift apart.
 */

export const DEPOSITS = {
  events: {
    amount: 150,
    url: "https://my.cheddarup.com/c/jvo-event-security-deposit/items",
    /** True when the deposit comes off the balance instead of being returned. */
    appliedToBalance: false,
    balanceDueDays: 14,
  },
  weddings: {
    amount: 500,
    url: "https://my.cheddarup.com/c/security-deposit-for-outdoor-event-copy/items",
    appliedToBalance: true,
    balanceDueDays: 60,
  },
};

/** Terms for a site key ("events" | "weddings"). */
export function depositFor(site) {
  return site === "weddings" ? DEPOSITS.weddings : DEPOSITS.events;
}

/** How much of the deposit comes off the invoice for this site. */
export function depositCreditFor(site) {
  const terms = depositFor(site);
  return terms.appliedToBalance ? terms.amount : 0;
}
