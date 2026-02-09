// In-memory rate limiter for API routes

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now >= entry.resetAt) {
      buckets.delete(key);
    }
  }
}, 60_000);

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || now >= entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

// Pre-configured limiters for scanner routes
const ONE_MINUTE = 60_000;

export function scannerRateLimit(ip: string): RateLimitResult {
  return checkRateLimit(`scanner:${ip}`, 10, ONE_MINUTE);
}

export function streamRateLimit(ip: string): RateLimitResult {
  return checkRateLimit(`stream:${ip}`, 3, ONE_MINUTE);
}

export function symbolRateLimit(ip: string): RateLimitResult {
  return checkRateLimit(`symbol:${ip}`, 30, ONE_MINUTE);
}
