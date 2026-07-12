/** Labeled form field that programmatically associates its label with the
 * control inside it (accessibility + testability). Shared by the public forms. */
import { useId, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

export default function Field({
  label,
  hint,
  full,
  children,
}: {
  label: string;
  hint?: string;
  full?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className={`cbe-field${full ? " full" : ""}`}>
      <label htmlFor={id}>
        {label} {hint && <span className="hint">— {hint}</span>}
      </label>
      {isValidElement(children) ? cloneElement(children as ReactElement, { id }) : children}
    </div>
  );
}
