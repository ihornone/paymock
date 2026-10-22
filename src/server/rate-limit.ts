import { NextResponse } from 'next/server';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

/**
 * Hard ceiling on the number of tracked buckets.
 *
 * The bucket key embeds a client-controlled value (an IP), so an attacker can
 * otherwise mint an unbounded number of entries and force a full sweep of the
 * map on the event loop. Oldest entries are evicted first.
 */
export const MAX_RATE_LIMIT_BUCKETS = 10_000;
export const RATE_LIMIT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
export const DEFAULT_RATE_LIMIT = 60;
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;

const rateLimitMap = new Map<string, RateLimitRecord>();

// Periodic cleanup of expired entries
if (typeof setInterval !== 'undefined') {
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitMap.entries()) {
      if (now > record.resetAt) {
        rateLimitMap.delete(key);
      }
    }
  }, RATE_LIMIT_CLEANUP_INTERVAL_MS);

  // Do not block Node.js process exit
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    (cleanupTimer as any).unref();
  }
}

export interface RateLimitOptions {
  key: string;
  limit?: number;
  windowMs?: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp in seconds
}

function evictIfNeeded(): void {
  if (rateLimitMap.size < MAX_RATE_LIMIT_BUCKETS) return;

  // Evict expired entries first.
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) {
      rateLimitMap.delete(key);
    }
  }

  // Still full: drop the oldest entries. Map preserves insertion order.
  while (rateLimitMap.size >= MAX_RATE_LIMIT_BUCKETS) {
    const oldestKey = rateLimitMap.keys().next().value;
    if (oldestKey === undefined) break;
    rateLimitMap.delete(oldestKey);
  }
}

/**
 * Checks request rate limit against an in-memory sliding window bucket.
 */
export function checkRateLimit({
  key,
  limit = DEFAULT_RATE_LIMIT,
  windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS,
}: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetAt) {
    evictIfNeeded();
    const resetAt = now + windowMs;
    rateLimitMap.set(key, { count: 1, resetAt });
    return {
      success: true,
      limit,
      remaining: limit - 1,
      reset: Math.ceil(resetAt / 1000),
    };
  }

  if (record.count >= limit) {
    return {
      success: false,
      limit,
      remaining: 0,
      reset: Math.ceil(record.resetAt / 1000),
    };
  }

  record.count += 1;
  return {
    success: true,
    limit,
    remaining: limit - record.count,
    reset: Math.ceil(record.resetAt / 1000),
  };
}

/**
 * Resets every bucket. Used by tests so counters do not leak between cases.
 */
export function resetRateLimits(): void {
  rateLimitMap.clear();
}

/**
 * Extracts the client IP address used for rate-limit bucketing.
 *
 * `cf-connecting-ip` is set by the Cloudflare edge and cannot be spoofed by
 * the client, so it is preferred. `x-forwarded-for` is only consulted as a
 * last resort because its first entry is fully client-controlled.
 */
export function getClientIp(req: Request): string {
  const edgeIp = req.headers.get('cf-connecting-ip');
  if (edgeIp) {
    return edgeIp.trim();
  }

  const realIp = req.headers.get('x-real-ip') || req.headers.get('true-client-ip');
  if (realIp) {
    return realIp.trim();
  }

  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  return '127.0.0.1';
}

/**
 * Formats a standard 429 Too Many Requests response with HTTP rate limit headers.
 */
export function rateLimitResponse(
  limitResult: RateLimitResult,
  message = 'Rate limit exceeded. Please try again later.'
) {
  const retryAfter = Math.max(1, limitResult.reset - Math.ceil(Date.now() / 1000));
  return NextResponse.json(
    {
      errCode: 'TOO_MANY_REQUESTS',
      errText: message,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(limitResult.limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(limitResult.reset),
        'Cache-Control': 'private, no-store',
      },
    }
  );
}
