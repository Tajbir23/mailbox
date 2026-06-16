/**
 * Pure record-building helper for the outbound send pipeline.
 *
 * `buildSentEmailRecord` is PURE (no I/O, no DB writes, no env access): it takes
 * the already-validated/normalized inputs and produces both the persisted
 * `SentEmail` record shape and the `envelopeFrom` used by the delivery agent.
 * The send API route is responsible for persisting the record and invoking the
 * relay using these returned shapes.
 *
 * The single most important invariant (Property 1 / Req 1.2, 11.3): the sender
 * identity — both the persisted `from` header and the delivery `envelopeFrom` —
 * is ALWAYS the Sender_Mailbox `emailAddress`, regardless of any client-supplied
 * `payload.from`. There is no spoofing path.
 */

// Coerce an arbitrary value into an array (used for the attachment list).
function toList(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

// Byte size of an attachment's content Buffer/string, used as a fallback when
// no explicit numeric `size` is supplied.
function contentBytes(content) {
  if (Buffer.isBuffer(content)) return content.length;
  if (typeof content === "string") return Buffer.byteLength(content, "utf8");
  return 0;
}

/**
 * Map a single input attachment to its stored shape.
 *
 * Preserves the metadata fields `filename`, `contentType`, and `size` exactly
 * (Property 7 / Req 5.2) and retains the `content` Buffer for sent-history
 * storage per the design. When `size` is not an explicit finite number it is
 * derived from the content length so the stored size stays accurate.
 */
function toStoredAttachment(attachment) {
  const a = attachment && typeof attachment === "object" ? attachment : {};
  const size =
    typeof a.size === "number" && Number.isFinite(a.size)
      ? a.size
      : contentBytes(a.content);

  return {
    filename: a.filename,
    contentType: a.contentType,
    size,
    content: a.content,
  };
}

/**
 * Build the persisted `SentEmail` record shape and the delivery `envelopeFrom`.
 *
 * @param {object} args
 * @param {object} args.mailbox - the Sender_Mailbox (must carry `_id`, `emailAddress`).
 * @param {*} args.userId - the sending user's identifier.
 * @param {object} [args.payload] - the raw client payload (its `from` is IGNORED).
 * @param {{ to?: string[], cc?: string[], bcc?: string[] }} [args.normalizedRecipients]
 *        - the normalized recipient lists from `validateRecipients`.
 * @param {string} args.subject - the already-normalized subject.
 * @param {string} [args.bodyText] - plain-text body.
 * @param {string} [args.bodyHtml] - sanitized HTML body.
 * @param {Array} [args.attachments] - input attachments to store.
 * @param {*} [args.inReplyToEmailId] - source IncomingEmail id for replies.
 * @returns {{ record: object, envelopeFrom: string }}
 *          `record` is the persisted-record shape; `envelopeFrom` is the
 *          MAIL FROM the delivery agent must use (equal to mailbox.emailAddress).
 */
export function buildSentEmailRecord({
  mailbox,
  userId,
  payload,
  normalizedRecipients,
  subject,
  bodyText,
  bodyHtml,
  attachments,
  inReplyToEmailId,
} = {}) {
  // CRITICAL (Req 1.2, 11.3): the sender is always the mailbox address. Any
  // client-supplied `payload.from` is intentionally ignored — no spoofing.
  const from = mailbox?.emailAddress;
  const envelopeFrom = from;

  const recipients = normalizedRecipients || {};

  const record = {
    mailboxId: mailbox?._id,
    userId,
    from,
    to: Array.isArray(recipients.to) ? recipients.to : [],
    cc: Array.isArray(recipients.cc) ? recipients.cc : [],
    bcc: Array.isArray(recipients.bcc) ? recipients.bcc : [],
    subject,
    bodyHtml: typeof bodyHtml === "string" ? bodyHtml : "",
    bodyText: typeof bodyText === "string" ? bodyText : "",
    attachments: toList(attachments).map(toStoredAttachment),
    deliveryStatus: "queued",
    inReplyToEmailId: inReplyToEmailId || null,
  };

  return { record, envelopeFrom };
}
