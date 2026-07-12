/**
 * Domain shaping for CBE vendors + engagements: builds normalized records from
 * raw form input, and derives the roll-up fields the dashboard needs (progress
 * %, next action, effective status). Keeping this here means the routes stay
 * thin and the derivations are identical no matter the entry point (UI form,
 * Cognito webhook, or a returning-vendor payment request).
 */
import { ONBOARDING_STEPS, ENGAGEMENT_STEPS } from "./constants.js";

function str(v) {
  return v == null ? "" : String(v).trim();
}
function num(v) {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Build the checkbox map for a step list: { key: { done, at } }. */
function initSteps(steps, presetDoneKeys = []) {
  const preset = new Set(presetDoneKeys);
  const out = {};
  for (const s of steps) out[s.key] = { done: preset.has(s.key), at: null };
  return out;
}

/** A vendor's permanent profile — the parts that don't change per engagement. */
export function buildVendorFromInput(input = {}) {
  const applicantType = /student/i.test(str(input.applicantType)) ? "Student" : "Vendor";
  return {
    // Vendor or Student — both live on the same dashboard.
    applicantType,
    // Identity / contact
    vendorName: str(input.vendorName) || str(input.name),
    contactName: str(input.contactName) || str(input.name),
    email: str(input.email),
    phone: str(input.phone),
    // Taxonomy
    program: str(input.program),
    programManager: str(input.programManager),
    vendorType: str(input.vendorType),
    vendorRole: str(input.vendorRole),
    status: str(input.status) || "New",
    // Student-only fields (empty for vendors)
    school: str(input.school),
    classification: str(input.classification),
    major: str(input.major),
    // Demographics (permanent profile) + free text
    demographics: str(input.demographics),
    address: str(input.address),
    notes: str(input.notes),
    // Onboarding checklist + document links
    onboarding: initSteps(ONBOARDING_STEPS, input.onboardingDone || []),
    documents: Array.isArray(input.documents) ? input.documents : [],
    source: str(input.source) || "manual",
  };
}

/** A single engagement / payment request against a vendor. */
export function buildEngagementFromInput(vendorId, input = {}) {
  return {
    vendorId,
    program: str(input.program),
    programManager: str(input.programManager),
    vendorRole: str(input.vendorRole),
    paymentReason: str(input.paymentReason),
    paymentType: str(input.paymentType),
    paymentFrequency: str(input.paymentFrequency),
    paymentAmount: num(input.paymentAmount),
    amountPaid: num(input.amountPaid),
    paymentDueDate: str(input.paymentDueDate),
    paymentDate: str(input.paymentDate),
    // Finance reference numbers
    requisitionNumber: str(input.requisitionNumber),
    purchaseOrderNumber: str(input.purchaseOrderNumber),
    sqNumber: str(input.sqNumber),
    boNumber: str(input.boNumber),
    notes: str(input.notes),
    workflow: initSteps(ENGAGEMENT_STEPS, input.workflowDone || ["date_submitted"]),
    documents: Array.isArray(input.documents) ? input.documents : [],
    source: str(input.source) || "manual",
  };
}

function progressOf(stepMap, steps) {
  const total = steps.length;
  const done = steps.filter((s) => stepMap?.[s.key]?.done).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** First incomplete step's label — the "next action needed" hint. */
function nextAction(stepMap, steps) {
  const next = steps.find((s) => !stepMap?.[s.key]?.done);
  return next ? next.label : null;
}

/** Payment roll-up across a vendor's engagements. */
export function summarizeEngagements(engagements) {
  let requested = 0;
  let paid = 0;
  let openCount = 0;
  for (const e of engagements) {
    requested += num(e.paymentAmount);
    const isPaid = e.workflow?.payment_complete?.done;
    paid += isPaid ? num(e.paymentAmount) : num(e.amountPaid);
    if (!isPaid) openCount += 1;
  }
  return {
    dollarsRequested: requested,
    dollarsPaid: paid,
    outstanding: Math.max(0, requested - paid),
    openEngagements: openCount,
    engagementCount: engagements.length,
  };
}

/** Decorate a vendor with derived fields for list/detail responses. */
export function decorateVendor(vendor, engagements = []) {
  const onboarding = progressOf(vendor.onboarding, ONBOARDING_STEPS);
  const summary = summarizeEngagements(engagements);
  // Effective status: prefer an explicit "On Hold" override, else derive.
  let status = vendor.status;
  if (status !== "On Hold") {
    if (summary.engagementCount === 0)
      status = onboarding.pct === 100 ? "Active" : onboarding.pct === 0 ? "New" : "Onboarding";
    else if (summary.outstanding <= 0 && summary.openEngagements === 0) status = "Paid";
    else status = summary.dollarsPaid > 0 ? "Awaiting Payment" : "Active";
  }
  return {
    ...vendor,
    status,
    onboardingProgress: onboarding,
    onboardingNextAction: nextAction(vendor.onboarding, ONBOARDING_STEPS),
    ...summary,
  };
}

/** Decorate an engagement with workflow progress + next action. */
export function decorateEngagement(engagement) {
  const progress = progressOf(engagement.workflow, ENGAGEMENT_STEPS);
  return {
    ...engagement,
    workflowProgress: progress,
    nextAction: nextAction(engagement.workflow, ENGAGEMENT_STEPS),
    isComplete: !!engagement.workflow?.payment_complete?.done,
  };
}

export { num as toNumber, str as toStr };
