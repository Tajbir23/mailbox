import mongoose from "mongoose";

const IncomingEmailSchema = new mongoose.Schema(
  {
    mailboxId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mailbox",
      required: true,
      index: true,
    },
    from: {
      type: String,
      required: true,
    },
    to: {
      type: String,
      required: true,
    },
    subject: {
      type: String,
      default: "(No Subject)",
    },
    bodyHtml: {
      type: String,
      default: "",
    },
    bodyText: {
      type: String,
      default: "",
    },
    attachments: [
      {
        filename: String,
        contentType: String,
        size: Number,
        content: Buffer,
      },
    ],
    receivedAt: {
      type: Date,
      default: Date.now,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Per-user "delete from history" — hides the email for these users only.
    // The document itself is preserved so other shared users still see it.
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // Shared annotations: visible to anyone who can see this email
    tags: {
      type: [String],
      default: [],
    },
    comments: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        userName: { type: String, default: "" },
        text: { type: String, required: true, trim: true },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// Auto-delete emails older than 3 days (MongoDB TTL)
IncomingEmailSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 3 });

// Indexes for fast email retrieval and pagination at scale
IncomingEmailSchema.index({ mailboxId: 1, receivedAt: -1 });
IncomingEmailSchema.index({ mailboxId: 1, createdAt: -1 });
IncomingEmailSchema.index({ mailboxId: 1, isRead: 1 });
IncomingEmailSchema.index({ mailboxId: 1, deletedFor: 1 });
IncomingEmailSchema.index({ mailboxId: 1, tags: 1 });

export default mongoose.models.IncomingEmail || mongoose.model("IncomingEmail", IncomingEmailSchema);
