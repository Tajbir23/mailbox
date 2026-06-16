/**
 * Send Rate Limiter – fixed-window counter per token, with retry-after.
 *
 * The existing `lib/rate-limit.js` rejects on limit but does not expose a reset
 * time, which Requirement 9.3 requires. This sibling limiter returns the reset
 * timestamp so the send route can surface a `retryAfter` (in seconds) to the
 * client on a 429.
 *
 * Two checks are performed per send by the route:
 *   checkSendLimit("user:" + userId,    { limit, windowMs })  // Req 9.1
 *   checkSendLimit("mbx:"  + mailboxId, { limit, windowMs })  // Req 9.2
 *
 * LIMITATION (documented): state is held in an in-memory Map, scoped to a single
 * process. With multiple Next.js instances behind a load balancer, the limit is
 * enforced per-instance, not globally. For production scale this should be backed
 * by a shared store (e.g. Redis / Upstash). This mirrors the caveat already noted
 * in `lib/rate-limit.js`.
 */

// --- Env-configurable defaults (Req 9.1, 9.2, 9.3) ---
export const SEND_RATE_USER_MAX_DEFAULT = 50;
export const SEND_RATE_MAILBOX_MAX_DEFAULT = 100;
export const SEND_RATE_WINDOW_MS_DEFAULT = 3_600_000; // 1 hour

/**
 * Parse a positive integer env var, falling back to `fallback` when the value is
 * absent, non-numeric, or not strictly positive.
 */
function positiveIntEnv(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Max sends per user per window (env `SEND_RATE_USER_MAX`, default 50). */
export function getUserMax() {
  return positiveIntEnv(process.env.SEND_RATE_USER_MAX, SEND_RATE_USER_MAX_DEFAULT);
}

/** Max sends per mailbox per window (env `SEND_RATE_MAILBOX_MAX`, default 100). */
export function getMailboxMax() {
  return positiveIntEnv(process.env.SEND_RATE_MAILBOX_MAX, SEND_RATE_MAILBOX_MAX_DEFAULT);
}

/** Rate window length in ms (env `SEND_RATE_WINDOW_MS`, default 3,600,000). */
export function getWindowMs() {
  return positiveIntEnv(process.env.SEND_RATE_WINDOW_MS, SEND_RATE_WINDOW_MS_DEFAULT);
}

/** Token builders so callers key on a stable, namespaced identifier. */
export const userToken = (userId) => `user:${userId}`;
export const mailboxToken = (mailboxId) => `mbx:${mailboxId}`;

// --- In-memory fixed-window state (per process) ---
const windows = new Map(); // token -> { count, resetAt }

/**
 * Check (and consume, when allowed) one unit against a token's fixed window.
 *
 * The first `limit` checks within a window are allowed; every subsequent check
 * within the same window is rejected until the window resets at `resetAt`.
 *
 * @param {string} token - namespaced key, e.g. "user:123" or "mbx:abc".
 * @param {{ limit: number, windowMs: number }} options
 * @returns {{ allowed: boolean, retryAfter: number, resetAt: number }}
 *   - allowed: whether this check is permitted.
 *   - retryAfter: seconds until the window resets. 0 when allowed; on rejection
 *     strictly greater than 0 and at most `windowMs / 1000`.
 *   - resetAt: epoch ms at which the current window resets.
 */
export function checkSendLimit(token, { limit, windowMs } = {}) {
  const now = Date.now();
  let entry = windows.get(token);

  // Start a fresh window on first use or once the prior window has elapsed.
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    windows.set(token, entry);
  }

  if (entry.count < limit) {
    entry.count += 1;
    return { allowed: true, retryAfter: 0, resetAt: entry.resetAt };
  }

  // Rejected: compute seconds until reset. remainingMs is strictly > 0 here
  // (now < resetAt), so retryAfter is > 0; cap at windowMs/1000 so it never
  // exceeds the configured window length (Req 9.3).
  const remainingMs = entry.resetAt - now;
  const maxSeconds = windowMs / 1000;
  const retryAfter = Math.min(Math.ceil(remainingMs / 1000), maxSeconds);

  return { allowed: false, retryAfter, resetAt: entry.resetAt };
}

/**
 * Test/maintenance helper: clear all in-memory window state.
 * Useful for isolating property/unit tests between runs.
 */
export function _resetSendLimits() {
  windows.clear();
}
