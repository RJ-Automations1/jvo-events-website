/**
 * Which site this build is. The same codebase powers two deployments:
 *
 *   - jvo-events   (default)          → the full JVO Events site
 *   - jvo-weddings (VITE_SITE_MODE=weddings) → a standalone JVO Weddings site
 *
 * In weddings mode the app presents as its own website: wedding-only nav and
 * footer, the weddings page at the root, and only two links back into the
 * events site — the gold "Events" link in the nav and one in the footer.
 *
 * NOTE: VITE_* values are baked in at BUILD time, so changing this on Render
 * requires a redeploy.
 */
export const SITE_MODE = (import.meta.env.VITE_SITE_MODE || "").toLowerCase();

export const IS_WEDDINGS_SITE = SITE_MODE === "weddings";

/**
 * Where the weddings deployment sends visitors who want the main events site.
 * Set VITE_EVENTS_URL to override (e.g. the jvo-events Render URL while the
 * custom domain is still pointing elsewhere).
 */
export const EVENTS_SITE_URL =
  import.meta.env.VITE_EVENTS_URL || "https://www.jvoevents.com";
