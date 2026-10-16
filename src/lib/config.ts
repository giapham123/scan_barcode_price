/**
 * Browser-side settings in one place. Change values here, not in the classes.
 * (Server settings — data folder, admin PIN — are environment variables,
 * see src/lib/server/container.ts.)
 */
export const config = Object.freeze({
  /** Products API served by the route handlers in src/app/api. */
  apiBaseUrl: '/api',

  /**
   * How long a found price is cached in the browser. Kept short so a price
   * changed on another phone shows up quickly. Your own edits apply at once.
   */
  cacheTtlMs: 30_000,

  /**
   * The camera counts a barcode once while it stays in view. It is counted
   * again only after being out of view for this long.
   */
  scanCooldownMs: 2000,

  /** Locale used to format prices, e.g. 'en-US', 'vi-VN'. */
  locale: 'en-US',

  /** Default currency for new products and the empty cart total. */
  currency: 'USD',

  /** Number of recent scans kept in the history list. */
  historySize: 10,
});
