/**
 * CBE Vendor Onboarding & Payment Tracking Platform — shared domain constants.
 *
 * These lists are the single source of truth for the platform's programs,
 * vendor taxonomy, workflow milestones, and status values. The React front-end
 * fetches them from GET /api/cbe/meta so the two sides never drift.
 */

// The CBE programs a vendor can be affiliated with. Program Managers are scoped
// to a subset of these; leadership sees them all. Keep the ids stable — they're
// stored on every vendor/engagement record and used for access checks.
export const PROGRAMS = [
  { id: "lift-atl", name: "LIFT ATL" },
  { id: "lift-national", name: "LIFT National" },
  { id: "scholars", name: "Scholars" },
  { id: "research-fellows", name: "Research Fellows" },
  { id: "sparkhouse", name: "Sparkhouse" },
  { id: "spelpreneur", name: "Spelpreneur" },
  { id: "i-corps", name: "I-Corps" },
  { id: "general", name: "General CBE Vendors" },
];

export const PROGRAM_IDS = PROGRAMS.map((p) => p.id);

// Vendor type (entity form) and role (what they do for CBE). Used for filtering,
// reporting, and the demographic/1099 picture leadership wants at a glance.
export const VENDOR_TYPES = [
  "Individual / Sole Proprietor",
  "LLC",
  "Corporation",
  "Nonprofit",
  "Partnership",
  "Other",
];

export const VENDOR_ROLES = [
  "Speaker",
  "Facilitator",
  "Consultant",
  "Coach / Mentor",
  "Service Provider",
  "Contractor",
  "Judge / Reviewer",
  "Vendor / Supplier",
  "Other",
];

export const PAYMENT_TYPES = [
  "Check",
  "ACH / Direct Deposit",
  "Wire",
  "Requisition / PO",
  "Reimbursement",
  "Other",
];

export const PAYMENT_FREQUENCIES = ["One-time", "Recurring", "Milestone-based", "Installments"];

// High-level status shown on the master dashboard. Derived automatically from
// workflow progress, but also directly settable so a PM can override.
export const VENDOR_STATUSES = [
  "New",
  "Onboarding",
  "Active",
  "Awaiting Payment",
  "Paid",
  "Complete",
  "On Hold",
];

// Ordered onboarding checklist for a NEW vendor. Each item is a checkbox the
// PM ticks; the record stores a { done, at } per key. Order matters — it drives
// the progress bar and "next action needed" hint on the dashboard.
export const ONBOARDING_STEPS = [
  { key: "application_received", label: "Application Received" },
  { key: "demographics_received", label: "Demographic Information Received" },
  { key: "w9_received", label: "W-9 Received" },
  { key: "ach_received", label: "ACH Form Received" },
  { key: "references_received", label: "Vendor References Received" },
  { key: "welcome_email_sent", label: "Welcome Email / Vendor Packet Sent" },
  { key: "onboarding_call_scheduled", label: "Onboarding Call Scheduled" },
  { key: "onboarding_complete", label: "Onboarding Complete" },
];

// Per-engagement workflow — the lifecycle a single payment request/engagement
// moves through. Mirrors Tiera's "Returning Vendor Workflow" list so a returning
// vendor's new engagement and a new vendor's first engagement track identically.
export const ENGAGEMENT_STEPS = [
  { key: "date_submitted", label: "Date Submitted" },
  { key: "welcome_packet_sent", label: "Welcome Email / Vendor Packet Sent" },
  { key: "onboarding_call_scheduled", label: "Onboarding Call Scheduled" },
  { key: "invitation_letter_sent", label: "Invitation Letter Sent" },
  { key: "ica_received", label: "ICA Received" },
  { key: "ica_completed", label: "ICA Completed" },
  { key: "ssjd_needed", label: "SSJD Needed" },
  { key: "ssjd_submitted", label: "SSJD Submitted" },
  { key: "invoice_requested", label: "Invoice Requested" },
  { key: "invoice_received", label: "Invoice Received" },
  { key: "invoice_approved", label: "Invoice Approved" },
  { key: "payment_request_submitted", label: "Payment Request Submitted" },
  { key: "requisition_processing", label: "Requisition / Check Request Processing" },
  { key: "payment_date_set", label: "Payment Date Set" },
  { key: "receipt_uploaded", label: "Receipt Uploaded" },
  { key: "receipt_confirmed", label: "Receipt of Payment Confirmed" },
  { key: "payment_complete", label: "Payment Complete" },
  { key: "engagement_complete", label: "Onboarding / Engagement Complete" },
];

// Reference numbers captured against an engagement (free-text, from the finance
// system). Surfaced on the engagement card and exportable in reports.
export const ENGAGEMENT_REF_FIELDS = [
  { key: "requisition_number", label: "Requisition Number" },
  { key: "purchase_order_number", label: "Purchase Order Number" },
  { key: "sq_number", label: "SQ Number" },
  { key: "bo_number", label: "BO Number" },
];

// Who is filling out the intake — a Vendor (paid provider) or a Student
// (program participant). Both feed the same master dashboard.
export const APPLICANT_TYPES = ["Vendor", "Student"];

// Options for the student self-service application.
export const STUDENT_SCHOOLS = [
  "Spelman College",
  "Morehouse College",
  "Clark Atlanta University",
  "Morehouse School of Medicine",
  "Other",
];
export const STUDENT_CLASSIFICATIONS = [
  "Freshman",
  "Sophomore",
  "Junior",
  "Senior",
  "Graduate Student",
  "Alumni",
];

export const USER_ROLES = { LEADERSHIP: "leadership", PM: "pm" };

export function programName(id) {
  return PROGRAMS.find((p) => p.id === id)?.name || id || "";
}
