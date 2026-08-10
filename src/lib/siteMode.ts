/**
 * Which site this build is. The same codebase powers two deployments:
 *
 *   - jvo-events   (default)          → the full JVO Events site
 *   - jvo-weddings (VITE_SITE_MODE=weddings) → a standalone JVO Weddings site
 *
 * In weddings mode the app presents as its own website: wedding-only nav and
 * footer, the weddings page at the root, and no links into the events site
 * (apart from one small "JVO Events" link in the footer).
 *
 * NOTE: VITE_* values are baked in at BUILD time, so changing this on Render
 * requires a redeploy.
 */
export const SITE_MODE = (import.meta.env.VITE_SITE_MODE || "").toLowerCase();

export const IS_WEDDINGS_SITE = SITE_MODE === "weddings";

/**
 * Where the weddings deployment sends visitors who want the main events site.
 * Used by the weddings navbar (top-right gold link) and the weddings footer, so
 * both point at the same place.
 */
export const EVENTS_SITE_URL =
  import.meta.env.VITE_EVENTS_URL || "https://www.jvoevents.com";
