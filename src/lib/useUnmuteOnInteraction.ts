import { useEffect, type RefObject } from "react";

/**
 * Reliable muted autoplay + "sound on first interaction".
 *
 * Browsers (and Safari especially) forbid audio until the visitor performs a
 * real gesture, so there is no way to have sound literally before any
 * interaction. What we do:
 *   1. Force the `muted` DOM property + play() so muted autoplay actually runs
 *      (React doesn't reliably set the muted property from the JSX attribute).
 *   2. On the visitor's first genuine gesture — tap, click, or key — unmute and
 *      keep playing. If a particular attempt is blocked, we revert to muted and
 *      keep listening, so the video never gets stuck/paused on its poster.
 */
export function useUnmuteOnInteraction(ref: RefObject<HTMLVideoElement>) {
  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    // Guarantee muted autoplay regardless of how React rendered the attribute.
    v.muted = true;
    v.defaultMuted = true;
    v.play().catch(() => {});

    let done = false;
    const tryUnmute = () => {
      if (done) return;
      const vid = ref.current;
      if (!vid) return;
      vid.muted = false;
      vid.volume = 1;
      const p = vid.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          done = true;
          cleanup();
        }).catch(() => {
          // Blocked (gesture not accepted) — revert so playback never stalls.
          vid.muted = true;
          vid.play().catch(() => {});
        });
      } else {
        done = true;
        cleanup();
      }
    };

    // Discrete, genuine user-activation gestures only — these don't fire on load
    // and won't repeat-toggle the way scroll/mousemove would.
    const events: (keyof WindowEventMap)[] = [
      "pointerdown",
      "touchstart",
      "click",
      "keydown",
    ];
    const cleanup = () =>
      events.forEach((e) => window.removeEventListener(e, tryUnmute));
    events.forEach((e) =>
      window.addEventListener(e, tryUnmute, { passive: true })
    );
    return cleanup;
  }, [ref]);
}
