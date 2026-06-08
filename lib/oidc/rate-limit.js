/**
 * In-memory sliding window rate limiter for the OIDC Token Endpoint.
 *
 * Enforces 20 requests per 60-second window per client_id.
 * Uses a Map to track request counts and window start times.
 * Stale entries are cleaned up every 5 minutes.
 *
 * Requirements: 10.1
 */

const WINDOW_MS = 60 * 1000; // 60 seconds
const MAX_REQUESTS = 20;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * @typedef {Object} RateLimitEntry
 * @property {number} count - Number of requests in the current window
 * @property {number} windowStart - Timestamp (ms) when the current window started
 */

/** @type {Map<string, RateLimitEntry>} */
const rateLimitMap = new Map();

/**
 * Periodically clean up stale entries that have expired beyond the window.
 */
let cleanupTimer = null;

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap.entries()) {
      if (now - entry.windowStart > WINDOW_MS) {
        rateLimitMap.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Allow the timer to not block process exit
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

/**
 * Check if a request from the given client_id is within the rate limit.
 *
 * @param {string} clientId - The OAuth client_id to rate limit
 * @returns {{ allowed: boolean }} - Whether the request is allowed
 */
export function checkRateLimit(clientId) {
  startCleanup();

  const now = Date.now();
  const entry = rateLimitMap.get(clientId);

  if (!entry) {
    // First request from this client in the current window
    rateLimitMap.set(clientId, { count: 1, windowStart: now });
    return { allowed: true };
  }

  // Check if the window has expired — start a new window
  if (now - entry.windowStart >= WINDOW_MS) {
    rateLimitMap.set(clientId, { count: 1, windowStart: now });
    return { allowed: true };
  }

  // Within the same window — check count
  if (entry.count >= MAX_REQUESTS) {
    return { allowed: false };
  }

  // Increment and allow
  entry.count += 1;
  return { allowed: true };
}

/**
 * Reset the rate limiter (useful for testing).
 */
export function resetRateLimiter() {
  rateLimitMap.clear();
}
