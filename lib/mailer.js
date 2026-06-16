/**
 * Outbound Delivery Agent (`lib/mailer.js`).
 *
 * Delivers outbound mail using one of two strategies, chosen by OUTBOUND_MODE:
 *
 *   - "direct" : nodemailer connects straight to the recipient's MX server
 *                (no third-party relay needed). This is the zero-config default
 *                so the platform can send to Gmail/Outlook/etc. out of the box.
 *                Deliverability depends on the sending IP reputation + SPF/DKIM/
 *                PTR — without those, mail may land in spam.
 *   - "relay"  : nodemailer submits to a configured SMTP relay
 *                (SMTP_RELAY_HOST/PORT/USER/PASS). Best deliverability when you
 *                have a transactional provider (SES, Postmark, Mailgun, …).
 *   - "auto"   : (default) use the relay when configured, otherwise direct.
 *   - "disabled": outbound sending is turned off (send API returns 503).
 *
 * Optional DKIM signing (DKIM_DOMAIN + DKIM_SELECTOR + DKIM_PRIVATE_KEY) is
 * applied to every message when configured, which dramatically improves
 * deliverability for direct sends.
 *
 * This module is a pure delivery concern: it performs no database access.
 *
 * Requirements covered:
 *   - 11.1 Deliver accepted messages (relay or direct MX).
 *   - 11.2 Reject (via NotConfiguredError) only when outbound is disabled or a
 *          relay-only mode has no relay configured.
 *   - 11.3 Set the envelope sender to the Sender_Mailbox `emailAddress`,
 *          independent of the header `From`.
 *   - 11.4 Surface delivery/connection failures as DeliveryError carrying the
 *          underlying failure reason.
 *
 * Env keys (consumed by the Next.js process):
 *   OUTBOUND_MODE      "auto" | "direct" | "relay" | "disabled"  (default "auto")
 *   MAIL_SERVER_HOSTNAME  EHLO/HELO name used for direct delivery (your mail host)
 *   SMTP_RELAY_HOST    relay hostname (relay mode)
 *   SMTP_RELAY_PORT    relay port, e.g. 587 (relay mode)
 *   SMTP_RELAY_USER    relay auth user (optional)
 *   SMTP_RELAY_PASS    relay auth password (optional)
 *   SMTP_RELAY_SECURE  "true" for implicit TLS (465), else STARTTLS
 *   DKIM_DOMAIN        DKIM signing domain (e.g. genuinesoftmart.store)
 *   DKIM_SELECTOR      DKIM selector (e.g. "mail")
 *   DKIM_PRIVATE_KEY   DKIM private key (PEM, or base64-encoded PEM)
 */

import nodemailer from "nodemailer";

/**
 * Thrown when outbound sending is not available — outbound is disabled, or a
 * relay-only mode has no relay configured. The send route maps this to HTTP 503
 * (Req 11.2). Raised before any SentEmail record is created.
 */
export class NotConfiguredError extends Error {
  constructor(message = "Outbound sending is not configured") {
    super(message);
    this.name = "NotConfiguredError";
  }
}

/**
 * Thrown when delivery fails (relay rejection or direct-MX connection failure).
 * The send route records this on the (already-persisted) SentEmail record as
 * `deliveryStatus: "failed"` with `failureReason` (Req 1.5, 11.4).
 */
export class DeliveryError extends Error {
  constructor(message = "Delivery failed") {
    super(message);
    this.name = "DeliveryError";
  }
}

/** Outbound mode from env, normalized. Defaults to "auto". */
export function getOutboundMode() {
  const raw = String(process.env.OUTBOUND_MODE || "auto").trim().toLowerCase();
  return ["auto", "direct", "relay", "disabled"].includes(raw) ? raw : "auto";
}

/**
 * Relay configuration is considered present when host + port are set. Auth
 * (user/pass) is optional and depends on whether the relay requires it.
 */
export function isRelayConfigured() {
  const host = process.env.SMTP_RELAY_HOST;
  const port = process.env.SMTP_RELAY_PORT;
  return Boolean(host && String(host).trim() && port && String(port).trim());
}

/**
 * The effective strategy that getTransport() will use right now.
 * @returns {"relay" | "direct" | "disabled"}
 */
export function getEffectiveMode() {
  const mode = getOutboundMode();
  if (mode === "disabled") return "disabled";
  if (mode === "relay") return "relay";
  if (mode === "direct") return "direct";
  // auto: prefer relay when configured, else direct.
  return isRelayConfigured() ? "relay" : "direct";
}

/**
 * Whether outbound sending can be attempted at all. Used by the send route to
 * decide between proceeding and returning 503 (Req 11.2).
 *
 * - disabled            → false
 * - relay (explicit)    → only when a relay is configured
 * - direct / auto       → true (direct MX delivery is always available)
 */
export function isOutboundConfigured() {
  const mode = getOutboundMode();
  if (mode === "disabled") return false;
  if (mode === "relay") return isRelayConfigured();
  return true;
}

// Memoized transport, keyed on the config signature so changed env rebuilds it.
let cachedTransport = null;
let cachedSignature = null;

function configSignature() {
  return [
    getEffectiveMode(),
    process.env.MAIL_SERVER_HOSTNAME,
    process.env.SMTP_RELAY_HOST,
    process.env.SMTP_RELAY_PORT,
    process.env.SMTP_RELAY_SECURE,
    process.env.SMTP_RELAY_USER,
    process.env.SMTP_RELAY_PASS,
  ].join("|");
}

