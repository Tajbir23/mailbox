/**
 * Pure query-shaping helpers for the Sent list endpoint
 * (GET /api/mailboxes/[id]/sent).
 *
 * All functions in this module are PURE (no I/O, no DB, no env access) so they
 * can be unit- and property-tested directly. The route composes
 * `buildSentFilter` / `buildSentSort` / `clampLimit` into a Mongoose query,
 * while `shapeSentResults` models the same scope/sort/clamp/paginate behavior
 * against an in-memory array for the property tests.
 */

// Pagination bounds for the Sent list (Req 8.5).
export const MIN_LIMIT = 1;
export const MAX_LIMIT = 100;

// Default page size when no (or an unusable) limit is supplied. Clamped into
// [MIN_LIMIT, MAX_LIMIT] like every other value.
export const DEFAULT_LIMIT = 30;

/**
 * Coerce and clamp a requested page size into [1, 100] (Req 8.5).
 *
 * Missing / zero / negative / NaN / non-numeric inputs fall back to
 * DEFAULT_LIMIT; fractional values are floored; anything above MAX_LIMIT is
 * capped at 100 and anything below MIN_LIMIT is raised to 1.
 *
 * @param {*} limit
 * @returns {number} integer in [1, 100]
 */
export function clampLimit(limit) {
  const n = typeof limit === "number" ? limit : Number(limit);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  const floored = Math.floor(n);
  if (floored < MIN_LIMIT) return MIN_LIMIT;
  if (floored > MAX_LIMIT) return MAX_LIMIT;
  return floored;
}

/**
 * Build the mailbox-scoping filter for the Sent query (Req 8.2).
 *
 * @param {*} mailboxId
 * @returns {{ mailboxId: * }}
 */
export function buildSentFilter(mailboxId) {
  return { mailboxId };
}

/**
 * Build the sort spec: newest first by creation time (Req 8.4).
 *
 * @returns {{ createdAt: -1 }}
 */
export function buildSentSort() {
  return { createdAt: -1 };
}

// Comparable timestamp for a record's createdAt, tolerant of Date / number /
// ISO-string / missing values. Unparseable values sort as the oldest (0).
function createdAtValue(record) {
  const raw = record ? record.createdAt : undefined;
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (typeof raw === "string") {
    const t = Date.parse(raw);
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

/**
 * Pure in-memory model of the Sent list query (Properties 9, 10, 11).
 *
 * The input `records` is assumed to be the mailbox-scoped set (the route
 * applies `buildSentFilter` at the database layer). This helper sorts by
 * `createdAt` descending (most recent first, Req 8.4), clamps the requested
 * page size into [1, 100] (Req 8.5), and returns the slice for the requested
 * 1-based page. The returned count never exceeds 100.
 *
 * @param {Array} records
 * @param {{ page?: number, limit?: number }} [options]
 * @returns {Array} the page slice
 */
export function shapeSentResults(records, { page, limit } = {}) {
  const list = Array.isArray(records) ? records.slice() : [];

  // Newest first (stable for equal timestamps).
  list.sort((a, b) => createdAtValue(b) - createdAtValue(a));

  const effectiveLimit = clampLimit(limit);

  const pageNum = typeof page === "number" ? page : Number(page);
  const safePage = Number.isFinite(pageNum) && pageNum >= 1 ? Math.floor(pageNum) : 1;

  const start = (safePage - 1) * effectiveLimit;
  return list.slice(start, start + effectiveLimit);
}
