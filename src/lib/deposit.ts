import { IS_WEDDINGS_SITE } from "@/lib/siteMode";

/**
 * Security deposit terms — they differ per site, so keep them in one place
 * rather than scattering the amount and the Cheddar Up link across pages.
 *
 * Events: $150, refundable after the event if the space is returned clean.
 * Weddings: $500, non-refundable, but credited against the wedding balance.
 *
 * These figures are quoted to couples before they pay, so treat them as
 * contract terms — change them only when JVO changes the policy.
 */
type DepositTerms = {
  /** Dollar amount, for display and arithmetic against the estimate. */
  amount: number;
  /** Cheddar Up checkout the guest is sent to after submitting the form. */
  url: string;
  /** True if the deposit comes off the event balance instead of being returned. */
  appliedToBalance: boolean;
  /** How many days before the event the remaining balance is due. */
  balanceDueDays: number;
};

export const DEPOSIT: DepositTerms = IS_WEDDINGS_SITE
  ? {
      amount: 500,
      url: "https://my.cheddarup.com/c/security-deposit-for-outdoor-event-copy/items",
      appliedToBalance: true,
      balanceDueDays: 60,
    }
  : {
      amount: 150,
      url: "https://my.cheddarup.com/c/jvo-event-security-deposit/items",
      appliedToBalance: false,
      balanceDueDays: 14,
    };

/** "$500" — the deposit amount, formatted for display. */
export const depositLabel = `$${DEPOSIT.amount.toLocaleString("en-US")}`;
