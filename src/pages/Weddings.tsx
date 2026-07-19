import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useReveal } from "@/lib/useReveal";
import { VIDEO, VIDEO_POSTER } from "@/lib/media";

/** What's included in the Signature Wedding Package — straight from the package sheet. */
const included: { title: string; items: string[] }[] = [
  {
    title: "Wedding Venue Access",
    items: [
      "Indoor private bridal & groom preparation area",
      "Outdoor ceremony garden",
      "Outdoor kitchen with bar area",
      "Decorative pergola ceremony area",
    ],
  },
  {
    title: "Furniture & Equipment",
    items: [
      "100 white chair covers (included)",
      "4 60-inch banquet tables",
      "125 folding chairs",
      "2 6ft tables · 2 6ft rectangle tables",
      "2 highboy tables",
      "6 steam tables",
      "20 cocktail bar stools",
      "Bluetooth sound system",
      "Wireless microphone",
      "Complete setup & breakdown",
    ],
  },
  {
    title: "Professional Event Staffing",
    items: [
      "6 professional event staff members",
      "10-hour service day",
      "Chair & table setup",
      "Ceremony setup",
      "Indoor & outdoor ceremony preparation",
      "Event-day support",
      "Post-event breakdown & cleanup",
    ],
  },
];

/** The all-inclusive Signature Wedding Package base price. */
const BASE_PACKAGE = 4000;

type Enhancement = {
  label: string;
  price: number;
  image: string;
  desc: string;
  /** Per-unit item — show a quantity stepper and multiply the price by count. */
  perUnit?: boolean;
  /** Short unit noun used in the summary, e.g. "table", "chair". */
  unit?: string;
};

/**
 * Priced enhancements — mirrored exactly from the JVO Weddings JotForm add-ons
 * (name, price, description, and photo), so the site and the form match.
 */
const pricedEnhancements: Enhancement[] = [
  {
    label: "Premium Tent Package",
    price: 1500,
    image: "/manus-storage/weddings/premium-tent.png",
    desc: "Premium event tent, 20′ × 40′.",
  },
  {
    label: "Pergola Decor & Luxury Floral Wall",
    price: 850,
    image: "/manus-storage/weddings/pergola-floral-wall.png",
    desc: "Pergola dressed with linens and a floral wall. Add a touch of color at no extra charge.",
  },
  {
    label: "Wedding Rehearsal",
    price: 800,
    image: "/manus-storage/weddings/wedding-rehearsal.jpg",
    desc: "Wedding venue rental for your rehearsal (5 hrs).",
  },
  {
    label: "Licensed Wedding Officiant",
    price: 450,
    image: "/manus-storage/weddings/officiant.png",
    desc: "A licensed officiant to conduct your wedding.",
  },
  {
    label: "Patio Enclosure",
    price: 200,
    image: "/manus-storage/weddings/patio-enclosure.jpg",
    desc: "Installed seasonally, Oct 15 – Apr 15. Off-season requests may add a $200 fee.",
  },
  {
    label: "Round Tables",
    price: 15,
    image: "/manus-storage/weddings/round-table.jpg",
    desc: "60″ round table — seats 6 to 8 guests.",
    perUnit: true,
    unit: "table",
  },
  {
    label: "Rectangle Tables",
    price: 10,
    image: "/manus-storage/weddings/rectangle-table.jpg",
    desc: "6 ft folding rectangle table.",
    perUnit: true,
    unit: "table",
  },
  {
    label: "Additional Chairs",
    price: 2,
    image: "/manus-storage/weddings/folding-chairs.jpg",
    desc: "Extra folding chairs beyond the 100 included — $2 per chair.",
    perUnit: true,
    unit: "chair",
  },
];

const fmtUSD = (n: number) => "$" + n.toLocaleString("en-US");

/** The live JVO Weddings JotForm (public form ID). */
const JOTFORM_ID = "261945498570168";

/**
 * Field "unique names" in the JotForm that the estimate is prefilled into.
 *
 * These MUST match the Unique Name of each field in the JotForm builder
 * (Field → Properties → Advanced → "Field Details" → Unique Name). If a name
 * doesn't match a real field, that value is simply ignored — nothing breaks.
 * Add three fields to the form (e.g. hidden / short-text) named accordingly:
 */
const PREFILL_FIELDS = {
  package: "package",
  enhancements: "enhancements",
  estimatedTotal: "estimatedTotal",
} as const;

