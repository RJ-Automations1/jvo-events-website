import { useEffect, useState, type CSSProperties } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useReveal } from "@/lib/useReveal";

/**
 * Daily Briefing — the owner's private news dashboard. Reads the digest built by
 * the server-side news agent (server/news.js) each morning across three tracks:
 * U.S. politics & the presidency, world & war, and AI/tech for consulting.
 *
 * Deliberately not linked from the public navbar — it's a personal dashboard,
 * reachable at /news. Content is fetched from /api/news at load time.
 */

type Article = {
  title: string;
  url: string;
  source: string;
  summary?: string;
  publishedAt?: string | null;
  whyItMatters?: string;
};
type Section = { id: string; label: string; blurb?: string; items: Article[] };
type Digest = {
  ok: boolean;
  ready: boolean;
  generatedAt: string | null;
  ai?: boolean;
  briefing?: string | null;
  curatedBy?: string | null;
  sections: Section[];
};

/** "2026-07-12T06:00:00Z" → "Saturday, July 12 · 6:02 AM". */
function prettyStamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

/** Relative age like "3h ago" / "2d ago" for a headline's publish time. */
function ago(iso?: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function NewsPage() {
  useReveal();
  const [digest, setDigest] = useState<Digest | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/news");
        const data = (await res.json()) as Digest;
        if (alive) setDigest(data);
      } catch {
        if (alive) setError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const cardStyle: CSSProperties = {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "0.35rem",
    padding: "22px 24px",
    display: "block",
    textDecoration: "none",
    transition: "border-color 0.2s ease, background 0.2s ease",
  };

  const sections = digest?.sections ?? [];
  const hasContent = sections.some((s) => s.items.length > 0);

  return (
    <div style={{ background: "#080808", minHeight: "100vh" }}>
      <Navbar />

      {/* Hero */}
      <section className="relative flex items-end" style={{ height: "42vh", minHeight: "320px" }}>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(/manus-storage/DSC00299-HDR.jpg)` }}
        />
        <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.78)" }} />
        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 w-full">
          <p
            className="text-white/40 text-xs tracking-[0.3em] uppercase mb-2"
            style={{ fontFamily: "'Lato', sans-serif" }}
          >
            Your Daily Agent
          </p>
          <h1
            className="text-white text-4xl sm:text-5xl lg:text-6xl font-bold"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            The Morning Briefing
          </h1>
          <div className="accent-divider mt-4" />
          {digest?.generatedAt && (
            <p
              className="text-white/45 text-sm mt-5"
              style={{ fontFamily: "'Lato', sans-serif" }}
            >
              Updated {prettyStamp(digest.generatedAt)}
              {digest.ai && digest.curatedBy ? " · curated by Claude" : ""}
            </p>
          )}
        </div>
      </section>

      <section style={{ background: "#080808", padding: "60px 0 90px" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* States: loading / error / not-ready / content */}
          {loading ? (
            <p
              className="text-white/50 text-center"
              style={{ fontFamily: "'Lato', sans-serif", padding: "40px 0" }}
            >
              Gathering today's headlines…
            </p>
          ) : error ? (
            <p
              className="text-white/50 text-center"
              style={{ fontFamily: "'Lato', sans-serif", padding: "40px 0" }}
            >
              Couldn't load the briefing right now. Please refresh in a moment.
            </p>
          ) : !hasContent ? (
            <div className="text-center" style={{ padding: "40px 0" }}>
              <p className="text-white/60" style={{ fontFamily: "'Lato', sans-serif" }}>
                The first briefing is still being assembled — check back in a minute.
              </p>
            </div>
          ) : (
            <>
              {/* AI overview */}
              {digest?.briefing && (
                <div
                  className="reveal"
                  style={{
                    background: "rgba(201,169,106,0.06)",
                    border: "1px solid rgba(201,169,106,0.28)",
                    borderRadius: "0.35rem",
                    padding: "28px 30px",
                    marginBottom: "48px",
                  }}
                >
                  <div
                    className="text-xs tracking-[0.2em] uppercase mb-3"
                    style={{ fontFamily: "'Lato', sans-serif", color: "#c9a96a" }}
                  >
                    Today's Throughline
                  </div>
                  <p
                    className="text-white/85 text-lg leading-relaxed"
                    style={{ fontFamily: "'Lato', sans-serif" }}
                  >
                    {digest.briefing}
                  </p>
                </div>
              )}

              {/* Tracks */}
              {sections
                .filter((s) => s.items.length > 0)
                .map((section) => (
                  <div key={section.id} className="mb-14">
                    <div className="reveal mb-6">
                      <h2
                        className="text-white text-2xl sm:text-3xl font-bold"
                        style={{ fontFamily: "'Playfair Display', serif" }}
                      >
                        {section.label}
                      </h2>
                      <div className="accent-divider mt-3" style={{ background: "#c9a96a" }} />
                      {section.blurb && (
                        <p
                          className="text-white/45 text-sm mt-3"
                          style={{ fontFamily: "'Lato', sans-serif" }}
                        >
                          {section.blurb}
                        </p>
                      )}
                    </div>

                    <div className="grid gap-4">
                      {section.items.map((a, i) => (
                        <a
                          key={`${section.id}-${i}`}
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="reveal news-card"
                          style={cardStyle}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <h3
                              className="text-white text-lg leading-snug"
                              style={{ fontFamily: "'Lato', sans-serif", fontWeight: 700 }}
                            >
                              {a.title}
                            </h3>
                          </div>

                          {a.whyItMatters && (
                            <p
                              className="text-sm leading-relaxed mt-2"
                              style={{ fontFamily: "'Lato', sans-serif", color: "#c9a96a" }}
                            >
                              Why it matters: {a.whyItMatters}
                            </p>
                          )}
                          {!a.whyItMatters && a.summary && (
                            <p
                              className="text-white/55 text-sm leading-relaxed mt-2"
                              style={{ fontFamily: "'Lato', sans-serif" }}
                            >
                              {a.summary}
                            </p>
                          )}

                          <div
                            className="text-white/35 text-xs mt-3 flex items-center gap-2"
                            style={{ fontFamily: "'Lato', sans-serif" }}
                          >
                            <span className="uppercase tracking-wider">{a.source}</span>
                            {ago(a.publishedAt) && (
                              <>
                                <span>·</span>
                                <span>{ago(a.publishedAt)}</span>
                              </>
                            )}
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                ))}

              <p
                className="text-white/30 text-xs text-center mt-6"
                style={{ fontFamily: "'Lato', sans-serif" }}
              >
                Headlines aggregated from public news feeds. Links open the original sources.
              </p>
            </>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
