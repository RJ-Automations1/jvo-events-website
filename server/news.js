// Daily news agent — gathers a morning briefing from free RSS feeds across the
// three tracks the owner follows (US politics & presidential, world & war, and
// AI/tech for the consulting side), then optionally has Claude curate it into a
// short "why it matters" digest. Runs entirely inside the Render web service on
// a daily cron (see server.js); no external service to keep alive.
//
// Layered design so it always works:
//   • No API key  → raw, de-duplicated headlines grouped by track.
//   • ANTHROPIC_API_KEY set → Claude picks the top items per track and writes a
//     brief overview + one-line "why it matters" notes. Falls back to the raw
//     digest on any AI error, so a bad key or outage never blanks the page.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Where the last-built digest is cached on disk, so a process restart serves
// yesterday's briefing instantly until the next refresh. Best-effort — the
// filesystem is ephemeral on Render, and we always refresh on boot anyway.
const DATA_DIR = path.join(__dirname, "..", "data");
const CACHE_FILE = path.join(DATA_DIR, "news-digest.json");

// How many headlines to keep per track after de-duping and sorting by recency.
const ITEMS_PER_TRACK = Number(process.env.NEWS_ITEMS_PER_TRACK || 7);

// News tracks → their source feeds. All are free, public RSS/Atom feeds that
// need no API key. Google News RSS is the backbone (reliable from datacenter
// IPs and query-targetable to the owner's exact interests); mainstream
// publisher feeds are added as supplements. Any feed that's unreachable simply
// drops out — the parser fails soft per-feed. Retune coverage by editing here.
const gnews = (query) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