/** Enhancements quoted per event — the "Free / personalized quote" add-ons from the form. */
const customQuoteEnhancements: { label: string; image: string; desc: string }[] = [
  {
    label: "Wedding Decorator",
    image: "/manus-storage/weddings/wedding-decorator.png",
    desc: "Bring your vision to life with our preferred decorator — elegant and timeless to modern and luxurious. Pricing varies by your décor selections; select this and the decorator will reach out with a personalized quote.",
  },
  {
    label: "Wedding Planner / Event Coordinator",
    image: "/manus-storage/weddings/wedding-planner.jpg",
    desc: "Full-service, partial, or day-of coordination from our preferred planner. Pricing varies by level of service; select this and the planner will reach out with a personalized quote.",
  },
];

/** Trusted preferred vendors we can connect you with. */
const preferredVendors: string[] = [
  "Professional Wedding Photography",
  "Wedding Videography",
  "DJ & Master of Ceremonies",
  "Live Music & Entertainment",
  "Full-Service Catering Coordination",
  "Bartending Services",
  "Licensed Bartenders",
  "Photo Booth Experience",
  "Custom Wedding",
];

/** Why couples choose JVO. */
const reasons: string[] = [
  "Elegant indoor and outdoor wedding ceremony spaces",
  "125 premium covered chairs included",
  "Professional event staff included",
  "Beautiful pergola ceremony setting",
  "Outdoor kitchen",
  "Affordable luxury wedding venue",
  "Access to trusted preferred wedding vendors",
  "Stress-free setup and breakdown",
];

/** A chosen line item — an enhancement plus how many were added and its subtotal. */
type ChosenItem = Enhancement & { index: number; count: number; subtotal: number };

/**
 * Live estimate builder — starts at the $4,000 Signature Package and adds the
 * chosen enhancements (with quantities for per-unit items like tables and
 * chairs), updating the running total instantly.
 */
