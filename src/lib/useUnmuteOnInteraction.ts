import { useEffect, type RefObject } from "react";

/**
 * Browsers block autoplaying video WITH sound, so the hero starts muted (which
 * is allowed) and we unmute it the instant the visitor interacts with the page
 * in any way — click, tap, key, or scroll. The net effect is "sound just comes
 * on" without a visible button, as close as browser autoplay policy permits.
 */
export function useUnmuteOnInteraction(ref: RefObject<HTMLVideoElement>) {
  useEffect(() => {
    let done = false;
    const unmute = () => {
      if (done) return;
      const v = ref.current;
      if (!v) return;
      done = true;
      v.muted = false;
      v.volume = 1;
      v.play().catch(() => {});
      cleanup();
    };
    const events: (keyof WindowEventMap)[] = [
      "pointerdown",
      "touchstart",
      "keydown",
      "scroll",
      "wheel",
      "mousemove",
    ];
    const cleanup = () =>
      events.forEach((e) => window.removeEventListener(e, unmute));
    events.forEach((e) =>
      window.addEventListener(e, unmute, { once: true, passive: true })
    );
    return cleanup;
  }, [ref]);
}
