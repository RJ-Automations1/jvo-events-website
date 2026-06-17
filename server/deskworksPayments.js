/**
 * Deskworks invoice / payment status adapter.
 * -------------------------------------------
 * The 30-day payment reminder needs to know whether a booking's full balance has
 * been paid. That truth lives in Deskworks (the invoice the guest pays through).
 *
 * ⚠️ STUB — not wired to Deskworks yet. We don't have a write/read-invoice
 * Deskworks API key, so this returns { configured:false, paidInFull:null }
 * ("unknown"). The reminder sweep treats "unknown" as "don't send" by default,
 * so nothing wrong goes out until this is implemented.
 *
 * ── To implement once the Deskworks API key + invoice endpoint are known ──────
 * 1. Set DESKWORKS_API_KEY + DESKWORKS_BASE_URL (already used by deskworks.js).
 * 2. Find the booking's invoice in Deskworks (by reservation id, email, or the
 *    submissionId we can stamp on the reservation), read its balance/paid state.
 * 3. Return:
 *      {
 *        configured: true,
 *        paidInFull: <true|false>,
 *        balanceDue: <number|null>,   // remaining balance, for the email
 *        invoiceUrl: <string|null>,   // Deskworks "pay now" link, for the email
 *      }
 * 4. Flip PAYMENT_REMINDERS_ENABLED=true on Render.
 */

const API_KEY = process.env.DESKWORKS_API_KEY || "";
const BASE_URL = (process.env.DESKWORKS_BASE_URL || "").replace(/\/$/, "");

/** True once Deskworks credentials exist AND the lookup below is implemented. */
export function paymentsConfigured() {
  // Keep returning false until the real lookup is filled in, even if the key is
  // present — otherwise the sweep would assume every unknown booking is unpaid.
  return false; // TODO: return Boolean(API_KEY && BASE_URL) when implemented.
}

/**
 * Look up a booking's payment status in Deskworks.
 * @param {object} booking - { name, email, eventDate, reservationId?, submissionId? }
 * @returns {Promise<{configured:boolean, paidInFull:boolean|null, balanceDue:number|null, invoiceUrl:string|null}>}
 */
export async function getPaymentStatus(booking) {
  if (!paymentsConfigured()) {
    return { configured: false, paidInFull: null, balanceDue: null, invoiceUrl: null };
  }

  // ── TODO: real Deskworks invoice lookup goes here ──────────────────────────
  // const res = await fetch(`${BASE_URL}/.../invoices?...`, {
  //   headers: { Authorization: `Bearer ${API_KEY}` },
  // });
  // const inv = await res.json();
  // return {
  //   configured: true,
  //   paidInFull: inv.balanceDue === 0,
  //   balanceDue: inv.balanceDue,
  //   invoiceUrl: inv.payUrl,
  // };
  void booking; void API_KEY; void BASE_URL;
  return { configured: false, paidInFull: null, balanceDue: null, invoiceUrl: null };
}
