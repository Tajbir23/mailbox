/**
 * Input sanitization helpers.
 * Prevents XSS, NoSQL injection, and other common attacks.
 */

// Strip HTML tags (basic XSS prevention for text inputs)
export function stripHtml(str) {
  if (typeof str !== "string") return "";
  return str.replace(/<[^>]*>/g, "").trim();
}

// Sanitize string: trim, limit length, remove null bytes
export function sanitizeString(str, maxLength = 500) {
  if (typeof str !== "string") return "";
  return str
    .replace(/\0/g, "")           // null bytes
    .replace(/\$/g, "")           // MongoDB $ operator injection
    .trim()
    .slice(0, maxLength);
}

// Validate and sanitize email
export function sanitizeEmail(email) {
  if (typeof email !== "string") return "";
  const clean = email.toLowerCase().trim().slice(0, 254);
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(clean) ? clean : "";
}

// Validate domain name
export function sanitizeDomain(domain) {
  if (typeof domain !== "string") return "";
  const clean = domain.toLowerCase().trim().slice(0, 253);
  const domainRegex = /^[a-z0-9]+([\-.][a-z0-9]+)*\.[a-z]{2,}$/;
  return domainRegex.test(clean) ? clean : "";
}

// Sanitize MongoDB query objects – prevent $gt, $ne etc. injection
export function sanitizeQuery(obj) {
  if (typeof obj !== "object" || obj === null) return obj;
  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith("$")) continue; // strip MongoDB operators
    if (typeof value === "string") {
      clean[key] = value.replace(/\$/g, "");
    } else if (typeof value === "object" && value !== null) {
      clean[key] = sanitizeQuery(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}