/** Decode a DKIM private key that may be stored as raw PEM or base64-encoded PEM. */
function resolveDkimKey(raw) {
  if (!raw) return "";
  const val = String(raw).trim();
  if (val.includes("BEGIN") && val.includes("PRIVATE KEY")) return val;
  try {
    const decoded = Buffer.from(val, "base64").toString("utf8");
    if (decoded.includes("BEGIN") && decoded.includes("PRIVATE KEY")) return decoded;
  } catch {
    /* fall through */
  }
  return val;
}

/** Build the nodemailer `dkim` option from env, or null when not configured. */
function getDkimOptions() {
  const domainName = process.env.DKIM_DOMAIN;
  const keySelector = process.env.DKIM_SELECTOR;
  const privateKey = resolveDkimKey(process.env.DKIM_PRIVATE_KEY);
  if (!domainName || !keySelector || !privateKey) return null;
  return { domainName, keySelector, privateKey };
}

/**
 * Build (and memoize) the nodemailer transport for the effective mode.
 *
 * @throws {NotConfiguredError} when outbound is disabled or relay-only with no
 *   relay configured (Req 11.2).
 */
function getTransport() {
  const mode = getEffectiveMode();
  if (mode === "disabled") {
    throw new NotConfiguredError("Outbound sending is disabled");
  }
  if (mode === "relay" && !isRelayConfigured()) {
    throw new NotConfiguredError();
  }

  const signature = configSignature();
  if (cachedTransport && cachedSignature === signature) {
    return cachedTransport;
  }

  if (mode === "relay") {
    const user = process.env.SMTP_RELAY_USER;
    const pass = process.env.SMTP_RELAY_PASS;
    cachedTransport = nodemailer.createTransport({
      host: process.env.SMTP_RELAY_HOST,
      port: Number(process.env.SMTP_RELAY_PORT),
      secure: process.env.SMTP_RELAY_SECURE === "true",
      auth: user && pass ? { user, pass } : undefined,
    });
  } else {
    // Direct-to-MX: connect straight to the recipient's mail server. `name` is
    // the HELO/EHLO hostname — should resolve (PTR) to this server's IP for the
    // best chance of passing receiver checks.
    cachedTransport = nodemailer.createTransport({
      direct: true,
      name: process.env.MAIL_SERVER_HOSTNAME || undefined,
      // Be patient with slower MX servers; direct delivery has no retry queue.
      connectionTimeout: 30_000,
      greetingTimeout: 30_000,
      socketTimeout: 60_000,
    });
  }

  cachedSignature = signature;
  return cachedTransport;
}

/** Reset the memoized transport (test/maintenance helper). */
export function _resetTransport() {
  cachedTransport = null;
  cachedSignature = null;
}

/** Normalize a recipient field (string or array) into a flat array of strings. */
function toAddressList(value) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
}

/**
 * Deliver one message via the effective transport (relay or direct MX).
 *
 * The envelope sender (MAIL FROM) is set explicitly to `envelopeFrom` — the
 * Sender_Mailbox address — independent of the header `From` (Req 11.3).
 *
 * @param {object} message
 * @param {string} message.envelopeFrom Sender_Mailbox emailAddress (Req 11.3).
 * @param {string} [message.from] Header From (may carry a display name).
 * @param {string[]|string} [message.to]
 * @param {string[]|string} [message.cc]
 * @param {string[]|string} [message.bcc]
 * @param {string} [message.subject]
 * @param {string} [message.text]
 * @param {string} [message.html]
 * @param {Array<{filename: string, contentType: string, content: Buffer|string}>} [message.attachments]
 * @returns {Promise<{ messageId: string }>} resolves on acceptance.
 * @throws {NotConfiguredError} when outbound is unavailable (Req 11.2).
 * @throws {DeliveryError} when delivery fails (Req 11.4).
 */
export async function sendMail({
  envelopeFrom,
  from,
  to,
  cc,
  bcc,
  subject,
  text,
  html,
  attachments,
} = {}) {
  const transport = getTransport();

  const toList = toAddressList(to);
  const ccList = toAddressList(cc);
  const bccList = toAddressList(bcc);

  const mappedAttachments = (attachments || []).map((att) => ({
    filename: att.filename,
    contentType: att.contentType,
    content: att.content,
  }));

  const mailOptions = {
    from: from || envelopeFrom,
    to: toList,
    cc: ccList,
    bcc: bccList,
    subject,
    text,
    html,
    attachments: mappedAttachments,
    // Explicit SMTP envelope (Req 11.3): MAIL FROM = Sender_Mailbox address;
    // RCPT TO = union of all recipients including Bcc.
    envelope: {
      from: envelopeFrom,
      to: [...toList, ...ccList, ...bccList],
    },
  };

  // Sign with DKIM when configured (greatly improves deliverability, esp. direct).
  const dkim = getDkimOptions();
  if (dkim) mailOptions.dkim = dkim;

  try {
    const info = await transport.sendMail(mailOptions);
    return { messageId: info.messageId };
  } catch (err) {
    throw new DeliveryError(err && err.message ? err.message : String(err));
  }
}
