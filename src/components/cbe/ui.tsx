/** Small presentational helpers shared across CBE pages. */
import type { DocMeta } from "@/lib/cbe/api";
import { getToken } from "@/lib/cbe/api";

const STATUS_TONE: Record<string, string> = {
  New: "gray",
  Onboarding: "amber",
  Active: "",
  "Awaiting Payment": "amber",
  Paid: "green",
  Complete: "green",
  "On Hold": "red",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "";
  return <span className={`cbe-badge ${tone}`}>{status}</span>;
}

export function Progress({ pct }: { pct: number }) {
  return (
    <span
      className="cbe-progress"
      title={`${pct}% complete`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

/** A downloadable link to an uploaded document (token in query for the <a>). */
export function DocLink({ doc }: { doc: DocMeta }) {
  const href = `/api/cbe/documents/${encodeURIComponent(doc.storedName)}?token=${getToken() ?? ""}`;
  return (
    <a className="cbe-doc" href={href} target="_blank" rel="noreferrer">
      📎 {doc.name}
    </a>
  );
}

export function programName(programs: { id: string; name: string }[], id: string) {
  return programs.find((p) => p.id === id)?.name || id || "—";
}
