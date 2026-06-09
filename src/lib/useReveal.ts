import { useEffect } from "react";

/**
 * Observes every `.reveal` element currently in the DOM and adds the
 * `visible` class when it scrolls into view. Extracted from the original
 * BookingPage so every page shares identical scroll-reveal behavior.
 *
 * Call once near the top of a page component. Re-runs whenever `deps`
 * change (use this when a page renders `.reveal` elements after data loads).
 */
export function useReveal(deps: unknown[] = []) {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach(
          (e) => e.isIntersecting && e.target.classList.add("visible")
        ),
      { threshold: 0.1 }
    );
    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
