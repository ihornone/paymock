/**
 * Pagination bounds shared by every repository and API route.
 *
 * A negative `limit` is not a harmless value: Drizzle drops the `LIMIT` clause
 * entirely for negative inputs, turning a bounded query into a full table scan.
 * Every caller must therefore pass through `clampLimit` before it reaches SQL.
 */

export const MIN_PAGE_SIZE = 1;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/** Maximum number of rows returned by the dashboard invoice feed. */
export const DASHBOARD_INVOICE_LIMIT = 50;
/** Maximum number of rows returned by the dashboard webhook feed. */
export const DASHBOARD_WEBHOOK_LIMIT = 20;
/** Maximum number of projects returned for a single account. */
export const MAX_PROJECTS_PER_USER = 100;

export function clampLimit(
  value: unknown,
  fallback: number = DEFAULT_PAGE_SIZE,
  max: number = MAX_PAGE_SIZE
): number {
  const safeFallback = Math.min(Math.max(fallback, MIN_PAGE_SIZE), max);

  // `null`, `undefined` and an empty string mean "not provided".
  if (value === null || value === undefined || value === '') {
    return safeFallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return safeFallback;
  }

  // A negative limit is invalid input rather than a request for fewer rows:
  // it falls back to the default instead of silently returning a single row.
  if (parsed < MIN_PAGE_SIZE) {
    return safeFallback;
  }

  return Math.min(Math.floor(parsed), max);
}

export function clampOffset(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.floor(parsed);
}
