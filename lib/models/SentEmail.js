import mongoose from "mongoose";

const SentEmailSchema = new mongoose.Schema(
  {
    mailboxId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mailbox",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    }, // sending user (Req 8.1)
    from: {
      type: String,
      required: true,
    }, // Sender_Mailbox.emailAddress (Req 1.2)
    to: {
      type: [String],
      default: [],
    }, // normalized, lowercased (Req 3.5)
    cc: {
      type: [String],
      default: [],
    },
    bcc: {
      type: [String],
      default: [],
    },
    subject: {
      type: String,
      default: "(No Subject)",
    }, // (Req 4.3)
    bodyHtml: {
      type: String,
      default: "",
    }, // sanitized (Req 4.4)
    bodyText: {
      type: String,
      default: "",
    },
    attachments: [
      {
        filename: String,
        contentType: String,
        size: Number,
        content: Buffer, // stored for sent history / resend (Req 5.2)
      },
    ],
    deliveryStatus: {
      type: String,
      enum: ["queued", "sent", "failed"],
      default: "queued",
      index: true,
    }, // (Req 1.3–1.5)
    failureReason: {
      type: String,
      default: "",
    }, // (Req 1.5, 11.4)
    inReplyToEmailId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IncomingEmail",
      default: null,
    }, // (Req 6.4)
    messageId: {
      type: String,
      default: "",
    }, // relay-assigned id (Req 10.1 correlation)
    sentAt: {
      type: Date,
      default: null,
    }, // set when status -> sent
  },
  { timestamps: true } // createdAt = queued time
);

// Compound index for the sent list, newest first (Req 8.2, 8.4)
SentEmailSchema.index({ mailboxId: 1, createdAt: -1 });

// DELIBERATE DIVERGENCE FROM IncomingEmail: NO TTL index here.
// IncomingEmail carries a 3-day TTL (expireAfterSeconds: 60*60*24*3), but sent
// history must PERSIST indefinitely, so SentEmail intentionally omits any TTL.
// Any future code that writes SentEmail (e.g. from the smtp-server process) must
// NOT add a TTL index to this schema.

export default mongoose.models.SentEmail || mongoose.model("SentEmail", SentEmailSchema);
