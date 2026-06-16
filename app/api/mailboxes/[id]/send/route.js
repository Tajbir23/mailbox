import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Mailbox from "@/lib/models/Mailbox";
import Domain from "@/lib/models/Domain";
import IncomingEmail from "@/lib/models/IncomingEmail";
import SentEmail from "@/lib/models/SentEmail";
import {
  validateRecipients,
  normalizeSubject,
  isContentEmpty,
  exceedsSizeLimit,
  prefixSubject,
  MAX_RECIPIENTS,
} from "@/lib/send-validation";
import { sanitizeOutboundHtml } from "@/lib/html-sanitize";
import { buildSentEmailRecord } from "@/lib/send-record";
import {
  checkSendLimit,
  getUserMax,
  getMailboxMax,
  getWindowMs,
  userToken,
  mailboxToken,
} from "@/lib/send-rate-limit";
import {
  isOutboundConfigured,
  sendMail,
  NotConfiguredError,
  DeliveryError,
} from "@/lib/mailer";
import { emitEmailStatus } from "@/lib/emit-bridge";

export const dynamic = "force-dynamic";

// Coerce an arbitrary value into an array (recipient lists / attachments).
function toList(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

// True when a recipient input list is effectively empty (no entries).
function isEmptyList(value) {
  return toList(value).length === 0;
}

/**
 * POST /api/mailboxes/[id]/send — compose, persist, and deliver an outbound email.
 *
 * Orchestrates the full send pipeline behind the ordered validation gate from the
 * design ("Validation Flow Ordering"): auth → access → mailbox state → domain
 * verified → relay configured → rate limits → recipients → content/size, then
 * persist `queued`, deliver via the relay, transition to `sent`/`failed`, and fire
 * the real-time `email-status` event.
 *
 * Accepts `application/json` or `multipart/form-data` (a JSON `payload` part plus
 * `attachments` file parts).
 */
export async function POST(request, { params }) {
  try {
    // --- 1. Authentication (Req 2.1) ---
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    await dbConnect();
    const { id } = params;

    // --- 2. Mailbox access: owner or shared (Req 2.2) ---
    const mailbox = await Mailbox.findOne({
      _id: id,
      $or: [{ ownerId: userId }, { sharedWith: userId }],
    }).lean();
    if (!mailbox) {
      return NextResponse.json(
        { error: "Mailbox not found or access denied" },
        { status: 404 }
      );
    }

    // --- 3. Mailbox active state (Req 2.3) ---
    if (mailbox.isActive === false) {
      return NextResponse.json({ error: "Mailbox is inactive" }, { status: 403 });
    }

    // --- 4. Sending domain verified (Req 2.4) ---
    const domain = await Domain.findById(mailbox.domainId).lean();
    if (!domain || domain.verificationStatus !== "verified") {
      return NextResponse.json(
        { error: "Sending domain is not verified" },
        { status: 403 }
      );
    }

    // --- 5. Outbound configured (Req 11.2) — reject before any record is created.
    // With OUTBOUND_MODE=auto/direct this is always true (direct MX delivery),
    // so sending works out of the box without an external relay. ---
    if (!isOutboundConfigured()) {
      return NextResponse.json(
        { error: "Outbound sending is not configured" },
        { status: 503 }
      );
    }

    // --- 6. Rate limits (Req 9.1, 9.2, 9.3) ---
    // Check the per-user limit first; if blocked, return without consuming the
    // per-mailbox window (avoids double-consume on the cheaper guard).
    const windowMs = getWindowMs();
    const userCheck = checkSendLimit(userToken(userId), {
      limit: getUserMax(),
      windowMs,
    });
    if (!userCheck.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: userCheck.retryAfter },
        { status: 429 }
      );
    }
    const mailboxCheck = checkSendLimit(mailboxToken(id), {
      limit: getMailboxMax(),
      windowMs,
    });
    if (!mailboxCheck.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: mailboxCheck.retryAfter },
        { status: 429 }
      );
    }

    // --- Parse the request body (JSON or multipart/form-data) ---
    const contentType = request.headers.get("content-type") || "";
    let payload = {};
    let uploadedAttachments = [];
    try {
      if (contentType.includes("multipart/form-data")) {
        const form = await request.formData();
        const payloadRaw = form.get("payload");
        if (typeof payloadRaw === "string" && payloadRaw.length > 0) {
          payload = JSON.parse(payloadRaw);
        }
        for (const entry of form.getAll("attachments")) {
          if (
            entry &&
            typeof entry === "object" &&
            typeof entry.arrayBuffer === "function"
          ) {
            const buf = Buffer.from(await entry.arrayBuffer());
            uploadedAttachments.push({
              filename: entry.name,
              contentType: entry.type,
              content: buf,
              size: entry.size,
            });
          }
        }
      } else {
        payload = await request.json();
      }
    } catch (parseErr) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!payload || typeof payload !== "object") payload = {};

    // --- 8 (partial). Mode + source email (load before recipient validation so a
    // reply can default its To to the source sender) ---
    const mode = ["new", "reply", "forward"].includes(payload.mode)
      ? payload.mode
      : "new";

    let source = null;
    if (mode === "reply" || mode === "forward") {
      if (!payload.sourceEmailId) {
        return NextResponse.json(
          { error: "Source email is required for reply/forward" },
          { status: 400 }
        );
      }
      source = await IncomingEmail.findOne({
        _id: payload.sourceEmailId,
        mailboxId: id,
      }).lean();
      if (!source) {
        return NextResponse.json(
          { error: "Source email not found" },
          { status: 404 }
        );
      }
    }

    // Effective recipient inputs. Reply defaults the To to the original sender
    // when the client supplied none (Req 6.1 server-side authority).
    let toInput = payload.to;
    if (mode === "reply" && isEmptyList(toInput)) {
      toInput = source.from ? [source.from] : [];
    }

    // --- 7. Recipient validation (Req 3.1, 3.2, 3.4, 3.5) ---
    if (isEmptyList(toInput)) {
      return NextResponse.json(
        { error: "At least one recipient is required" },
        { status: 400 }
      );
    }
    const normalizedRecipients = validateRecipients({
      to: toInput,
      cc: payload.cc,
      bcc: payload.bcc,
    });
    if (normalizedRecipients.invalid.length > 0) {
      return NextResponse.json(
        {
          error: "Invalid recipient address(es)",
          invalid: normalizedRecipients.invalid,
        },
        { status: 400 }
      );
    }
    if (normalizedRecipients.to.length === 0) {
      return NextResponse.json(
        { error: "At least one recipient is required" },
        { status: 400 }
      );
    }
    const totalRecipients =
      normalizedRecipients.to.length +
      normalizedRecipients.cc.length +
      normalizedRecipients.bcc.length;
    if (totalRecipients > MAX_RECIPIENTS) {
      return NextResponse.json(
        { error: "Recipient limit of 50 exceeded" },
        { status: 400 }
      );
    }

    // --- 8 (cont.). Subject + body derivation for reply/forward ---
    let inReplyToEmailId = null;
    let bodyText = typeof payload.bodyText === "string" ? payload.bodyText : "";
    let bodyHtml = typeof payload.bodyHtml === "string" ? payload.bodyHtml : "";
    let finalSubject;
    // Subject used for the empty-content check: the raw provided subject for new
    // messages (so the "(No Subject)" default never counts as content), or the
    // derived subject for reply/forward (always non-empty, Req 6.2/7.1).
    let contentSubject;

    if (mode === "reply") {
      const baseSubject = payload.subject || source.subject;
      finalSubject = prefixSubject(normalizeSubject(baseSubject), "Re: ");
      contentSubject = finalSubject;
      inReplyToEmailId = source._id; // Req 6.4
    } else if (mode === "forward") {
      const baseSubject = payload.subject || source.subject;
      finalSubject = prefixSubject(normalizeSubject(baseSubject), "Fwd: ");
      contentSubject = finalSubject;
      // Carry over the original body when the client didn't provide one (Req 7.2).
      if (!bodyText && source.bodyText) bodyText = source.bodyText;
      if (!bodyHtml && source.bodyHtml) bodyHtml = source.bodyHtml;
    } else {
      finalSubject = normalizeSubject(payload.subject);
      contentSubject = payload.subject;
    }

    // Sanitize the outbound HTML once; the same string is stored and delivered (Req 4.4).
    bodyHtml = sanitizeOutboundHtml(bodyHtml);

    // Merge forwarded source attachments (with content buffers re-fetched
    // server-side) with any uploaded attachments (Req 7.3, 5.1).
    let attachments = uploadedAttachments;
    if (mode === "forward" && Array.isArray(source.attachments)) {
      attachments = [...source.attachments, ...uploadedAttachments];
    }

    // --- 9. Empty-content rejection (Req 4.1) ---
    if (isContentEmpty({ subject: contentSubject, bodyText, bodyHtml })) {
      return NextResponse.json(
        { error: "Message content is required" },
        { status: 400 }
      );
    }

    // --- 10. Total size limit (Req 4.5, 5.3) ---
    if (exceedsSizeLimit({ subject: finalSubject, bodyText, bodyHtml, attachments })) {
      return NextResponse.json(
        { error: "Message exceeds the 25MB size limit" },
        { status: 413 }
      );
    }

    // --- 11. Build the record (sender identity forced to mailbox address) ---
    const { record, envelopeFrom } = buildSentEmailRecord({
      mailbox,
      userId,
      payload,
      normalizedRecipients,
      subject: finalSubject,
      bodyText,
      bodyHtml,
      attachments,
      inReplyToEmailId,
    });

    // Persist with deliveryStatus "queued" before handing off to the relay (Req 1.3, 8.1).
    const doc = await SentEmail.create(record);

    // --- 12. Deliver inline, then transition to the terminal state + emit ---
    try {
      const result = await sendMail({
        envelopeFrom,
        from: envelopeFrom,
        to: doc.to,
        cc: doc.cc,
        bcc: doc.bcc,
        subject: doc.subject,
        text: doc.bodyText,
        html: doc.bodyHtml,
        attachments,
      });
      doc.deliveryStatus = "sent"; // Req 1.4
      doc.sentAt = new Date();
      doc.messageId = result.messageId || "";
      await doc.save();
    } catch (deliveryErr) {
      // A delivery failure is NOT a request failure — the queued record exists,
      // so we record the reason and still return 202 (Req 1.5, 11.4).
      doc.deliveryStatus = "failed";
      doc.failureReason =
        deliveryErr instanceof DeliveryError ||
        deliveryErr instanceof NotConfiguredError
          ? deliveryErr.message
          : deliveryErr?.message || "Delivery failed";
      await doc.save();
    }

    // Fire the real-time terminal-status event (Req 10.2). Best-effort; never throws.
    await emitEmailStatus({
      mailboxId: id,
      userId,
      payload: {
        sentEmailId: doc._id,
        mailboxId: id,
        deliveryStatus: doc.deliveryStatus,
        failureReason: doc.failureReason || "",
        subject: doc.subject,
        to: doc.to,
        sentAt: doc.sentAt,
      },
    });

    // --- Response: identify the record + its current status (Req 10.1) ---
    return NextResponse.json(
      {
        sentEmail: {
          _id: doc._id,
          mailboxId: doc.mailboxId,
          from: doc.from,
          to: doc.to,
          cc: doc.cc,
          bcc: doc.bcc,
          subject: doc.subject,
          deliveryStatus: doc.deliveryStatus,
          failureReason: doc.failureReason || "",
          messageId: doc.messageId || "",
          sentAt: doc.sentAt,
        },
      },
      { status: 202 }
    );
  } catch (err) {
    console.error(err);
    // NotConfiguredError is guarded at step 5; if one somehow reaches here, map
    // it to 503 to stay consistent with the contract.
    if (err instanceof NotConfiguredError) {
      return NextResponse.json(
        { error: "Outbound sending is not configured" },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
