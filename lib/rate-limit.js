/**
 * Rate Limiter – In-memory token-bucket per IP.
 * For production scale, swap to Redis-backed (e.g. @upstash/ratelimit).
 *
 * Usage:
 *   import { rateLimit } from "@/lib/rate-limit";
 *   const limiter = rateLimit({ interval: 60_000, uniqueTokenPerInterval: 500 });
 *   const { success } = await limiter.check(10, ip);  // 10 requests per interval
 */

const rateLimitMap = new Map();

export function rateLimit({ interval = 60_000, uniqueTokenPerInterval = 500 } = {}) {
  return {
    check: (limit, token) =>
      new Promise((resolve, reject) => {
        const now = Date.now();

        // Clean up stale entries periodically
        if (rateLimitMap.size > uniqueTokenPerInterval) {
          const oldest = now - interval;
          for (const [key, val] of rateLimitMap) {
            if (val.ts < oldest) rateLimitMap.delete(key);
          }
        }

        const entry = rateLimitMap.get(token);

        if (!entry || now - entry.ts > interval) {
          // New window
          rateLimitMap.set(token, { count: 1, ts: now });
          resolve({ success: true, remaining: limit - 1 });
        } else if (entry.count < limit) {
          entry.count++;
          resolve({ success: true, remaining: limit - entry.count });
        } else {
          reject({ success: false, remaining: 0 });
        }
      }),
  };
}