const TRACKS = [
  {
    id: "politics",
    label: "U.S. Politics & The Presidency",
    blurb: "Washington, the White House, Congress, and campaigns.",
    feeds: [
      gnews("US politics when:1d"),
      gnews("president White House when:1d"),
      gnews("Congress Senate legislation when:2d"),
    ],
  },
  {
    id: "world",
    label: "World & War",
    blurb: "Global affairs, conflict, and international developments.",
    feeds: [
      gnews("world news when:1d"),
      gnews("war conflict military when:1d"),
      "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
    ],
  },
  {
    id: "ai",
    label: "AI & Tech",
    blurb: "AI industry moves worth tracking for consulting work.",
    feeds: [
      gnews("artificial intelligence when:2d"),
      gnews("AI startup OR enterprise AI OR AI regulation when:2d"),
      "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    ],
  },
];

// In-memory copy of the most recent digest (source of truth between refreshes).
let currentDigest = null;

/* ----------------------------- RSS/Atom parsing ---------------------------- */

/** Decode the handful of XML/HTML entities that show up in feed text. */
function decodeEntities(s) {
  if (!s) return "";
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#8217;/g, "’")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Strip HTML tags and collapse whitespace, then truncate for a clean summary. */
function cleanText(s, max = 240) {
  const t = decodeEntities(String(s || ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

/** Pull the inner text of the first <tag>…</tag> in a block. */
function tagText(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? decodeEntities(m[1]).trim() : "";
}

/**
 * Parse a feed body (RSS 2.0 <item> or Atom <entry>) into normalized articles.
 * Deliberately regex-based to avoid a dependency; handles the common shapes of
 * the mainstream feeds we use (CDATA, Atom <link href>, pubDate/updated).
 */
export function parseFeed(xml, sourceLabel) {
  const items = [];
  const isAtom = /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
  const blockRe = isAtom ? /<entry[\s>]([\s\S]*?)<\/entry>/gi : /<item[\s>]([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = blockRe.exec(xml)) !== null) {
    const block = m[1];
    let title = cleanText(tagText(block, "title"), 200);

    // Google News RSS carries the publisher in a <source> tag and appends
    // " - Publisher" to the title; prefer that real name and de-suffix the title.
    let source = sourceLabel;
    const srcTag = tagText(block, "source");
    if (srcTag) {
      source = cleanText(srcTag, 40);
      if (title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
    }

    // Link: RSS puts it in <link>text</link>; Atom uses <link href="…"/>.
    let link = tagText(block, "link");
    if (!link) {
      const href =
        block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) ||
        block.match(/<link[^>]*href=["']([^"']+)["']/i);
      if (href) link = decodeEntities(href[1]).trim();
    }

    const dateRaw =
      tagText(block, "pubDate") ||
      tagText(block, "published") ||
      tagText(block, "updated") ||
      tagText(block, "dc:date");
    const summary = cleanText(
      tagText(block, "description") || tagText(block, "summary") || tagText(block, "content")
    );

    if (!title || !link) continue;
    const ts = dateRaw ? Date.parse(dateRaw) : NaN;
    items.push({
      title,
      url: link,
      source,
      summary,
      publishedAt: Number.isNaN(ts) ? null : new Date(ts).toISOString(),
      _ts: Number.isNaN(ts) ? 0 : ts,
    });
  }
  return items;
}

/** Hostname of a feed URL, for a readable source label ("bbci.co.uk"). */
function sourceLabelFor(feedUrl) {
  try {
    return new URL(feedUrl).hostname.replace(/^www\./, "").replace(/^feeds?\./, "").replace(/^rss\./, "");
  } catch {
    return "source";
  }
}

/** Fetch + parse one feed, with a timeout. Returns [] on any failure. */
export async function fetchFeed(feedUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        // Some feeds 403 the default fetch UA; present a normal browser-ish UA.
        "User-Agent": "Mozilla/5.0 (compatible; JVO-NewsAgent/1.0; +https://jvoevents.com)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return parseFeed(xml, sourceLabelFor(feedUrl));
  } catch (err) {
    console.error(`[news] feed failed ${feedUrl}: ${err.message}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** De-duplicate by title (case-insensitive) and by URL. */
function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = it.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
    const urlKey = it.url.split(/[?#]/)[0];
    if (seen.has(key) || seen.has(urlKey)) continue;
    seen.add(key);
    seen.add(urlKey);
    out.push(it);
  }
  return out;
}

/** Gather raw, sorted, de-duplicated headlines for every track. */
async function gatherTracks() {
  return Promise.all(
    TRACKS.map(async (track) => {
      const perFeed = await Promise.all(track.feeds.map(fetchFeed));
      const merged = dedupe(perFeed.flat()).sort((a, b) => b._ts - a._ts);
      const items = merged.slice(0, ITEMS_PER_TRACK).map(({ _ts, ...rest }) => rest);
      return { id: track.id, label: track.label, blurb: track.blurb, items };
    })
  );
}

/* ------------------------------ Claude curation ---------------------------- */

// Cost-effective default; override with NEWS_AI_MODEL. Claude does the editorial
// pass: pick the standout stories per track and add a one-line "why it matters".
const AI_MODEL = process.env.NEWS_AI_MODEL || "claude-haiku-4-5-20251001";

/**
 * Ask Claude to curate the gathered headlines into a briefing. Returns null if
 * no API key is configured or anything goes wrong (caller falls back to raw).
 */
async function curateWithClaude(tracks) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  // Flatten to an indexed candidate list Claude refers to by number, so it never
  // has to echo (and possibly mangle) URLs — we map indices back to real items.
  const candidates = [];
  for (const track of tracks) {
    for (const it of track.items) {
      candidates.push({ index: candidates.length, track: track.id, ...it });
    }
  }
  if (!candidates.length) return null;

  const catalog = candidates
    .map((c) => `#${c.index} [${c.track}] ${c.title} — ${c.source}${c.summary ? ` :: ${c.summary}` : ""}`)
    .join("\n");

  const trackList = TRACKS.map((t) => `"${t.id}" (${t.label})`).join(", ");
  const prompt = `You are the editor of a concise daily morning briefing for a busy professional who runs an events venue and does AI consulting on the side. They follow three tracks: ${trackList}.

Below are today's candidate headlines, each with an index. Do this:
1. Write a 2–3 sentence "briefing" summarizing the single most important throughline across everything today.
2. For each track, select the 3–5 most significant, distinct stories (skip duplicates and fluff) and for each write a short "whyItMatters" (max ~20 words, plain and practical).

Candidates:
${catalog}

Respond with ONLY valid JSON, no markdown, in exactly this shape:
{"briefing":"...","sections":[{"track":"politics","items":[{"index":0,"whyItMatters":"..."}]}]}
Only use indices that appear above. Keep whyItMatters specific to that story.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${await res.text().catch(() => "")}`);
    const data = await res.json();
    const text = (data.content || []).map((b) => b.text || "").join("").trim();
    const jsonStr = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(jsonStr);

    // Rebuild tracks from the model's selections, mapping indices → real items.
    const byId = new Map(tracks.map((t) => [t.id, t]));
    const sections = [];
    for (const sec of parsed.sections || []) {
      const track = byId.get(sec.track);
      if (!track) continue;
      const items = [];
      for (const sel of sec.items || []) {
        const cand = candidates[sel.index];
        if (!cand || cand.track !== sec.track) continue;
        const { index, track: _t, ...article } = cand;
        items.push({ ...article, whyItMatters: cleanText(sel.whyItMatters, 160) });
      }
      if (items.length) sections.push({ id: track.id, label: track.label, blurb: track.blurb, items });
    }
    if (!sections.length) return null;
    return { briefing: cleanText(parsed.briefing, 500), sections, curatedBy: AI_MODEL };
  } catch (err) {
    console.error(`[news] Claude curation failed (${err.message}); using raw headlines.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------ Public surface ----------------------------- */

/** Build (and cache) a fresh digest. Safe to call from cron, boot, or an endpoint. */
export async function refreshNewsDigest() {
  const tracks = await gatherTracks();
  const totalItems = tracks.reduce((n, t) => n + t.items.length, 0);

  const curated = await curateWithClaude(tracks);
  const digest = {
    generatedAt: new Date().toISOString(),
    ai: Boolean(curated),
    briefing: curated?.briefing || null,
    curatedBy: curated?.curatedBy || null,
    sections: curated?.sections || tracks, // raw tracks share the same shape.
    totalItems,
  };

  currentDigest = digest;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(digest, null, 2));
  } catch (err) {
    console.error(`[news] could not cache digest to disk: ${err.message}`);
  }
  console.log(
    `[news] digest refreshed: ${totalItems} items across ${tracks.length} tracks${
      digest.ai ? ` (curated by ${digest.curatedBy})` : " (raw headlines)"
    }`
  );
  return digest;
}

/** Return the current digest, loading the on-disk cache on a cold start. */
export function getNewsDigest() {
  if (currentDigest) return currentDigest;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      currentDigest = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    }
  } catch {
    /* ignore — a refresh will populate it shortly */
  }
  return currentDigest;
}
