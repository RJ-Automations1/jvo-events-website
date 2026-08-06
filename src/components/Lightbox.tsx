import { useCallback, useEffect, useRef, type CSSProperties } from "react";

export type LightboxItem = { src: string; alt: string };

/**
 * Full-screen image viewer for the gallery. Opens on a photo, steps through the
 * rest with the arrows or the ← / → keys, and closes on Escape, the X, or a
 * click on the backdrop.
 *
 * Rendered only while `index` is non-null, so the markup costs nothing until a
 * guest actually opens a picture.
 */
export default function Lightbox({
  items,
  index,
  onClose,
  onIndexChange,
}: {
  items: LightboxItem[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (next: number) => void;
}) {
  const open = index !== null;
  const closeRef = useRef<HTMLButtonElement>(null);

  const step = useCallback(
    (delta: number) => {
      if (index === null || items.length === 0) return;
      onIndexChange((index + delta + items.length) % items.length);
    },
    [index, items.length, onIndexChange]
  );

  // Keyboard: Escape closes, arrows page through.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, step]);

  // Hold the page still behind the overlay.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || index === null) return null;
  const item = items[index];
  if (!item) return null;

  const controlStyle: CSSProperties = {
    position: "absolute",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 46,
    height: 46,
    borderRadius: "999px",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.18)",
    color: "#fff",
    fontSize: "1.4rem",
    lineHeight: 1,
    cursor: "pointer",
    backdropFilter: "blur(4px)",
    transition: "background 0.2s ease",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} of ${items.length}: ${item.alt}`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(6,6,6,0.95)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(1rem, 5vw, 4rem)",
      }}
    >
      {/* Close */}
      <button
        ref={closeRef}
        type="button"
        aria-label="Close"
        onClick={onClose}
        style={{ ...controlStyle, top: "1.25rem", right: "1.25rem" }}
      >
        ×
      </button>

      {items.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={(e) => {
              e.stopPropagation();
              step(-1);
            }}
            style={{ ...controlStyle, left: "1.25rem", top: "50%", transform: "translateY(-50%)" }}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={(e) => {
              e.stopPropagation();
              step(1);
            }}
            style={{ ...controlStyle, right: "1.25rem", top: "50%", transform: "translateY(-50%)" }}
          >
            ›
          </button>
        </>
      )}

      {/* The photo itself — clicking it shouldn't close the viewer. */}
      <figure
        onClick={(e) => e.stopPropagation()}
        style={{ margin: 0, maxWidth: "100%", maxHeight: "100%", textAlign: "center" }}
      >
        <img
          src={item.src}
          alt={item.alt}
          style={{
            maxWidth: "100%",
            maxHeight: "80vh",
            objectFit: "contain",
            display: "block",
            margin: "0 auto",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        />
        <figcaption
          className="mt-4"
          style={{ fontFamily: "'Lato', sans-serif", color: "rgba(255,255,255,0.6)", fontSize: "0.8rem" }}
        >
          <span style={{ letterSpacing: "0.06em" }}>{item.alt}</span>
          <span style={{ display: "block", marginTop: "0.35rem", color: "rgba(255,255,255,0.35)", fontSize: "0.72rem" }}>
            {index + 1} / {items.length}
          </span>
        </figcaption>
      </figure>
    </div>
  );
}
