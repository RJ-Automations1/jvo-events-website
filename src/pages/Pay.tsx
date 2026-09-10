/**
 * "Pay your balance" — the page a guest reaches from the pay link in their
 * reminder emails (/pay/:token).
 *
 * Stripe's own hosted invoice page can only take the full amount, so this exists
 * to let a guest pay whatever they can today. It shows what's left, takes any
 * amount up to that, and hands off to Stripe Checkout for the card details — no
 * card data ever touches this page or our server.
 *
 * On return from Checkout it calls /confirm, which credits the payment to the
 * invoice even if Stripe's webhook is slow or lost.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

type Line = { description: string; amount: number };
type Invoice = {
  invoiceId: string;
  number: string | null;
  status: string;
  currency: string;
  total: number;
  paid: number;
  remaining: number;
  eventDate: string | null;
  guestName: string | null;
  lines: Line[];
  hostedInvoiceUrl: string | null;
  payable: boolean;
  minPartial: number;
};

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/** "2026-09-12" → "Saturday, September 12, 2026" without timezone drift. */
function prettyDate(ymd: string | null) {
  if (!ymd) return "";
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return ymd;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function Pay() {
  const { token = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const paidSession = params.get("paid");
  const cancelled = params.get("cancelled");

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [justPaid, setJustPaid] = useState(0);

  const load = useCallback(async () => {
    const r = await fetch(`/api/pay/${encodeURIComponent(token)}`);
    if (!r.ok) {
      setError(
        r.status === 404
          ? "We couldn't find that payment link. It may have expired — please reply to your confirmation email and we'll send a new one."
          : "We're having trouble loading your balance right now. Please try again shortly."
      );
      setLoading(false);
      return null;
    }
    const data: Invoice = await r.json();
    setInvoice(data);
    setLoading(false);
    return data;
  }, [token]);

  // On return from Checkout, credit the payment first, THEN show the balance —
  // otherwise the guest sees their old balance and thinks the payment failed.
  useEffect(() => {
    let cancelledEffect = false;
    (async () => {
      if (paidSession) {
        try {
          const r = await fetch(
            `/api/pay/${encodeURIComponent(token)}/confirm?session=${encodeURIComponent(paidSession)}`
          );
          const data = await r.json();
          if (!cancelledEffect && data?.invoice) {
            setJustPaid(data.invoice.paid - (data.already ? data.invoice.paid : 0));
            setInvoice({ ...data.invoice, minPartial: 500 });
            setLoading(false);
            // Drop ?paid= so a refresh doesn't re-run the confirm.
            params.delete("paid");
            setParams(params, { replace: true });
            return;
          }
        } catch {
          /* fall through to a plain load */
        }
      }
      if (!cancelledEffect) await load();
    })();
    return () => {
      cancelledEffect = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, paidSession]);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    setError("");
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents < invoice.minPartial) {
      setError(`Please enter at least ${usd(invoice.minPartial)}.`);
      return;
    }
    if (cents > invoice.remaining) {
      setError(`That's more than your remaining balance of ${usd(invoice.remaining)}.`);
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(`/api/pay/${encodeURIComponent(token)}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: cents }),
      });
      const data = await r.json();
      if (!r.ok || !data.url) {
        setError("We couldn't start that payment. Please try again.");
        setSubmitting(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("We couldn't start that payment. Please try again.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center text-neutral-500">
        Loading your balance…
      </main>
    );
  }

  if (error && !invoice) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20">
        <h1 className="font-serif text-2xl text-neutral-900">Payment link</h1>
        <p className="mt-4 text-neutral-600">{error}</p>
      </main>
    );
  }

  if (!invoice) return null;

  const settled = invoice.remaining === 0;

  return (
    <main className="mx-auto max-w-xl px-4 py-14">
      <header className="text-center">
        <h1 className="font-serif text-3xl text-neutral-900">JVO Events</h1>
        {invoice.eventDate && (
          <p className="mt-1 text-sm uppercase tracking-[0.2em] text-amber-700">
            {prettyDate(invoice.eventDate)}
          </p>
        )}
      </header>

      {justPaid > 0 && (
        <div className="mt-8 border border-emerald-300 bg-emerald-50 p-4 text-center">
          <p className="font-medium text-emerald-900">Thank you — your payment went through.</p>
        </div>
      )}
      {cancelled && !justPaid && (
        <p className="mt-8 border border-neutral-300 bg-neutral-50 p-4 text-center text-sm text-neutral-600">
          That payment was cancelled. Nothing has been charged.
        </p>
      )}

      <section className="mt-8 border border-neutral-200 bg-white p-6">
        <ul className="space-y-2 text-sm">
          {invoice.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-4 text-neutral-700">
              <span>{l.description}</span>
              <span className="whitespace-nowrap tabular-nums">{usd(l.amount)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 border-t border-neutral-200 pt-4 text-sm">
          <div className="flex justify-between text-neutral-600">
            <dt>Total</dt>
            <dd className="tabular-nums">{usd(invoice.total)}</dd>
          </div>
          <div className="flex justify-between text-neutral-600">
            <dt>Paid so far</dt>
            <dd className="tabular-nums">{usd(invoice.paid)}</dd>
          </div>
          <div className="flex justify-between border-t border-neutral-200 pt-2 text-lg font-semibold text-neutral-900">
            <dt>Remaining</dt>
            <dd className="tabular-nums">{usd(invoice.remaining)}</dd>
          </div>
        </dl>
      </section>

      {settled ? (
        <p className="mt-6 border border-emerald-300 bg-emerald-50 p-4 text-center text-emerald-900">
          This balance is paid in full. Nothing further is owed — we'll see you at your event.
        </p>
      ) : !invoice.payable ? (
        <p className="mt-6 border border-neutral-300 bg-neutral-50 p-4 text-center text-sm text-neutral-600">
          This invoice isn't open for payment right now. Please reply to your
          confirmation email and we'll sort it out.
        </p>
      ) : (
        <form onSubmit={pay} className="mt-6">
          <label htmlFor="amt" className="block text-sm font-medium text-neutral-800">
            How much would you like to pay today?
          </label>
          <p className="mt-1 text-sm text-neutral-500">
            Pay any amount up to {usd(invoice.remaining)} — you can come back and pay
            the rest whenever you like.
          </p>
          <div className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
                $
              </span>
              <input
                id="amt"
                type="number"
                inputMode="decimal"
                min={invoice.minPartial / 100}
                max={invoice.remaining / 100}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={(invoice.remaining / 100).toFixed(2)}
                className="w-full border border-neutral-300 py-3 pl-7 pr-3 tabular-nums focus:border-amber-600 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setAmount((invoice.remaining / 100).toFixed(2))}
              className="whitespace-nowrap border border-neutral-300 px-4 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              Pay in full
            </button>
          </div>

          {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 w-full bg-neutral-900 px-6 py-3 text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            {submitting ? "Taking you to checkout…" : "Continue to payment"}
          </button>
          <p className="mt-3 text-center text-xs text-neutral-500">
            Payments are processed securely by Stripe. Card details never touch our servers.
          </p>
        </form>
      )}
    </main>
  );
}
