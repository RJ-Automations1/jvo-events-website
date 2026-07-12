/**
 * FedEx-style progress tracker. Rolls the granular onboarding / engagement
 * checklists up into a few macro phases and renders them as a horizontal
 * stepper — completed phases filled (with the date they finished), the current
 * phase highlighted ("in progress"), and remaining phases greyed ("pending").
 *
 * This is the at-a-glance "where is this vendor in the process" view: what
 * they've completed and what's left to finish.
 */
import type { StepState } from "@/lib/cbe/api";

export interface Phase {
  key: string;
  label: string;
  steps: string[];
}

// Macro phases for a vendor's onboarding journey (maps ONBOARDING_STEPS keys).
export const ONBOARDING_PHASES: Phase[] = [
  { key: "started", label: "Application Started", steps: ["application_received"] },
  {
    key: "documents",
    label: "Documents Received",
    steps: ["demographics_received", "w9_received", "ach_received", "references_received"],
  },
  { key: "welcome", label: "Welcome & Call", steps: ["welcome_email_sent", "onboarding_call_scheduled"] },
  { key: "complete", label: "Onboarding Complete", steps: ["onboarding_complete"] },
];

// Macro phases for an engagement's payment journey (maps ENGAGEMENT_STEPS keys).
export const ENGAGEMENT_PHASES: Phase[] = [
  { key: "submitted", label: "Submitted", steps: ["date_submitted", "invitation_letter_sent"] },
  { key: "contract", label: "Contract (ICA/SSJD)", steps: ["ica_received", "ica_completed", "ssjd_submitted"] },
  { key: "invoice", label: "Invoice", steps: ["invoice_requested", "invoice_received", "invoice_approved"] },
  {
    key: "processing",
    label: "Payment Processing",
    steps: ["payment_request_submitted", "requisition_processing", "payment_date_set"],
  },
  {
    key: "paid",
    label: "Paid & Complete",
    steps: ["receipt_uploaded", "receipt_confirmed", "payment_complete", "engagement_complete"],
  },
];

function phaseStatus(phase: Phase, state: Record<string, StepState>) {
  const doneKeys = phase.steps.filter((k) => state?.[k]?.done);
  const dates = doneKeys.map((k) => state[k]?.at).filter(Boolean) as string[];
  const lastAt = dates.sort().pop() || null;
  return {
    allDone: doneKeys.length === phase.steps.length && phase.steps.length > 0,
    doneCount: doneKeys.length,
    total: phase.steps.length,
    lastAt,
  };
}

export default function Tracker({
  phases,
  state,
}: {
  phases: Phase[];
  state: Record<string, StepState>;
}) {
  const statuses = phases.map((p) => ({ phase: p, ...phaseStatus(p, state) }));
  const currentIdx = statuses.findIndex((s) => !s.allDone); // -1 when fully complete

  return (
    <div className="cbe-tracker">
      <ol className="cbe-track">
        {statuses.map((s, i) => {
          const isDone = s.allDone;
          const isCurrent = i === currentIdx;
          const cls = isDone ? "done" : isCurrent ? "current" : "todo";
          return (
            <li key={s.phase.key} className={`cbe-track-step ${cls}`}>
              <span className="node" aria-hidden="true">
                {isDone ? "✓" : i + 1}
              </span>
              <span className="meta">
                <span className="lbl">{s.phase.label}</span>
                <span className="sub">
                  {isDone
                    ? s.lastAt
                      ? new Date(s.lastAt).toLocaleDateString()
                      : "Complete"
                    : isCurrent
                      ? `In progress · ${s.doneCount}/${s.total}`
                      : "Pending"}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
