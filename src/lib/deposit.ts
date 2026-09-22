import { IS_WEDDINGS_SITE } from "@/lib/siteMode";
import { depositFor } from "@shared/deposits.js";

/**
 * Security deposit terms for THIS build of the site.
 *
 * The figures live in shared/deposits.js because the server bills against them
 * too — the Stripe invoice is the wedding total minus this deposit, so a number
 * that drifted between the page and the invoice would show couples one balance
 * and charge them another.
 *
 * Events: $150, refundable after the event, separate from the rental rate.
 * Weddings: $500, non-refundable, but credited against the wedding balance.
 */
export const DEPOSIT = depositFor(IS_WEDDINGS_SITE ? "weddings" : "events");

/** "$500" — the deposit amount, formatted for display. */
export const depositLabel = `$${DEPOSIT.amount.toLocaleString("en-US")}`;
