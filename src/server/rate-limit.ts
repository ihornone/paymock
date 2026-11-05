import { NextResponse } from 'next/server';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export const MAX_RATE_LIMIT_BUCKETS = 10_000;
export const RATE_LIMIT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
export const DEFAULT_RATE_LIMIT = 60;
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;

const rateLimitMap = new Map<string, RateLimitRecord>();

let lastCleanupAt = 0;

function sweepExpiredBuckets(now: number): void {
  if (now - lastCleanupAt < RATE_LIMIT_CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;

  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) {
      rateLimitMap.delete(key);
    }
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
  reset: number;
}

function evictIfNeeded(): void {
  if (rateLimitMap.size < MAX_RATE_LIMIT_BUCKETS) return;

  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) {
      rateLimitMap.delete(key);
    }
  }

  while (rateLimitMap.size >= MAX_RATE_LIMIT_BUCKETS) {
    const oldestKey = rateLimitMap.keys().next().value;
    if (oldestKey === undefined) break;
    rateLimitMap.delete(oldestKey);
  }
}

export function checkRateLimit({
  key,
  limit = DEFAULT_RATE_LIMIT,
  windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS,
}: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  sweepExpiredBuckets(now);

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

export function resetRateLimits(): void {
  rateLimitMap.clear();
}

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
