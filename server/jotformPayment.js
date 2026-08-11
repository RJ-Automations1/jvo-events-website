/**
 * Reading the money out of a JotForm submission.
 * ----------------------------------------------
 * The weddings form carries a JotForm *payment/products* element: the couple
 * ticks the All-Inclusive Package and any enhancements (rehearsal, tent,
 * pergola florals, officiant, patio enclosure, tables, chairs) and JotForm
 * totals it for them. That total is what we invoice against.
 *
 * JotForm has shipped several shapes for this field over the years, and the one
 * an account gets depends on when its form was built, so this reads defensively
 * and tries each known shape rather than assuming one.
 *
 * REFUSING TO GUESS IS THE POINT. Invoices send automatically with no human
 * review, so a total we merely *think* we understood becomes a wrong bill in a
 * customer's inbox. Every function here returns null rather than a guess, and
 * the caller treats null as "don't invoice, tell staff".
 */

/** Pull a number out of "1,500.00" / "$1,500.00" / 1500. Null if not a number. */
function money(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Products inside a paymentArray come as display strings, e.g.
 *   "Premium Tent Package (Amount: 1500.00, Quantity: 1)"
 * Parse them for the staff-facing line items. Best-effort: the TOTAL is what we
 * bill on, so a line we can't parse costs us readability, not correctness.
 */
function parseProductLines(products) {
  const list = Array.isArray(products) ? products : [products];
  const out = [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const name = raw.split("(")[0].trim();
    const amount = money((raw.match(/Amount:\s*([0-9.,]+)/i) || [])[1]);
    const qty = Number.parseInt((raw.match(/Quantity:\s*(\d+)/i) || [])[1] || "1", 10);
    if (!name) continue;
    out.push({ name, amount, quantity: Number.isFinite(qty) ? qty : 1 });
  }
  return out;
}

/**
 * Find the payment total in a parsed JotForm rawRequest.
 *
 * @param {object} raw - the parsed rawRequest object from the webhook
 * @returns {{total:number, products:Array, source:string}|null}
 *   null when no total could be read with confidence.
 */
export function readJotformPayment(raw) {
  if (!raw || typeof raw !== "object") return null;

  for (const [key, value] of Object.entries(raw)) {
    // Shape 1 — the modern one: a field holding { paymentArray: "<json>" }.
    const payArray =
      value && typeof value === "object" && typeof value.paymentArray === "string"
        ? value.paymentArray
        : null;
    if (payArray) {
      try {
        const parsed = JSON.parse(payArray);
        const total = money(parsed.total);
        if (total !== null) {
          return { total, products: parseProductLines(parsed.product), source: `${key}.paymentArray` };
        }
      } catch {
        /* fall through to the other shapes */
      }
    }

    // Shape 2 — the field is itself an object carrying a total.
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const total = money(value.total);
      if (total !== null) {
        return { total, products: parseProductLines(value.product ?? []), source: `${key}.total` };
      }
    }

    // Shape 3 — the whole payment blob arrives as a JSON string.
    if (typeof value === "string" && value.includes('"total"')) {
      try {
        const parsed = JSON.parse(value);
        const total = money(parsed.total);
        if (total !== null) {
          return { total, products: parseProductLines(parsed.product ?? []), source: `${key} (json)` };
        }
      } catch {
        /* not JSON after all */
      }
    }
  }

  return null;
}

/**
 * The wedding balance to invoice: everything they selected, minus the deposit
 * they already paid on Cheddar Up (non-refundable, but credited to the total).
 *
 * @returns {{invoice:number, total:number, credit:number}|null}
 */
export function weddingBalance(payment, depositCredit) {
  if (!payment || typeof payment.total !== "number") return null;
  const credit = Number(depositCredit) || 0;
  return {
    total: payment.total,
    credit,
    invoice: Math.max(0, Math.round((payment.total - credit) * 100) / 100),
  };
}
