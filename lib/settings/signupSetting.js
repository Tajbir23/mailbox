// Feature: signup-toggle
// Pure helper for resolving the effective signup_enabled value.

/**
 * Resolve the effective signup_enabled value from a raw stored value.
 *
 * The signup_enabled setting is a site-wide boolean. When no value has been
 * stored, or the stored value is not a boolean (invalid/legacy data), the
 * feature defaults to enabled (`true`).
 *
 * @param {*} rawValue - The raw value as read from storage (may be undefined,
 *   null, or any non-boolean type).
 * @returns {boolean} The boolean value if `rawValue` is a boolean, otherwise `true`.
 */
export function resolveSignupEnabled(rawValue) {
  return typeof rawValue === "boolean" ? rawValue : true;
}
