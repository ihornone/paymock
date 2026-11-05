export const MIN_PAGE_SIZE = 1;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export const DASHBOARD_INVOICE_LIMIT = 50;
export const DASHBOARD_WEBHOOK_LIMIT = 20;
export const MAX_PROJECTS_PER_USER = 100;

export function clampLimit(
  value: unknown,
  fallback: number = DEFAULT_PAGE_SIZE,
  max: number = MAX_PAGE_SIZE
): number {
  const safeFallback = Math.min(Math.max(fallback, MIN_PAGE_SIZE), max);

  if (value === null || value === undefined || value === '') {
    return safeFallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return safeFallback;
  }

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
