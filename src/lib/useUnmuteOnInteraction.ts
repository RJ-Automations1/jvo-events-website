import { useEffect, type RefObject } from "react";

/**
 * Reliable muted autoplay + "sound on first interaction".
 *
 * Two things browsers (esp. Safari) get strict about:
 *  1. Autoplay only works if the video is *actually* muted. React doesn't always
 *     set the `muted` DOM property from the JSX attribute, so we set it on the
 *     element directly and kick off play().
 *  2. We then unmute on the visitor's first GENUINE interaction — a tap, click,
 *     or key press. We deliberately do NOT use mousemove/scroll: those fire the
 *     instant the page loads, don't count as a user gesture for audio, and would
 *     just get the video blocked and stuck on its poster.
 */
export function useUnmuteOnInteraction(ref: RefObject<HTMLVideoElement>) {
  useEffect(() => {
    const v = ref.current;
    if (v) {
      // Guarantee muted autoplay regardless of how React rendered the attribute.
      v.muted = true;
      v.defaultMuted = true;
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }

    let done = false;
    const unmute = () => {
      if (done) return;
      const vid = ref.current;
      if (!vid) return;
      done = true;
      vid.muted = false;
      vid.volume = 1;
      vid.play().catch(() => {});
      cleanup();
    };
    // Only real user-activation gestures — these won't fire spuriously on load.
    const events: (keyof WindowEventMap)[] = [
      "pointerdown",
      "touchstart",
      "click",
      "keydown",
    ];
    const cleanup = () =>
      events.forEach((e) => window.removeEventListener(e, unmute));
    events.forEach((e) =>
      window.addEventListener(e, unmute, { once: true, passive: true })
    );
    return cleanup;
  }, [ref]);
}
