/**
 * Pure validation helpers for the outbound send pipeline.
 *
 * All functions in this module are PURE (no I/O, no DB, no env access) so they
 * can be unit- and property-tested directly. The send API route composes these
 * helpers into the ordered validation gate described in the design.
 */

import { sanitizeEmail } from "./sanitize.js";

// Combined To + Cc + Bcc recipient ceiling (Req 3.4).
export const MAX_RECIPIENTS = 50;

// Maximum subject length in characters (Req 4.2).
export const MAX_SUBJECT = 998;

// Maximum total message size in bytes: 25 MiB (Req 4.5 / 5.3).
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

const DEFAULT_SUBJECT = "(No Subject)";

// Coerce an arbitrary value into an array of strings (used for recipient lists).
function toList(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

// Whitespace-or-empty check that tolerates non-string input.
function isBlank(value) {
  if (typeof value !== "string") return value === undefined || value === null;
  return value.trim().length === 0;
}

/**
 * Validate and normalize recipient lists (Req 3.2, 3.3, 3.5).
 *
 * Each address is run through `sanitizeEmail`, which lowercases, format-checks,
 * and returns "" on failure. Accepted addresses are kept (lowercased); every
 * address that fails is recorded in `invalid` with its originating field name.
 *
 * @returns {{ to: string[], cc: string[], bcc: string[], invalid: Array<{ field: string, value: any }> }}
 */
export function validateRecipients({ to, cc, bcc } = {}) {
  const result = { to: [], cc: [], bcc: [], invalid: [] };

  for (const field of ["to", "cc", "bcc"]) {
    const list = toList({ to, cc, bcc }[field]);
    for (const value of list) {
      const clean = sanitizeEmail(value);
      if (clean === "") {
        result.invalid.push({ field, value });
      } else {
        result[field].push(clean);
      }
    }
  }

  return result;
}

/**
 * Normalize a subject line (Req 4.2, 4.3).
 *
 * Trims the input; an empty/whitespace-only subject becomes "(No Subject)";
 * otherwise the subject is capped at MAX_SUBJECT (998) characters.
 */
export function normalizeSubject(subject) {
  const trimmed = typeof subject === "string" ? subject.trim() : "";
  if (trimmed.length === 0) return DEFAULT_SUBJECT;
  return trimmed.slice(0, MAX_SUBJECT);
}

/**
 * Detect a completely empty message (Req 4.1).
 *
 * True iff the (pre-default) subject is empty/whitespace AND both body fields
 * are empty/whitespace.
 */
export function isContentEmpty({ subject, bodyText, bodyHtml } = {}) {
  return isBlank(subject) && isBlank(bodyText) && isBlank(bodyHtml);
}

// Byte size of a string body part (utf8), tolerant of non-string input.
function byteLengthOf(value) {
  if (typeof value !== "string" || value.length === 0) return 0;
  return Buffer.byteLength(value, "utf8");
}

// Byte size of a single attachment: explicit numeric `size` wins, else the
// length of its `content` Buffer/string.
function attachmentBytes(attachment) {
  if (!attachment || typeof attachment !== "object") return 0;
  if (typeof attachment.size === "number" && Number.isFinite(attachment.size)) {
    return attachment.size > 0 ? attachment.size : 0;
  }
  const content = attachment.content;
  if (Buffer.isBuffer(content)) return content.length;
  if (typeof content === "string") return Buffer.byteLength(content, "utf8");
  return 0;
}

/**
 * Total-size limit check (Req 4.5, 5.3).
 *
 * Sums the byte sizes of subject + bodyText + bodyHtml + every attachment and
 * returns true when the total strictly exceeds MAX_TOTAL_BYTES (25 MiB).
 */
export function exceedsSizeLimit({ subject, bodyText, bodyHtml, attachments } = {}) {
  let total = byteLengthOf(subject) + byteLengthOf(bodyText) + byteLengthOf(bodyHtml);
  for (const attachment of toList(attachments)) {
    total += attachmentBytes(attachment);
  }
  return total > MAX_TOTAL_BYTES;
}

/**
 * Prefix a subject with "Re: " / "Fwd: " exactly once (Req 6.2, 7.1).
 *
 * The existing-prefix check is case-insensitive, so a subject that already
 * begins with the prefix is returned unchanged. This makes the function
 * idempotent: prefixSubject(prefixSubject(x)) === prefixSubject(x).
 */
export function prefixSubject(subject, prefix) {
  const s = typeof subject === "string" ? subject : "";
  const p = typeof prefix === "string" ? prefix : "";
  if (p.length === 0) return s;
  if (s.toLowerCase().startsWith(p.toLowerCase())) return s;
  return p + s;
}
