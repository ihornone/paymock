import { NextResponse } from 'next/server';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

// Periodic cleanup of expired entries (every 5 minutes)
if (typeof setInterval !== 'undefined') {
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitMap.entries()) {
      if (now > record.resetAt) {
        rateLimitMap.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  // Do not block Node.js process exit
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    (cleanupTimer as any).unref();
  }
}

export interface RateLimitOptions {
  key: string;
  limit?: number; // Maximum allowed requests in window
  windowMs?: number; // Time window in milliseconds (default: 60,000ms / 1 min)
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp in seconds
}

/**
 * Checks request rate limit against an in-memory sliding window bucket.
 */
export function checkRateLimit({
  key,
  limit = 60,
  windowMs = 60_000,
}: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetAt) {
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
 * Extracts client IP address from proxy headers or connection.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp =
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('true-client-ip');

  if (realIp) {
    return realIp.trim();
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
      },
    }
  );
}
