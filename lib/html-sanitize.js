/**
 * Outbound HTML sanitization.
 *
 * The app has no robust HTML sanitizer (no DOMPurify). `components/InboxView.js`
 * uses an inline regex `sanitizeHtml` for *rendering* received mail. For
 * **outbound** bodies we reuse the same conservative inline approach, centralized
 * here so both storage (`SentEmail.bodyHtml`) and delivery (the SMTP relay) use
 * the identical sanitized string.
 *
 * It strips `<script>` blocks, inline `on*=` event handlers, and dangerous URI
 * schemes (`javascript:` / `vbscript:` / `data:text/html`) while preserving
 * benign markup. This intentionally mirrors the existing app behavior rather
 * than introducing a new dependency.
 *
 * Validates: Requirements 4.4
 */
export function sanitizeOutboundHtml(html) {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]*/gi, "")
    .replace(/javascript\s*:/gi, "blocked:")
    .replace(/vbscript\s*:/gi, "blocked:")
    .replace(/data\s*:\s*text\/html/gi, "blocked:");
}
