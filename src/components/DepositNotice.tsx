import { DEPOSIT, depositLabel } from "@/lib/deposit";

/**
 * The security deposit terms, stated the same way everywhere a couple is about
 * to commit. Paying the deposit — not submitting the form — is what actually
 * holds the date, and the money is non-refundable, so the terms are spelled out
 * *before* the form rather than buried on the Cheddar Up checkout page.
 */
export default function DepositNotice() {
  return (
    <div
      className="px-6 py-6"
      style={{ border: "1px solid rgba(201,169,106,0.35)", background: "rgba(201,169,106,0.06)" }}
    >
      <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 text-center">
        <span
          className="text-[#c9a96a] text-[0.65rem] tracking-[0.25em] uppercase"
          style={{ fontFamily: "'Lato', sans-serif" }}
        >
          Securing Your Date
        </span>
      </div>

      <p
        className="text-white text-center text-lg font-bold mt-2"
        style={{ fontFamily: "'Playfair Display', serif" }}
      >
        {depositLabel} deposit secures your wedding date
      </p>

      <ul className="mt-5 space-y-2.5 max-w-md mx-auto">
        {[
          `Due up front — your date isn't held until the ${depositLabel} deposit is paid.`,
          `Non-refundable, but it comes straight off your total — it's ${depositLabel} toward your wedding, not on top of it.`,
          `The remaining balance is due ${DEPOSIT.balanceDueDays} days before your wedding.`,
        ].map((line) => (
          <li
            key={line}
            className="flex gap-3 text-white/65 text-sm leading-relaxed"
            style={{ fontFamily: "'Lato', sans-serif" }}
          >
            <span className="text-[#c9a96a] shrink-0">✓</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <p
        className="text-white/40 text-xs text-center mt-5"
        style={{ fontFamily: "'Lato', sans-serif" }}
      >
        When you submit the form we'll take you straight to Cheddar Up to pay it.
      </p>
    </div>
  );
}
