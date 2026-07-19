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
