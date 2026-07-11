/**
 * CBE Vendor Onboarding & Payment Tracking Platform — Express API.
 *
 * Mounted at /api/cbe from server.js. Everything except /login, /meta and the
 * Cognito webhook requires a bearer token (see auth.js). Program-scoped reads
 * and writes are filtered so a Program Manager only ever sees their programs;
 * leadership sees everything.
 */
import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PROGRAMS,
  VENDOR_TYPES,
  VENDOR_ROLES,
  PAYMENT_TYPES,
  PAYMENT_FREQUENCIES,
  VENDOR_STATUSES,
  ONBOARDING_STEPS,
  ENGAGEMENT_STEPS,
  ENGAGEMENT_REF_FIELDS,
} from "./constants.js";
import * as store from "./store.js";
import {
  buildVendorFromInput,
  buildEngagementFromInput,
  decorateVendor,
  decorateEngagement,
  summarizeEngagements,
  toNumber,
} from "./model.js";
import {
  authenticate,
  revokeToken,
  requireAuth,
  requireLeadership,
  canAccessProgram,
  isLeadership,
} from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = process.env.CBE_UPLOAD_DIR || path.join(__dirname, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Disk storage for onboarding/engagement documents (W-9s, ACH, invoices, ICAs…).
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    cb(null, `${store.id("doc")}__${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: Number(process.env.CBE_MAX_UPLOAD_MB || 15) * 1024 * 1024 },
});

const router = express.Router();

/** Visible-vendor filter for the current user (leadership → all). */
function visibleVendors(user) {
  const all = store.listVendors();
  if (isLeadership(user)) return all;
  return all.filter((v) => user.programs.includes(v.program));
}

function docMeta(file) {
  return {
    id: store.id("file"),
    name: file.originalname,
    storedName: file.filename,
    size: file.size,
    mimeType: file.mimetype,
    uploadedAt: store.nowIso(),
  };
}

// --- Public: metadata + auth --------------------------------------------

/** Form/enum metadata so the front-end never hard-codes the taxonomy. */
router.get("/meta", (_req, res) => {
  res.json({
    programs: PROGRAMS,
    vendorTypes: VENDOR_TYPES,
    vendorRoles: VENDOR_ROLES,
    paymentTypes: PAYMENT_TYPES,
    paymentFrequencies: PAYMENT_FREQUENCIES,
    vendorStatuses: VENDOR_STATUSES,
    onboardingSteps: ONBOARDING_STEPS,
    engagementSteps: ENGAGEMENT_STEPS,
    engagementRefFields: ENGAGEMENT_REF_FIELDS,
  });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  const result = authenticate(email, password);
  if (!result) return res.status(401).json({ error: "Invalid email or password." });
  res.json(result);
});

router.post("/logout", requireAuth, (req, res) => {
  revokeToken(req.cbeToken);
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => res.json({ user: req.cbeUser }));

// --- Metrics / reporting -------------------------------------------------

/** Dashboard roll-up: counts, onboarding progress, and dollars per program. */
router.get("/metrics", requireAuth, (req, res) => {
  const vendors = visibleVendors(req.cbeUser);
  const vendorIds = new Set(vendors.map((v) => v.id));
  const engagements = store.listEngagements().filter((e) => vendorIds.has(e.vendorId));

  const byVendor = new Map();
  for (const e of engagements) {
    if (!byVendor.has(e.vendorId)) byVendor.set(e.vendorId, []);
    byVendor.get(e.vendorId).push(e);
  }

  const totals = {
    vendors: vendors.length,
    engagements: engagements.length,
    dollarsRequested: 0,
    dollarsPaid: 0,
    outstanding: 0,
    onboardingComplete: 0,
    awaitingPayment: 0,
  };
  const programMap = new Map();

  for (const v of vendors) {
    const decorated = decorateVendor(v, byVendor.get(v.id) || []);
    totals.dollarsRequested += decorated.dollarsRequested;
    totals.dollarsPaid += decorated.dollarsPaid;
    totals.outstanding += decorated.outstanding;
    if (decorated.onboardingProgress.pct === 100) totals.onboardingComplete += 1;
    if (decorated.status === "Awaiting Payment") totals.awaitingPayment += 1;

    const key = v.program || "general";
    if (!programMap.has(key)) {
      programMap.set(key, {
        program: key,
        vendors: 0,
        dollarsRequested: 0,
        dollarsPaid: 0,
        outstanding: 0,
        onboardingComplete: 0,
      });
    }
    const p = programMap.get(key);
    p.vendors += 1;
    p.dollarsRequested += decorated.dollarsRequested;
    p.dollarsPaid += decorated.dollarsPaid;
    p.outstanding += decorated.outstanding;
    if (decorated.onboardingProgress.pct === 100) p.onboardingComplete += 1;
  }

  res.json({ totals, byProgram: [...programMap.values()] });
});

// --- Vendors -------------------------------------------------------------

/** List vendors (program-scoped), optional ?program= and ?q= search filters. */
router.get("/vendors", requireAuth, (req, res) => {
  let vendors = visibleVendors(req.cbeUser);

  const program = req.query.program;
  if (program) vendors = vendors.filter((v) => v.program === program);

  const q = String(req.query.q || "").toLowerCase().trim();
  if (q) {
    vendors = vendors.filter((v) =>
      [v.vendorName, v.contactName, v.email, v.vendorRole, v.programManager]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q))
    );
  }

  const byVendor = new Map();
  for (const e of store.listEngagements()) {
    if (!byVendor.has(e.vendorId)) byVendor.set(e.vendorId, []);
    byVendor.get(e.vendorId).push(e);
  }
  const rows = vendors
    .map((v) => decorateVendor(v, byVendor.get(v.id) || []))
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  res.json({ vendors: rows });
});

/** Lightweight typeahead of existing vendors for the returning-vendor form. */
router.get("/vendors/search", requireAuth, (req, res) => {
  const q = String(req.query.q || "").toLowerCase().trim();
  let vendors = visibleVendors(req.cbeUser);
  if (q) {
    vendors = vendors.filter((v) =>
      [v.vendorName, v.contactName, v.email].filter(Boolean).some((s) =>
        String(s).toLowerCase().includes(q)
      )
    );
  }
  res.json({
    vendors: vendors.slice(0, 20).map((v) => ({
      id: v.id,
      vendorName: v.vendorName,
      contactName: v.contactName,
      email: v.email,
      program: v.program,
      programManager: v.programManager,
      vendorRole: v.vendorRole,
    })),
  });
});

router.get("/vendors/:id", requireAuth, (req, res) => {
  const vendor = store.getVendor(req.params.id);
  if (!vendor) return res.status(404).json({ error: "Vendor not found." });
  if (!canAccessProgram(req.cbeUser, vendor.program)) {
    return res.status(403).json({ error: "You don't have access to this vendor's program." });
  }
  const engagements = store
    .listEngagementsForVendor(vendor.id)
    .map(decorateEngagement)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  res.json({
    vendor: decorateVendor(vendor, engagements),
    engagements,
  });
});

/** Create a new vendor (new-vendor onboarding). Optional document uploads. */
router.post("/vendors", requireAuth, upload.array("documents", 12), (req, res) => {
  const body = parseBody(req);
  if (!canAccessProgram(req.cbeUser, body.program)) {
    return res.status(403).json({ error: "You can't add a vendor to that program." });
  }
  if (!body.vendorName && !body.name) {
    return res.status(400).json({ error: "Vendor name is required." });
  }
  const vendor = buildVendorFromInput({
    ...body,
    programManager: body.programManager || req.cbeUser.name,
    documents: (req.files || []).map(docMeta),
    source: body.source || "web-form",
  });
  const created = store.createVendor(vendor);
  res.status(201).json({ vendor: decorateVendor(created, []) });
});

/** Update a vendor's profile fields and/or onboarding checkboxes. */
router.patch("/vendors/:id", requireAuth, (req, res) => {
  const vendor = store.getVendor(req.params.id);
  if (!vendor) return res.status(404).json({ error: "Vendor not found." });
  if (!canAccessProgram(req.cbeUser, vendor.program)) {
    return res.status(403).json({ error: "You don't have access to this vendor's program." });
  }
  const patch = {};
  const editable = [
    "vendorName",
    "contactName",
    "email",
    "phone",
    "programManager",
    "vendorType",
    "vendorRole",
    "status",
    "demographics",
    "address",
    "notes",
  ];
  for (const k of editable) if (k in req.body) patch[k] = req.body[k];
  // Changing program is leadership-only (it moves the record between scopes).
  if ("program" in req.body && req.body.program !== vendor.program) {
    if (!isLeadership(req.cbeUser)) {
      return res.status(403).json({ error: "Only leadership can reassign a vendor's program." });
    }
    patch.program = req.body.program;
  }
  if (req.body.onboarding && typeof req.body.onboarding === "object") {
    patch.onboarding = applyStepUpdates(vendor.onboarding, ONBOARDING_STEPS, req.body.onboarding);
  }
  const updated = store.updateVendor(vendor.id, patch);
  const engagements = store.listEngagementsForVendor(vendor.id);
  res.json({ vendor: decorateVendor(updated, engagements) });
});

// --- Engagements (payment requests) --------------------------------------

/** Create a payment request against an existing vendor (returning-vendor flow). */
router.post(
  "/vendors/:id/engagements",
  requireAuth,
  upload.array("documents", 12),
  (req, res) => {
    const vendor = store.getVendor(req.params.id);
    if (!vendor) return res.status(404).json({ error: "Vendor not found." });
    if (!canAccessProgram(req.cbeUser, vendor.program)) {
      return res.status(403).json({ error: "You don't have access to this vendor's program." });
    }
    const body = parseBody(req);
    const engagement = buildEngagementFromInput(vendor.id, {
      program: body.program || vendor.program,
      programManager: body.programManager || vendor.programManager || req.cbeUser.name,
      vendorRole: body.vendorRole || vendor.vendorRole,
      ...body,
      documents: (req.files || []).map(docMeta),
      source: body.source || "web-form",
    });
    const created = store.createEngagement(engagement);
    store.updateVendor(vendor.id, {}); // bump updatedAt so it surfaces on the dashboard
    res.status(201).json({ engagement: decorateEngagement(created) });
  }
);

/** Update an engagement's fields, reference numbers, and workflow checkboxes. */
router.patch("/engagements/:id", requireAuth, (req, res) => {
  const engagement = store.getEngagement(req.params.id);
  if (!engagement) return res.status(404).json({ error: "Engagement not found." });
  const vendor = store.getVendor(engagement.vendorId);
  if (!canAccessProgram(req.cbeUser, vendor?.program)) {
    return res.status(403).json({ error: "You don't have access to this engagement." });
  }
  const patch = {};
  const editable = [
    "paymentReason",
    "paymentType",
    "paymentFrequency",
    "paymentDueDate",
    "paymentDate",
    "requisitionNumber",
    "purchaseOrderNumber",
    "sqNumber",
    "boNumber",
    "notes",
    "vendorRole",
    "programManager",
  ];
  for (const k of editable) if (k in req.body) patch[k] = req.body[k];
  if ("paymentAmount" in req.body) patch.paymentAmount = toNumber(req.body.paymentAmount);
  if ("amountPaid" in req.body) patch.amountPaid = toNumber(req.body.amountPaid);
  if (req.body.workflow && typeof req.body.workflow === "object") {
    patch.workflow = applyStepUpdates(engagement.workflow, ENGAGEMENT_STEPS, req.body.workflow);
  }
  const updated = store.updateEngagement(engagement.id, patch);
  if (vendor) store.updateVendor(vendor.id, {});
  res.json({ engagement: decorateEngagement(updated) });
});

/** Attach more documents to an existing vendor or engagement. */
router.post(
  "/:kind(vendors|engagements)/:id/documents",
  requireAuth,
  upload.array("documents", 12),
  (req, res) => {
    const isVendor = req.params.kind === "vendors";
    const record = isVendor
      ? store.getVendor(req.params.id)
      : store.getEngagement(req.params.id);
    if (!record) return res.status(404).json({ error: "Record not found." });
    const program = isVendor ? record.program : store.getVendor(record.vendorId)?.program;
    if (!canAccessProgram(req.cbeUser, program)) {
      return res.status(403).json({ error: "Access denied." });
    }
    const docs = [...(record.documents || []), ...(req.files || []).map(docMeta)];
    const updated = isVendor
      ? store.updateVendor(record.id, { documents: docs })
      : store.updateEngagement(record.id, { documents: docs });
    res.json({ documents: updated.documents });
  }
);

/** Stream an uploaded document back (access-checked via its owning record). */
router.get("/documents/:storedName", requireAuth, (req, res) => {
  const storedName = req.params.storedName;
  // Confirm the caller can see the record this document belongs to.
  const owner =
    store.listVendors().find((v) => (v.documents || []).some((d) => d.storedName === storedName)) ||
    store.listEngagements().find((e) => (e.documents || []).some((d) => d.storedName === storedName));
  const program =
    owner && "vendorId" in owner ? store.getVendor(owner.vendorId)?.program : owner?.program;
  if (!owner || !canAccessProgram(req.cbeUser, program)) {
    return res.status(404).json({ error: "Document not found." });
  }
  const filePath = path.join(UPLOAD_DIR, path.basename(storedName));
  if (!filePath.startsWith(UPLOAD_DIR) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Document not found." });
  }
  res.sendFile(filePath);
});

// --- Cognito Forms webhook ----------------------------------------------
// Configure a Cognito Forms "Submit" webhook to POST here with ?token=<secret>.
// Cognito posts JSON; we map common field names to our schema. A submission with
// a matching existing vendor (by email/name) becomes a new ENGAGEMENT (returning
// vendor); otherwise it creates a new VENDOR. Field names are configurable via
// CBE_COGNITO_FIELD_MAP so the form can evolve without a code change.
const COGNITO_SECRET = process.env.CBE_COGNITO_SECRET || "";

const DEFAULT_COGNITO_MAP = {
  vendorName: ["VendorName", "BusinessName", "Vendor", "CompanyName"],
  contactName: ["Name", "ContactName", "FullName"],
  email: ["Email", "EmailAddress"],
  phone: ["Phone", "PhoneNumber"],
  program: ["Program"],
  programManager: ["ProgramManager", "ResponsibleProgramManager"],
  vendorRole: ["VendorRole", "Role"],
  paymentReason: ["PaymentReason", "ReasonForPayment"],
  paymentType: ["PaymentType"],
  paymentFrequency: ["PaymentFrequency"],
  paymentAmount: ["PaymentAmount", "Amount"],
  paymentDueDate: ["PaymentDueDate", "DueDate"],
  notes: ["Notes", "AdditionalNotes"],
  isReturning: ["ReturningVendor", "IsReturning"],
};

function cognitoMap() {
  if (!process.env.CBE_COGNITO_FIELD_MAP) return DEFAULT_COGNITO_MAP;
  try {
    return { ...DEFAULT_COGNITO_MAP, ...JSON.parse(process.env.CBE_COGNITO_FIELD_MAP) };
  } catch {
    console.warn("[cbe-cognito] CBE_COGNITO_FIELD_MAP is not valid JSON; using defaults.");
    return DEFAULT_COGNITO_MAP;
  }
}

/** Pull the first matching key (case-insensitive, ignoring spaces) from a flat object. */
function pick(obj, candidates) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const index = new Map(Object.keys(obj).map((k) => [norm(k), k]));
  for (const c of candidates) {
    const hit = index.get(norm(c));
    if (hit != null && obj[hit] != null && String(obj[hit]).trim() !== "") return obj[hit];
  }
  return "";
}

/** Flatten a Cognito payload (nested objects → dotted-then-plain keys). */
function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, `${prefix}${k}.`, out);
    else out[`${prefix}${k}`] = v;
  }
  // Also expose leaf keys unprefixed for easy matching.
  for (const [k, v] of Object.entries(obj || {})) {
    if (!(v && typeof v === "object")) out[k] = v;
  }
  return out;
}

router.post("/cognito-hook", express.json({ limit: "1mb" }), (req, res) => {
  if (COGNITO_SECRET) {
    const token = req.query.token || req.headers["x-webhook-token"];
    if (token !== COGNITO_SECRET) {
      console.warn("[cbe-cognito] rejected: bad/missing token");
      return res.status(401).json({ ok: false });
    }
  }
  try {
    const flat = flatten(req.body || {});
    const map = cognitoMap();
    const g = (field) => pick(flat, map[field] || [field]);

    const email = String(g("email")).toLowerCase().trim();
    const vendorName = String(g("vendorName") || g("contactName")).trim();
    const returningFlag = /^(y|yes|true|1|returning)/i.test(String(g("isReturning")));

    // Match an existing vendor by email first, then by vendor name.
    const existing =
      (email && store.listVendors().find((v) => (v.email || "").toLowerCase() === email)) ||
      (vendorName &&
        store.listVendors().find(
          (v) => (v.vendorName || "").toLowerCase() === vendorName.toLowerCase()
        )) ||
      null;

    const base = {
      vendorName,
      contactName: String(g("contactName")).trim(),
      email,
      phone: String(g("phone")).trim(),
      program: String(g("program")).trim(),
      programManager: String(g("programManager")).trim(),
      vendorRole: String(g("vendorRole")).trim(),
      paymentReason: String(g("paymentReason")).trim(),
      paymentType: String(g("paymentType")).trim(),
      paymentFrequency: String(g("paymentFrequency")).trim(),
      paymentAmount: g("paymentAmount"),
      paymentDueDate: String(g("paymentDueDate")).trim(),
      notes: String(g("notes")).trim(),
      source: "cognito",
    };

    if (existing && (returningFlag || true)) {
      // Returning vendor → new engagement, existing profile preserved.
      const engagement = store.createEngagement(
        buildEngagementFromInput(existing.id, { ...base, program: base.program || existing.program })
      );
      store.updateVendor(existing.id, {});
      console.log("[cbe-cognito] engagement created for vendor", existing.id);
      return res.json({ ok: true, vendorId: existing.id, engagementId: engagement.id });
    }

    if (!vendorName) {
      console.warn("[cbe-cognito] submission missing vendor name; skipped");
      return res.json({ ok: true, skipped: true });
    }
    const vendor = store.createVendor(buildVendorFromInput(base));
    // A new-vendor Cognito submission that carries payment details also opens
    // its first engagement, so the request is tracked end-to-end immediately.
    let engagementId = null;
    if (base.paymentReason || base.paymentAmount) {
      engagementId = store.createEngagement(buildEngagementFromInput(vendor.id, base)).id;
    }
    console.log("[cbe-cognito] vendor created", vendor.id);
    return res.json({ ok: true, vendorId: vendor.id, engagementId });
  } catch (err) {
    console.error("[cbe-cognito] error:", err);
    // Return 200 so the form provider doesn't hammer retries; error is logged.
    return res.status(200).json({ ok: true, error: "logged" });
  }
});

// --- helpers -------------------------------------------------------------

/**
 * Read the request body whether it arrived as JSON or multipart (multer).
 * Multipart array/JSON-ish fields (documentsDone, onboardingDone…) come in as
 * strings; parse the couple we expect to be JSON arrays.
 */
function parseBody(req) {
  const b = { ...(req.body || {}) };
  for (const k of ["onboardingDone", "workflowDone", "documents"]) {
    if (typeof b[k] === "string") {
      try {
        b[k] = JSON.parse(b[k]);
      } catch {
        /* leave as-is */
      }
    }
  }
  return b;
}

/**
 * Apply a { key: boolean } update to a step map, stamping/clearing the `at`
 * timestamp. Unknown keys are ignored so a stale client can't inject fields.
 */
function applyStepUpdates(current, steps, updates) {
  const valid = new Set(steps.map((s) => s.key));
  const next = { ...current };
  for (const [key, val] of Object.entries(updates)) {
    if (!valid.has(key)) continue;
    const done = !!val;
    next[key] = { done, at: done ? store.nowIso() : null };
  }
  return next;
}

export default router;
