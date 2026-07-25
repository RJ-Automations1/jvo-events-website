/**
 * SQLite persistence for the event-booking pipeline.
 * --------------------------------------------------
 * A tiny embedded database (better-sqlite3) that tracks every event booking as
 * it moves through the status pipeline (see server/pipeline.js). The DB file
 * lives at DB_PATH (default ./data/jvo.db; on Render it points at the mounted
 * persistent disk, e.g. /data/jvo.db).
 *
 * GRACEFUL DEGRADATION: the rest of the site must keep working without a DB.
 * getDb() lazily opens the database once; if the native module fails to load or
 * the path isn't writable it logs ONE warning and returns null forever after —
 * callers must handle a null return and carry on.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const DB_PATH = process.env.DB_PATH || "./data/jvo.db";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  public_id TEXT UNIQUE,
  status TEXT NOT NULL,
  name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  event_type TEXT,
  event_date TEXT,
  start_time TEXT,
  end_time TEXT,
  guest_count INTEGER,
  vehicle_count INTEGER,
  package TEXT,
  vendors TEXT,
  addons TEXT,
  notes TEXT,
  details_changes TEXT,
  jotform_id TEXT UNIQUE,
  calendar_event_id TEXT,
  deposit_paid_at TEXT,
  final_paid_at TEXT,
  verify_token TEXT UNIQUE,
  details_verified_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor TEXT,
  note TEXT,
  at TEXT
);

CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  kind TEXT NOT NULL,
  to_email TEXT,
  sent_at TEXT,
  UNIQUE(event_id, kind)
);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'event_staff',
  active INTEGER NOT NULL DEFAULT 1,
  portal_token TEXT UNIQUE,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS availability (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  response TEXT NOT NULL,
  note TEXT,
  responded_at TEXT,
  UNIQUE(event_id, staff_id)
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  role TEXT NOT NULL DEFAULT 'staff',
  hours REAL,
  assigned_at TEXT,
  UNIQUE(event_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_history_event ON status_history(event_id);
CREATE INDEX IF NOT EXISTS idx_availability_event ON availability(event_id);
CREATE INDEX IF NOT EXISTS idx_assignments_event ON assignments(event_id);
`;

let db = null;
let failed = false;

/**
 * Columns added after the first release. On open we make sure each exists so an
 * older DB file picks them up without a migration framework.
 */
function ensureColumns(database) {
  const have = new Set(
    database.prepare("PRAGMA table_info(events)").all().map((c) => c.name)
  );
  const wanted = {
    details_changes: "TEXT",
    // How many staff this event needs on the day (staff-scheduling phase).
    staff_needed: "INTEGER DEFAULT 2",
  };
  for (const [col, type] of Object.entries(wanted)) {
    if (!have.has(col)) {
      database.exec(`ALTER TABLE events ADD COLUMN ${col} ${type}`);
    }
  }
}

/**
 * Lazy singleton. Returns the open Database, or null when SQLite isn't
 * available (missing native module, read-only filesystem, …). Warns once.
 * @returns {import("better-sqlite3").Database | null}
 */
export function getDb() {
  if (db) return db;
  if (failed) return null;
  try {
    const Database = require("better-sqlite3");
    fs.mkdirSync(path.dirname(path.resolve(DB_PATH)), { recursive: true });
    const opened = new Database(DB_PATH);
    opened.pragma("journal_mode = WAL");
    opened.pragma("foreign_keys = ON");
    opened.exec(SCHEMA);
    ensureColumns(opened);
    db = opened;
    console.log(`[db] SQLite open at ${path.resolve(DB_PATH)}`);
    return db;
  } catch (err) {
    failed = true;
    console.warn(
      `[db] SQLite unavailable (${err.message}) — booking pipeline persistence disabled; the site will keep working without it.`
    );
    return null;
  }
}

/** Current time as an ISO-8601 string (UTC) — the stamp format used everywhere. */
export function nowIso() {
  return new Date().toISOString();
}
