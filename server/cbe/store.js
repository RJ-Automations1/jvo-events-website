/**
 * CBE platform data store — a small JSON-file-backed repository.
 *
 * Phase I intentionally avoids a database dependency: the whole dataset lives in
 * one JSON file (CBE_DATA_FILE, default server/cbe/data/cbe-data.json) that is
 * loaded once and written atomically on every mutation. This keeps the platform
 * a "strong Phase I framework" that runs anywhere the events site already runs,
 * while isolating persistence behind this module so it can be swapped for a real
 * database later without touching the routes.
 *
 * NOTE: on hosts with an ephemeral filesystem (e.g. Render without a mounted
 * disk) the data file resets on redeploy. Point CBE_DATA_FILE at a persistent
 * disk for durable storage.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_FILE =
  process.env.CBE_DATA_FILE || path.join(__dirname, "data", "cbe-data.json");

const EMPTY = { vendors: [], engagements: [], meta: { seededAt: null } };

let cache = null;

function ensureDir() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
}

function load() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    cache = { ...EMPTY, ...parsed };
    cache.vendors ||= [];
    cache.engagements ||= [];
  } catch {
    cache = structuredClone(EMPTY);
  }
  return cache;
}

/** Atomic write: write to a temp file in the same dir, then rename over the target. */
function persist() {
  ensureDir();
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

export function id(prefix) {
  return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
}

export function nowIso() {
  return new Date().toISOString();
}

// --- Vendors -------------------------------------------------------------

export function listVendors() {
  return load().vendors;
}

export function getVendor(vendorId) {
  return load().vendors.find((v) => v.id === vendorId) || null;
}

export function createVendor(data) {
  const db = load();
  const vendor = {
    id: id("ven"),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...data,
  };
  db.vendors.push(vendor);
  persist();
  return vendor;
}

export function updateVendor(vendorId, patch) {
  const db = load();
  const vendor = db.vendors.find((v) => v.id === vendorId);
  if (!vendor) return null;
  Object.assign(vendor, patch, { updatedAt: nowIso() });
  persist();
  return vendor;
}

// --- Engagements (payment requests) --------------------------------------

export function listEngagements() {
  return load().engagements;
}

export function listEngagementsForVendor(vendorId) {
  return load().engagements.filter((e) => e.vendorId === vendorId);
}

export function getEngagement(engagementId) {
  return load().engagements.find((e) => e.id === engagementId) || null;
}

export function createEngagement(data) {
  const db = load();
  const engagement = {
    id: id("eng"),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...data,
  };
  db.engagements.push(engagement);
  persist();
  return engagement;
}

export function updateEngagement(engagementId, patch) {
  const db = load();
  const engagement = db.engagements.find((e) => e.id === engagementId);
  if (!engagement) return null;
  Object.assign(engagement, patch, { updatedAt: nowIso() });
  persist();
  return engagement;
}

/** Test/support hook — reset the in-memory cache so a changed file is re-read. */
export function _resetCache() {
  cache = null;
}
