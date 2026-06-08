// Feature: signup-toggle
// Pure helper for validating a setting value against its definition.

/**
 * Validate that a value is acceptable for a given setting definition.
 *
 * Supported validations:
 * - `def.type === "boolean"`: the value must be a JavaScript boolean.
 * - `def.allowed` (array): the value must be one of the allowed entries.
 *
 * If the definition specifies no constraints, the value is considered valid.
 *
 * @param {{ type?: string, allowed?: any[] }} def - The setting definition.
 * @param {*} value - The candidate value to validate.
 * @returns {boolean} `true` if the value is valid for the definition.
 */
export function isValidSettingValue(def, value) {
  if (!def) return false;

  if (def.type === "boolean") {
    return typeof value === "boolean";
  }

  if (Array.isArray(def.allowed)) {
    return def.allowed.includes(value);
  }

  return true;
}