function EstimateCalculator({
  counts,
  setCount,
  chosen,
  total,
}: {
  counts: Record<number, number>;
  setCount: (i: number, n: number) => void;
  chosen: ChosenItem[];
  total: number;
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-5">
      {/* Add-on cards */}
      <div className="lg:col-span-3">
        <p
          className="text-white/45 text-xs tracking-[0.2em] uppercase mb-4"
          style={{ fontFamily: "'Lato', sans-serif" }}
        >
          Add the enhancements you'd like
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {pricedEnhancements.map((e, i) => {
            const count = counts[i] ?? 0;
            const on = count > 0;
            return (
              <div
                key={e.label}
                className="flex flex-col overflow-hidden transition-colors"
                style={{
                  border: on ? "1px solid #c9a96a" : "1px solid rgba(255,255,255,0.12)",
                  background: on ? "rgba(201,169,106,0.08)" : "rgba(255,255,255,0.03)",
                }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    height: 150,
                    backgroundImage: `url(${e.image})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
                <div className="flex flex-col grow p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className="text-white text-base font-semibold leading-snug"
                      style={{ fontFamily: "'Playfair Display', serif" }}
                    >
                      {e.label}
                    </span>
                    <span
                      className="text-white font-bold shrink-0 text-right leading-snug"
                      style={{ fontFamily: "'Lato', sans-serif" }}
                    >
                      {fmtUSD(e.price)}
                      {e.perUnit && (
                        <span className="block text-white/40 text-[0.65rem] font-normal">
                          per {e.unit}
                        </span>
                      )}
                    </span>
                  </div>

                  <p
                    className="text-white/50 text-xs leading-relaxed mt-2 grow"
                    style={{ fontFamily: "'Lato', sans-serif" }}
                  >
                    {e.desc}
                  </p>

                  {e.perUnit ? (
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setCount(i, Math.max(0, count - 1))}
                          disabled={count === 0}
                          aria-label={`Remove one ${e.unit}`}
                          className="grid place-items-center text-lg leading-none disabled:opacity-30"
                          style={{
                            width: 32,
                            height: 32,
                            border: "1px solid rgba(255,255,255,0.25)",
                            color: "#fff",
                          }}
                        >
                          −
                        </button>
                        <span
                          className="text-white font-bold w-6 text-center"
                          style={{ fontFamily: "'Lato', sans-serif" }}
                        >
                          {count}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCount(i, count + 1)}
                          aria-label={`Add one ${e.unit}`}
                          className="grid place-items-center text-lg leading-none"
                          style={{
                            width: 32,
                            height: 32,
                            border: "1px solid #c9a96a",
                            background: "#c9a96a",
                            color: "#0b0b0b",
                          }}
                        >
                          +
                        </button>
                      </div>
                      {on && (
                        <span
                          className="text-white/80 text-sm font-bold"
                          style={{ fontFamily: "'Lato', sans-serif" }}
                        >
                          {fmtUSD(e.price * count)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCount(i, on ? 0 : 1)}
                      aria-pressed={on}
                      className="mt-4 py-2.5 text-sm font-semibold tracking-wide uppercase transition-colors"
                      style={{
                        border: on ? "1px solid #c9a96a" : "1px solid rgba(255,255,255,0.25)",
                        background: on ? "#c9a96a" : "transparent",
                        color: on ? "#0b0b0b" : "#fff",
                        fontFamily: "'Lato', sans-serif",
                      }}
                    >
                      {on ? "✓ Added" : "Add"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live summary */}
      <div className="lg:col-span-2">
        <div
          className="lg:sticky lg:top-24 p-7"
          style={{ border: "1px solid rgba(201,169,106,0.35)", background: "rgba(201,169,106,0.06)" }}
        >
          <span
            className="text-[#c9a96a] text-[0.65rem] tracking-[0.25em] uppercase block mb-4"
            style={{ fontFamily: "'Lato', sans-serif" }}
          >
            Your Estimate
          </span>

          <div className="flex items-baseline justify-between gap-3">
            <div>
              <div className="text-white font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
                Signature Wedding Package
              </div>
              <div className="text-white/45 text-xs mt-1" style={{ fontFamily: "'Lato', sans-serif" }}>
                Wedding venue · furniture · full staffing
              </div>
            </div>
            <div className="text-white font-bold shrink-0" style={{ fontFamily: "'Lato', sans-serif" }}>
              {fmtUSD(BASE_PACKAGE)}
            </div>
          </div>

          <div className="accent-divider my-5" />

          {chosen.length === 0 ? (
            <p className="text-white/40 text-sm" style={{ fontFamily: "'Lato', sans-serif" }}>
              No enhancements added yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {chosen.map((e) => (
                <li
                  key={e.label}
                  className="flex items-baseline justify-between gap-3 text-sm"
                  style={{ fontFamily: "'Lato', sans-serif" }}
                >
                  <span className="text-white/70">
                    {e.label}
                    {e.perUnit ? ` × ${e.count}` : ""}
                  </span>
                  <span className="text-white/70 shrink-0">{fmtUSD(e.subtotal)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="accent-divider my-5" />

          <div className="flex items-baseline justify-between gap-3">
            <span
              className="text-white text-sm tracking-wide uppercase"
              style={{ fontFamily: "'Lato', sans-serif" }}
            >
              Estimated Total
            </span>
            <span className="text-white text-3xl font-bold shrink-0" style={{ fontFamily: "'Lato', sans-serif" }}>
              {fmtUSD(total)}
            </span>
          </div>

          <p className="text-white/40 text-xs leading-relaxed mt-4" style={{ fontFamily: "'Lato', sans-serif" }}>
            Estimate only. Custom-quote enhancements and preferred-vendor services are priced
            separately.
          </p>

          <a href="#reserve" className="btn-white w-full text-center mt-6 inline-block">
            Continue to Booking
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Embedded JotForm reservation form. The couple's live estimate — the Signature
 * Package plus any enhancements they tapped — is carried into the form through
 * URL prefill, so their inquiry arrives with the total already attached.
 */
function ReserveForm({
  chosen,
  total,
}: {
  chosen: ChosenItem[];
  total: number;
}) {
  const src = useMemo(() => {
    const p = new URLSearchParams();
    p.set(PREFILL_FIELDS.package, `Signature Wedding Package (${fmtUSD(BASE_PACKAGE)})`);
    if (chosen.length)
      p.set(
        PREFILL_FIELDS.enhancements,
        chosen.map((e) => (e.perUnit ? `${e.label} ×${e.count}` : e.label)).join(", "),
      );
    p.set(PREFILL_FIELDS.estimatedTotal, fmtUSD(total));
    return `https://form.jotform.com/${JOTFORM_ID}?${p.toString()}`;
  }, [chosen, total]);

  // JotForm's embed handler auto-resizes the iframe to match the form's height.
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://cdn.jotform.com/s/umd/latest/for-form-embed-handler.js";
    script.async = true;
    script.onload = () =>
      (
        window as unknown as { jotformEmbedHandler?: (sel: string, origin: string) => void }
      ).jotformEmbedHandler?.(`iframe[id='JotFormIFrame-${JOTFORM_ID}']`, "https://form.jotform.com");
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <iframe
      id={`JotFormIFrame-${JOTFORM_ID}`}
      title="Reserve your JVO wedding date"
      src={src}
      allow="geolocation; microphone; camera; fullscreen; payment"
      scrolling="no"
      style={{ width: "1px", minWidth: "100%", height: 1100, border: "none", background: "transparent" }}
    />
  );
}

export default function Weddings() {
  useReveal();
  const heroRef = useRef<HTMLVideoElement>(null);

  /**
   * Wedding-specific page title + meta description. The shared index.html targets
   * "event space", which buries the primary keyword on this page — this swaps in
   * wedding-venue wording (and restores the default when navigating away).
   */
  useEffect(() => {
    const prevTitle = document.title;
    const tag = document.querySelector('meta[name="description"]');
    const prevDesc = tag?.getAttribute("content") ?? "";
    document.title =
      "Wedding Venue in Jonesboro, GA | Indoor & Outdoor Wedding Venue Near Atlanta | JVO Events";
    tag?.setAttribute(
      "content",
      "JVO Events is an elegant indoor & outdoor wedding venue in Jonesboro, GA, minutes from Atlanta. All-inclusive wedding packages from $4,000 with professional event staff, ceremony & reception space, setup and breakdown included."
    );
    return () => {
      document.title = prevTitle;
      tag?.setAttribute("content", prevDesc);
    };
  }, []);

  // Shared estimate state — item index → quantity (0/1 for fixed items, 0..N for per-unit).
  const [counts, setCounts] = useState<Record<number, number>>({});
  const setCount = (i: number, n: number) => setCounts((c) => ({ ...c, [i]: n }));
  const chosen: ChosenItem[] = pricedEnhancements
    .map((e, index) => {
      const count = counts[index] ?? 0;
      return { ...e, index, count, subtotal: e.price * count };
    })
    .filter((e) => e.count > 0);
  const total = BASE_PACKAGE + chosen.reduce((sum, e) => sum + e.subtotal, 0);

  return (
    <div style={{ background: "#080808", minHeight: "100vh" }}>
      <Navbar />

      {/* Video hero — a real JVO pergola wedding. */}
      <section className="relative flex items-center overflow-hidden" style={{ minHeight: "82vh" }}>
        <video
          ref={heroRef}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          poster={VIDEO_POSTER.wedding}
        >
          <source src={VIDEO.wedding} type="video/mp4" />
        </video>
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,8,8,0.7) 0%, rgba(8,8,8,0.5) 45%, rgba(8,8,8,0.92) 100%)",
          }}
        />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="max-w-2xl">
            <p className="text-white/55 text-xs sm:text-sm tracking-[0.3em] uppercase mb-4" style={{ fontFamily: "'Lato', sans-serif" }}>
              Elegant Wedding Venue · Jonesboro, GA · Metro Atlanta
            </p>
            <h1 className="text-white text-5xl sm:text-6xl font-bold leading-[1.05]" style={{ fontFamily: "'Playfair Display', serif" }}>
              Say “I do” at JVO
            </h1>
            <div className="accent-divider mt-6" />
            <p className="text-white/70 text-base sm:text-lg leading-relaxed mt-6 max-w-xl" style={{ fontFamily: "'Lato', sans-serif" }}>
              An elegant indoor &amp; outdoor wedding venue in Jonesboro, GA — just minutes
              from Atlanta — with professional event staff and premium amenities. A seamless
              wedding ceremony and reception from setup through breakdown, so you can focus on
              making memories.
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-9">
              <a href="#reserve" className="btn-white">
                Book Your Wedding
              </a>
            </div>
            <p className="text-[#c9a96a] text-base sm:text-lg tracking-[0.25em] uppercase mt-8" style={{ fontFamily: "'Lato', sans-serif" }}>
              Packages starting at $4,000
            </p>
          </div>
        </div>
      </section>

      {/* Intro */}
      <section style={{ background: "#080808", padding: "90px 0" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="reveal text-[#c9a96a] text-base sm:text-lg tracking-[0.3em] uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
            One Wedding Venue · Ceremony &amp; Reception
          </p>
          <h2 className="reveal text-white text-3xl sm:text-4xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
            Celebrate your special day, all in one place
          </h2>
          <div className="reveal accent-divider mx-auto mt-5" />
          <p className="reveal text-white/60 text-base sm:text-lg leading-relaxed mt-6" style={{ fontFamily: "'Lato', sans-serif" }}>
            Our Signature Wedding Package combines a stunning indoor and outdoor wedding
            venue, professional event staff, premium amenities, and personalized service from
            setup to breakdown. Whether you're planning an intimate ceremony or a grand
            celebration, JVO Events provides a seamless wedding experience, allowing you to
            relax and focus on creating unforgettable memories while we take care of the
            details.
          </p>
        </div>
      </section>

      {/* What's included */}
      <section style={{ background: "#0b0b0b", padding: "90px 0" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="reveal text-[#c9a96a] text-sm sm:text-base tracking-[0.3em] uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
              All-Inclusive Wedding Package
            </p>
            <h2 className="reveal text-white text-3xl sm:text-4xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
              Everything included for <span style={{ color: "#c9a96a" }}>$4,000</span>
            </h2>
            <div className="reveal accent-divider mx-auto mt-5" />
            <p className="reveal text-white/55 text-base sm:text-lg leading-relaxed mt-6 max-w-2xl mx-auto" style={{ fontFamily: "'Lato', sans-serif" }}>
              Our Signature Wedding Package includes the wedding venue, tables, chairs, and
              professional event staff. Personalize your wedding by selecting from our optional
              enhancements below to create a celebration that's uniquely yours.
            </p>
          </div>

          <div className="reveal grid gap-px md:grid-cols-3" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {included.map((group) => (
              <div key={group.title} className="p-8" style={{ background: "#0b0b0b" }}>
                <h3 className="text-white text-lg font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
                  {group.title}
                </h3>
                <div className="accent-divider mt-4 mb-5" />
                <ul className="space-y-3">
                  {group.items.map((item) => (
                    <li key={item} className="flex gap-3 text-white/60 text-sm leading-relaxed" style={{ fontFamily: "'Lato', sans-serif" }}>
                      <span className="text-[#c9a96a] shrink-0">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Build your estimate — interactive calculator */}
      <section id="estimate" style={{ background: "#080808", padding: "90px 0" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="reveal text-[#c9a96a] text-base sm:text-lg tracking-[0.3em] uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
              Make It Yours
            </p>
            <h2 className="reveal text-white text-3xl sm:text-4xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
              Build your wedding estimate
            </h2>
            <div className="reveal accent-divider mx-auto mt-5" />
            <p className="reveal text-white/55 text-base sm:text-lg leading-relaxed mt-6 max-w-2xl mx-auto" style={{ fontFamily: "'Lato', sans-serif" }}>
              Start with the $4,000 Signature Package, then tap any enhancement to add it — your
              estimated total updates as you go.
            </p>
          </div>

          <div className="reveal">
            <EstimateCalculator counts={counts} setCount={setCount} chosen={chosen} total={total} />
          </div>

          {/* Custom-quote enhancements */}
          <div
            className="reveal mt-6 p-8"
            style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
          >
            <span className="text-[#c9a96a] text-[0.65rem] tracking-[0.25em] uppercase block mb-1" style={{ fontFamily: "'Lato', sans-serif" }}>
              Tailored to Your Day · Personalized Quote
            </span>
            <h3 className="text-white text-xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
              Design &amp; planning services
            </h3>
            <div className="accent-divider mt-4 mb-6" />
            <div className="grid gap-5 sm:grid-cols-2">
              {customQuoteEnhancements.map((c) => (
                <div
                  key={c.label}
                  className="flex flex-col overflow-hidden"
                  style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)" }}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      height: 160,
                      backgroundImage: `url(${c.image})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="text-white text-base font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>
                        {c.label}
                      </h4>
                      <span className="text-[#c9a96a] text-[0.65rem] tracking-[0.2em] uppercase shrink-0 mt-1" style={{ fontFamily: "'Lato', sans-serif" }}>
                        Quote
                      </span>
                    </div>
                    <p className="text-white/55 text-xs leading-relaxed mt-2" style={{ fontFamily: "'Lato', sans-serif" }}>
                      {c.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Preferred vendors */}
      <section style={{ background: "#0b0b0b", padding: "90px 0" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="reveal text-[#c9a96a] text-base sm:text-lg tracking-[0.3em] uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
              Trusted Partners
            </p>
            <h2 className="reveal text-white text-3xl sm:text-4xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
              Preferred vendor services
            </h2>
            <div className="reveal accent-divider mx-auto mt-5" />
            <p className="reveal text-white/55 text-sm sm:text-base leading-relaxed mt-5 max-w-2xl mx-auto" style={{ fontFamily: "'Lato', sans-serif" }}>
              We'll connect you with the trusted professionals we work with, so every detail
              of your day is covered.
            </p>
          </div>

          <div className="reveal grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {preferredVendors.map((v) => (
              <div
                key={v}
                className="flex items-center gap-3 px-5 py-4 text-white/75 text-sm"
                style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.025)", fontFamily: "'Lato', sans-serif" }}
              >
                <span className="text-[#c9a96a] shrink-0">✓</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why couples choose JVO */}
      <section style={{ background: "#080808", padding: "90px 0" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            {/* Image */}
            <div
              className="reveal w-full"
              style={{
                minHeight: "420px",
                backgroundImage: "url(/manus-storage/wedding-couple.jpg)",
                backgroundSize: "cover",
                backgroundPosition: "center",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
            {/* Reasons */}
            <div className="reveal">
              <p className="text-[#c9a96a] text-base sm:text-lg tracking-[0.3em] uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
                Why Couples Choose JVO
              </p>
              <h2 className="text-white text-3xl sm:text-4xl font-bold leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
                One-stop shop for outdoor weddings
              </h2>
              <div className="accent-divider mt-5" />
              <p className="text-white/60 text-base leading-relaxed mt-5" style={{ fontFamily: "'Lato', sans-serif" }}>
                Host your wedding ceremony and reception at the same wedding venue near
                Atlanta — at an affordable price.
              </p>
              <ul className="mt-7 space-y-3">
                {reasons.map((r) => (
                  <li key={r} className="flex gap-3 text-white/70 text-sm sm:text-base" style={{ fontFamily: "'Lato', sans-serif" }}>
                    <span className="text-[#c9a96a] shrink-0">✓</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Imagine your wedding — closing CTA */}
      <section style={{ background: "#0b0b0b", padding: "100px 0" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="reveal text-white/40 text-xs tracking-[0.3em] uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
            Imagine Your Wedding at JVO
          </p>
          <h2 className="reveal text-white text-3xl sm:text-4xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
            A refined, worry-free celebration
          </h2>
          <div className="reveal accent-divider mx-auto mt-5" />
          <p className="reveal text-white/60 text-base sm:text-lg leading-relaxed mt-6" style={{ fontFamily: "'Lato', sans-serif" }}>
            Picture your guests arriving to a beautifully decorated pergola ceremony surrounded
            by elegant seating and luxurious floral décor. After exchanging vows, family and
            friends continue celebrating in our stylish wedding reception venue while our
            professional team
            manages every detail behind the scenes. From setup to final cleanup, JVO Event Space
            makes your wedding unforgettable.
          </p>
          <div className="reveal flex flex-wrap items-center justify-center gap-4 mt-9">
            <a href="#reserve" className="btn-white">
              Book Your Wedding
            </a>
            <Link to="/contact" className="btn-outline">
              Ask a Question
            </Link>
          </div>
        </div>
      </section>

      {/* Reserve your date — embedded JotForm, prefilled with the live estimate */}
      <section id="reserve" style={{ background: "#080808", padding: "90px 0", scrollMarginTop: "80px" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <p className="reveal text-white/40 text-xs tracking-[0.3em] uppercase mb-3" style={{ fontFamily: "'Lato', sans-serif" }}>
              Let's Make It Official
            </p>
            <h2 className="reveal text-white text-3xl sm:text-4xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
              Reserve your wedding date
            </h2>
            <div className="reveal accent-divider mx-auto mt-5" />
            <p className="reveal text-white/55 text-base sm:text-lg leading-relaxed mt-6" style={{ fontFamily: "'Lato', sans-serif" }}>
              Tell us about your day and we'll be in touch. Your{" "}
              <span style={{ color: "#c9a96a", fontWeight: 700 }}>{fmtUSD(total)}</span> estimate
              {chosen.length > 0
                ? ` and ${chosen.length} selected enhancement${chosen.length > 1 ? "s" : ""}`
                : ""}{" "}
              travel with your inquiry.
            </p>
          </div>

          <div className="reveal" style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", padding: "8px" }}>
            <ReserveForm chosen={chosen} total={total} />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
